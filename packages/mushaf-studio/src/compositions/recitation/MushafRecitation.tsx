import {MushafLine, MushafLineWindow, wordAt} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useMemo} from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {followsHostAudio} from '../../audio/host';
import {volumeAt} from '../../audio/volume';
import {backgroundFor, groundFor} from '../../background/compat';
import {Jadwal} from '../../background/Jadwal';
import {MushafBackground} from '../../background/MushafBackground';
import {MushafStudioError} from '../../errors';
import {
  glossVisibilityFrom,
  InterlinearGlosses,
  interlinearExtraHeight,
  interlinearFontSize,
  interlinearLineShift,
  interlinearRows,
  interlinearTop,
} from '../../interlinear';
import {droppedSplitsError, droppedSplitsWarning, wordStarts} from '../../lines';
import {
  audioClock,
  clipAyahKey,
  clipTimeline,
  isIdentityTimeline,
  type MemorizeClip,
  RepeatCounter,
  scheduleForClips,
  scrollTargetPosition,
} from '../../memorize';
import {MushafTitleOverlay, showsCorner, showsIntro} from '../../overlay';
import {
  animationFrom,
  effectiveNeighbourOpacity,
  fontPropsFrom,
  frameGeometry,
  inkTintFor,
  legibleAccent,
  markerIds,
  metalOf,
  readableInk,
  studioFontFamily,
  studioFontStyle,
  tempoFrames,
  themeSelectionFrom,
  windowScrollTiming,
  wordEmphasis,
  wordSpanIndex,
  wordSpans,
  wordStyleFrom,
} from '../../schema';
import {SINE} from '../../schema/tokens';
import {MushafStudioPanel} from '../../studio';
import {useInStudio} from '../../studio/environment';
import {GlossStrip, glossStripState, TranslationStack} from '../../translations';
import type {ResolvedRecitation} from '../../types';
import {endCardFrames} from '../extras';
import {useStudioFonts} from '../fonts';
import {
  CompositionAudio,
  CompositionEndCard,
  drawnTranslationLayers,
  LegendBand,
  legendReserve,
  StudioWarnings,
  translationsOf,
  useTranslationLayers,
  volumeCurveFor,
  type WithPanelOption,
} from '../parts';
import {
  blockGeometry,
  glossBlockStyle,
  headerCount,
  linesBlockStyle,
  recordingUrl,
  translationBlockStyle,
  translationLayoutFor,
} from '../shared';
import {passageSpan} from '../timings';
import type {MushafRecitationProps} from './schema';
import {windowScrollStarts} from './scroll';
import {
  ayahChanges,
  firstAppearance,
  linesEndFrame,
  linesPresence,
  oneLinePlan,
  recitationEndSeconds,
  shownAyahAt,
} from './transitions';

/**
 * The flagship composition: the printed lines of a recited passage follow the audio, one line at a
 * time or through a line window, the recitation marked by one quiet device (`highlight`: the ink
 * filling in, a tint or a faint wash, eased in and out), an ayah translation and a
 * word gloss (in a strip, or under each printed word), the surah's header lines before ayah 1 and a
 * title card and corner label when asked, over its background (`background`: a colour, gradient,
 * image or looping video), with up to three
 * translations stacked (centred, at most half the Arabic, changing after each ayah's last word),
 * the tajweed legend in a band the lines are fitted around, and an end card after the lines' hold
 * and fade when asked, the audio normalised and faded as `audio` says, and (in the Studio) the doubtful words
 * marked, the fonts, audio and dropped-splits warnings, and the Mushaf panel docked. Outside the
 * Studio's preview, a `resolved.droppedSplits` that is not empty throws `BAD_LINE_SPLIT`
 * (`droppedSplitsError()`), so the Studio's in-browser render refuses those splits too.
 *
 * Under a memorisation mode each ayah plays `memorize.repeat` times on the clip timeline (one
 * `<Audio>` per clip, the lines and words timed per clip, the window scrolling back to the ayah's
 * first line for the next play, a "2 / 3" counter in a corner), and the blank modes hide the words
 * as `memorizeOpacity()` says (revealed over 7 frames at their own start, hidden again over 12 as a
 * play starts), their interlinear labels with them. `'first-letters'` cannot cut a glyph-font word
 * into letters: here it is `'blank-upcoming'` with a faint ghost (0.14, 0.20 on a dark ground).
 *
 * Every change is late, never early (render-design.md 4.3, 5.2): one line at a time, consecutive
 * Sequences overlap by the staggered dissolve after the outgoing line's last word; a window fades
 * in over `windowIn`, scrolls after each line's last word (`anchor: 'start'`), holds `endHold`
 * after the last word and fades over `endFade` before the end card. With the intro card on, the
 * recording starts `resolved.introDelaySeconds` later and the lines come in after the card.
 */
export const MushafRecitation: React.FC<WithPanelOption<MushafRecitationProps>> = ({panel = true, ...props}) => {
  const {audioFile, fonts, layout, animation, highlight, memorize, text, review, overlay, legend, endCard, audio} =
    props;
  const {width, height, fps, durationInFrames, id} = useVideoConfig();
  const frame = useCurrentFrame();
  const isStudio = useInStudio();
  // Under hostAudio the template plays the recording: the composition plays none of its own.
  const ownAudio = audioFile !== '' && !followsHostAudio(props);
  const resolved = props.resolved as (ResolvedRecitation & {readonly clips?: readonly MemorizeClip[]}) | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafRecitation: `resolved` is null. calculateMetadata fills it in: pass calculateMushafRecitationMetadata to <Composition calculateMetadata>, or resolve the props with resolveRecitation() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  // Only the Studio's preview leaves out the splits that no longer fit. calculateMetadata() cannot
  // tell the preview from the Studio's in-browser render (both see isStudio without isRendering), so
  // the render refuses them here, where useInStudio() can.
  const refused = isStudio ? null : droppedSplitsError(resolved.droppedSplits ?? []);
  if (refused) throw refused;
  const {lines, schedule, timings} = resolved;
  // The book serif and the Arabic labels: no frame is taken before they are in.
  useStudioFonts();
  const translationLayers = useTranslationLayers(text, translationsOf(resolved));
  // The clip timeline calculateMetadata laid out; rebuilt (the same pure function) for a `resolved` made without it.
  const clips = resolved.clips ?? clipTimeline(timings, memorize);
  const identity = isIdentityTimeline(clips);
  const repeats = clips.reduce((most, clip) => Math.max(most, clip.repetition), 1);
  const toAudio = audioClock(clips);
  // The lines hold after the last word, then fade; the end card (if any) starts once they are gone.
  // A rosette the timings time as a word of its own is not a word: the hold counts from the last word.
  const markers = markerIds(lines);
  const endSeconds = recitationEndSeconds(timings, clips, markers);
  const linesEnd = linesEndFrame(endSeconds, animation.tempo, fps);
  const cardFrames = endCardFrames(endCard, fps);
  const contentFrames = Math.max(1, durationInFrames - cardFrames);
  // The recording starts after the intro card: its audio, faded in from there, and its gain to the end of the lines.
  const introDelay = resolved.introDelaySeconds ?? 0;
  const delayFrames = Math.round(introDelay * fps);
  const curve = volumeCurveFor(audio, resolved.audio, Math.max(1, contentFrames - delayFrames), fps);
  const seconds = frame / fps;
  // The second of the recording being heard: the composition's own when ayahs play once.
  const now = toAudio(seconds);
  // The word being heard drives the gloss whatever the highlight does; the lines are told about it
  // only when something follows the recitation.
  const heard = wordAt(timings, now);
  const activeWordId = highlight.mode === 'none' ? null : heard;

  // A legend band is kept clear of the lines: they are fitted and centred in the rest of the frame.
  const furniture = frameGeometry(width, height);
  const theme = themeSelectionFrom(props.theme, props.customTheme);
  const plainLineBox = blockGeometry(layout, {width, height}).lineHeight;
  const labelFamily = studioFontFamily(overlay.font, 'label');
  const jadwal = layout.frame === 'hairline';
  const reserve = legendReserve(legend, theme, {
    width,
    height,
    lineHeight: plainLineBox,
    fontFamily: labelFamily,
    jadwal,
  });
  // Interlinear glosses: every line slot grows by the label rows, and the line moves up into it.
  const glossRows =
    text.glossPosition === 'interlinear' ? interlinearRows(resolved.gloss, resolved.transliteration) : 0;
  const plainGeometry = blockGeometry(layout, {width, height}, {reserve});
  const labelSize = interlinearFontSize(text.glossSize, plainGeometry.fontSize);
  const extraLineHeight = interlinearExtraHeight(glossRows, labelSize);
  const geometry =
    extraLineHeight === 0 ? plainGeometry : blockGeometry(layout, {width, height}, {extraLineHeight, reserve});
  const lineShift = interlinearLineShift(extraLineHeight);
  const {fontSize, lineHeight, slots} = geometry;
  const headers = headerCount(lines);
  // The slots in composition time: the schedule itself, or laid on the clips when ayahs repeat.
  const timeline = scheduleForClips(schedule, lines, clips, headers);

  const fontSetup = fontPropsFrom(fonts, lines[0]?.fontSet ?? 'qpc-v4', staticFile);
  const ground = groundFor(props.background, layout);
  const painted = backgroundFor(props.background, layout).kind;
  const overImage = painted === 'image' || painted === 'video';
  // Translation, gloss and label colours as drawn: one under 4.5:1 on the ground gives way to a muted ink.
  const readable = (color: string): string => readableInk(color, layout.color, ground);
  const shownOverlay = {...overlay, color: readable(overlay.color)};
  const inkTint = inkTintFor(highlight, theme, ground);
  // The marks are the word style's; `activeWordId` only names the word (`data-active`) for custom CSS.
  const activeProps = inkTint === undefined ? {activeWordId} : {activeWordId, inkTint};
  const starts = wordStarts(timings);
  // The word spans of the marks: the gloss strip changes at each, the interlinear labels follow them.
  // A rosette the timings time as a word of its own is never a span: the ayah's last word holds to the release.
  const spans = useMemo(
    () => wordSpans(timings, {occurrence: highlight.occurrence, markers}),
    [timings, highlight.occurrence, markers],
  );
  const spanIndex = useMemo(() => wordSpanIndex(spans), [spans]);
  const wordStyleFor = (sequenceFrom: number) =>
    wordStyleFrom({
      highlight,
      review,
      doubtful: resolved.doubtful,
      timingsIndex: starts,
      timings,
      isStudio,
      sequenceFrom,
      audioTime: toAudio,
      memorize: {settings: memorize, clips},
      theme,
      ink: layout.color,
      ground,
      tempo: animation.tempo,
      markers,
    });

  // The ayah on screen changes after the outgoing ayah's last word, by a dissolve: the translation
  // over `translationDissolve`, the corner number over `labelChange` from the same frame.
  const changes = useMemo(
    () =>
      ayahChanges({
        timings,
        clips,
        fps,
        leadInSeconds: animation.leadInSeconds,
        tempo: animation.tempo,
        occurrence: highlight.occurrence,
      }),
    [timings, clips, fps, animation.leadInSeconds, animation.tempo, highlight.occurrence],
  );
  const shown = shownAyahAt(changes, frame);
  const ayahKey = shown.key;
  const span = passageSpan(timings);
  // The lines come in once the intro card has gone: it adds its time before the recording, except
  // under hostAudio, where the template's track decides and the card covers the start instead.
  const cardAddsTime = showsIntro(overlay.title) && !followsHostAudio(props);
  const earliest = cardAddsTime ? Math.round(overlay.introSeconds * fps) : 0;
  const inputs = {
    timeline,
    lines,
    timings,
    clips,
    fps,
    leadInSeconds: animation.leadInSeconds,
    occurrence: highlight.occurrence,
  };

  const cut = animation.lines === 'cut';
  const windowIn = cut ? 0 : tempoFrames('windowIn', animation.tempo, fps);
  const endFade = cut ? 0 : tempoFrames('endFade', animation.tempo, fps);
  // When the lines first appear: the window's frame, or the first line's in one-line mode.
  let appear = firstAppearance({
    firstStart: timeline[0]?.start ?? 0,
    leadInSeconds: animation.leadInSeconds,
    fps,
    entranceFrames: windowIn,
    earliest,
  });
  let linesBlock: React.ReactNode;
  if (layout.visibleLines === 0) {
    // One Sequence per slot in one line box, overlapping so the staggered dissolve runs between
    // them: the outgoing line leaves after its last word, the incoming one settles before its first.
    const plans = oneLinePlan({
      ...inputs,
      motion: animation.lines,
      tempo: animation.tempo,
      earliest,
      endSeconds,
    });
    appear = plans[0]?.from ?? appear;
    linesBlock = plans.map((plan) => {
      const current = timeline[plan.slot]!;
      const line = lines[current.index]!;
      const motion = animationFrom(animation, {
        fontSize,
        enterFrames: plan.enterFrames,
        exitFrames: plan.exitFrames,
        ...(plan.first ? {enterEasing: SINE} : {}),
      });
      return (
        <Sequence
          // A line comes back for each play of its ayah: one Sequence per slot of the timeline, named by when it starts.
          key={`${current.index}@${current.start}`}
          from={plan.from}
          durationInFrames={plan.durationInFrames}
          premountFor={fps}
          name={`p${line.page} l${line.line} (${line.words[0]?.id ?? line.type})`}
        >
          <MushafLine
            line={line}
            fontSize={fontSize}
            lineHeight={lineHeight}
            wordStyle={wordStyleFor(plan.from)}
            {...(lineShift ? {style: lineShift} : {})}
            {...activeProps}
            {...(plan.enterFrames > 0 ? {enter: motion.enter} : {})}
            {...(plan.exitFrames > 0 ? {exit: motion.exit} : {})}
            {...fontSetup.props}
          />
        </Sequence>
      );
    });
  } else {
    // One window for the passage, faded in over `windowIn` with its first line in place. Each
    // scroll starts once the outgoing line's last word has been recited (`anchor: 'start'`), and is
    // over `leadInSeconds` before the incoming line's first word when the pause allows it: the word
    // being heard never leaves the centre slot. It holds after the last word, then fades out.
    const windowLines = schedule.map((current) => lines[current.index]!);
    const from = appear;
    const scrollTiming = windowScrollTiming(animation, fps);
    const steps = windowScrollStarts({
      ...inputs,
      scrollFrames: scrollTiming.getDurationInFrames({fps}),
      appearFrame: from,
    }).map((step) => step - from);
    const motion = animationFrom(animation, {
      fontSize,
      enterFrames: windowIn,
      exitFrames: tempoFrames('endFade', animation.tempo, fps),
      enterEasing: SINE,
    });
    // When ayahs repeat, the current line goes back to the ayah's first line for the next play:
    // the window is given its position, from the timeline's slots and the window line each one is.
    const windowIndex = new Map(schedule.map((current, j) => [current.index, j]));
    const scroll = identity
      ? {steps, scrollTiming, anchor: 'start' as const}
      : {
          position: scrollTargetPosition({
            frame: frame - from,
            fps,
            steps,
            targets: timeline.map((current) => windowIndex.get(current.index) ?? 0),
            timing: scrollTiming,
            anchor: 'start',
          }),
        };
    linesBlock = (
      <Sequence
        from={from}
        durationInFrames={Math.max(1, linesEnd - from)}
        premountFor={fps}
        name={`${windowLines.length} lines, ${slots} at once`}
      >
        <MushafLineWindow
          lines={windowLines}
          {...scroll}
          visibleLines={slots}
          neighbourOpacity={effectiveNeighbourOpacity(layout.neighbourOpacity, highlight, theme)}
          fontSize={fontSize}
          lineHeight={lineHeight}
          wordStyle={wordStyleFor(from)}
          {...(lineShift ? {lineStyle: () => lineShift} : {})}
          {...activeProps}
          {...motion}
          {...fontSetup.props}
        />
      </Sequence>
    );
  }
  if (glossRows > 0) {
    linesBlock = (
      <InterlinearGlosses
        gloss={resolved.gloss}
        transliteration={resolved.transliteration}
        activeWordId={activeWordId}
        activeColor={highlight.mode === 'none' ? undefined : legibleAccent(highlight.color, ground)}
        emphasisOf={(id) => {
          const span = spanIndex.get(id);
          return span === undefined ? 0 : wordEmphasis(span, now);
        }}
        // A label shows what its word shows: a word a blank mode hides takes its gloss with it.
        visibilityOf={glossVisibilityFrom({memorize, clips, timings, starts, activeWordId, seconds, now})}
        fontFamily={studioFontFamily(text.glossFont, 'gloss')}
        fontSize={labelSize}
        color={readable(text.glossColor)}
        top={interlinearTop(lineHeight, extraLineHeight)}
      >
        {linesBlock}
      </InterlinearGlosses>
    );
  }

  // The translation comes and goes with the lines: in with their first appearance, out with their end fade.
  const presence = linesPresence(frame, {appear, windowIn, end: linesEnd, endFade});
  const showTranslation = translationLayers.length > 0 && text.translationPosition !== 'none';
  const showGloss = text.glossPosition === 'strip' && (resolved.gloss !== null || resolved.transliteration !== null);
  const glossFace = studioFontStyle(text.glossFont, 'gloss');
  const label = shownAyahAt(changes, frame, tempoFrames('labelChange', animation.tempo, fps));
  const metal = metalOf({theme: props.theme, customTheme: props.customTheme, ground});
  // The translation is credited once: on the intro card, or in the end card's credits without one.
  const translationName = showTranslation ? (translationLayers[0]?.translation.meta.name ?? null) : null;
  const introCard = showsIntro(overlay.title);
  const audioSrc = recordingUrl(audioFile, resolved, staticFile);
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
        layout={layout}
      />
      {jadwal && <Jadwal metal={metal} ground={ground} />}
      {ownAudio &&
        identity &&
        (delayFrames > 0 ? (
          // The recording starts after the intro card.
          <Sequence from={delayFrames} name="Recitation" layout="none">
            <CompositionAudio
              src={audioSrc}
              trimBefore={Math.round(resolved.audioOffsetSeconds * fps)}
              volume={(f) => volumeAt(f, curve)}
            />
          </Sequence>
        ) : (
          <CompositionAudio
            src={audioSrc}
            trimBefore={Math.round(resolved.audioOffsetSeconds * fps)}
            volume={(f) => volumeAt(f, curve)}
          />
        ))}
      {ownAudio &&
        !identity &&
        clips.map((clip) => {
          // Frames of the file: the composition's own offset into the recording, then the clip's
          // range; the clip's times are the composition's, the intro delay taken back off.
          const trimBefore = Math.round((resolved.audioOffsetSeconds + clip.audioFrom - introDelay) * fps);
          const trimAfter = Math.round((resolved.audioOffsetSeconds + clip.audioTo - introDelay) * fps);
          const from = Math.round(clip.compositionFrom * fps);
          return (
            <Sequence
              key={`${clipAyahKey(clip)}/${clip.repetition}`}
              from={from}
              durationInFrames={Math.max(1, trimAfter - trimBefore)}
              name={`Ayah ${clipAyahKey(clip)} (${clip.repetition}/${repeats})`}
            >
              {/* The same gain in every clip; the fades are the composition's, from the recording's start to the end of the lines. */}
              <CompositionAudio
                src={audioSrc}
                trimBefore={trimBefore}
                trimAfter={trimAfter}
                volume={(f) => volumeAt(from - delayFrames + f, curve)}
              />
            </Sequence>
          );
        })}
      <div data-mushaf-block="Mushaf lines" style={linesBlockStyle(geometry, layout)}>
        {linesBlock}
      </div>
      {showTranslation && (
        <div data-mushaf-block="Translation" style={translationBlockStyle(geometry, layout, text, height)}>
          <TranslationStack
            layers={drawnTranslationLayers(translationLayers, {ink: layout.color, ground, glyphSize: fontSize})}
            ayahKey={ayahKey}
            outgoing={shown.outgoing ? {ayahKey: shown.outgoing.key, opacity: shown.outgoing.opacity} : null}
            textOpacity={shown.opacity}
            opacity={presence}
            layout={translationLayoutFor(geometry)}
            ruleThickness={Math.max(1, furniture.unit)}
          />
        </div>
      )}
      {showGloss && (
        <div data-mushaf-block="Gloss" style={glossBlockStyle(geometry, layout, text)}>
          <GlossStrip
            translation={resolved.gloss}
            transliteration={resolved.transliteration}
            {...glossStripState(spans, now, fps)}
            fps={fps}
            fontFamily={glossFace.fontFamily}
            fontSize={text.glossSize}
            color={readable(text.glossColor)}
            // `auto`: EB Garamond 400 italic.
            {...(glossFace.fontStyle === undefined
              ? {}
              : {style: {fontStyle: glossFace.fontStyle, fontWeight: glossFace.fontWeight}})}
          />
        </div>
      )}
      <MushafTitleOverlay
        overlay={shownOverlay}
        surah={span.from.surah}
        fromAyah={span.from.ayah}
        toSurah={span.to.surah}
        toAyah={span.to.ayah}
        ayahKey={label.key}
        ayahChange={label}
        firstWordSeconds={timings.ayat[0]!.words?.[0]?.start ?? timings.ayat[0]!.start}
        addsTime={cardAddsTime}
        background={ground}
        overImage={overImage}
        jadwal={jadwal}
        tempo={animation.tempo}
        fontSize={fontSize}
        lineHeight={lineHeight}
        width={geometry.measure}
        metal={metal}
        translationName={translationName}
        fontProps={fontSetup.props}
      />
      <RepeatCounter
        clips={clips}
        repeats={repeats}
        seconds={seconds}
        overlay={shownOverlay}
        labelShown={showsCorner(overlay.title)}
        tempo={animation.tempo}
        jadwal={jadwal}
      />
      <LegendBand
        legend={legend}
        theme={theme}
        fontFamily={labelFamily}
        color={layout.color}
        width={width}
        height={height}
        lineHeight={plainLineBox}
        jadwal={jadwal}
      />
      <CompositionEndCard
        endCard={endCard}
        content={resolved.endCard}
        timings={timings}
        translations={translationLayers.map((layer) => layer.translation)}
        translationCredited={introCard}
        reciter={overlay.reciter}
        from={Math.min(linesEnd, contentFrames)}
        durationInFrames={cardFrames}
        font={overlay.font}
        color={layout.color}
        background={ground}
        metal={metal}
        measure={geometry.measure}
        glyphSize={fontSize}
        lineHeight={lineHeight}
        fontProps={fontSetup.props}
        width={width}
        height={height}
      />
      {isStudio && (
        <StudioWarnings
          warnings={[fontSetup.warning, resolved.audioWarning, droppedSplitsWarning(resolved.droppedSplits ?? [])]}
        />
      )}
      {isStudio && panel && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
