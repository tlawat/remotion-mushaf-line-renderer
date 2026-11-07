import {
  enterTiming,
  exitTiming,
  fadeRiseStyle,
  fontSizeForWidth,
  lineHeightForFontSize,
  wordAt,
  wordTiming,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useMemo} from 'react';
import {AbsoluteFill, interpolateColors, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {followsHostAudio} from '../audio/host';
import {volumeAt} from '../audio/volume';
import {backgroundFor, groundFor} from '../background/compat';
import {MushafBackground} from '../background/MushafBackground';
import {endCardFrames} from '../compositions/extras';
import {useStudioFonts} from '../compositions/fonts';
import {
  CompositionAudio,
  CompositionEndCard,
  readableLayers,
  StudioWarnings,
  translationsOf,
  useTranslationLayers,
  volumeCurveFor,
  type WithPanelOption,
} from '../compositions/parts';
import {ayahAt, recordingUrl} from '../compositions/shared';
import {passageSpan} from '../compositions/timings';
import {MushafStudioError} from '../errors';
import {
  audioClock,
  clipAt,
  clipAyahKey,
  clipTimeline,
  firstLetterOf,
  isIdentityTimeline,
  type MemorizeClip,
  RepeatCounter,
  visibilityStyle,
  type WordVisibility,
  wordVisibility,
} from '../memorize';
import {MushafTitleOverlay, showsCorner} from '../overlay';
import {
  inkFill,
  legibleAccent,
  markerIds,
  metalOf,
  readableInk,
  riseDistance,
  SINE,
  SOFT,
  washAlpha,
  washColor,
  washStyle,
  wordEmphasis,
  wordSpanIndex,
  wordSpans,
} from '../schema';
import {MushafStudioPanel} from '../studio';
import {useInStudio} from '../studio/environment';
import {ayahKeyOf, TranslationStack} from '../translations';
import {AyahText} from './AyahText';
import {useUnicodeFont} from './font';
import type {ResolvedAyah, ResolvedAyahText} from './resolve';
import type {AyahAnimation, MushafAyahTextProps} from './schema';
import type {AyahWord} from './text';

const entranceStyle = (
  lines: Exclude<AyahAnimation['lines'], 'cut'>,
  direction: 'entering' | 'exiting',
  progress: number,
  fontSize: number,
): React.CSSProperties => {
  // The exiting ayah only fades (on SINE), whichever motion: a leaving text does not move.
  if (direction === 'exiting') return {opacity: 1 - SINE(progress)};
  if (lines === 'rise') return fadeRiseStyle(progress, 'entering', {distance: riseDistance(fontSize)});
  return {opacity: SOFT(progress)};
};

/**
 * The style of an ayah `frame` frames into its Sequence of `durationInFrames`: the entrance over the
 * first `enterTiming()` frames, the exit over the last `exitTiming()` frames (the exit wins where a
 * short Sequence has them overlap), on the calm curves: a fade, or with `'rise'` a rise of
 * `riseDistance(fontSize)` px; `'cut'` neither. A pure function of its arguments.
 */
export const ayahPresentationStyle = (
  animation: Pick<AyahAnimation, 'lines'>,
  frame: number,
  durationInFrames: number,
  fps: number,
  fontSize: number,
): React.CSSProperties => {
  if (animation.lines === 'cut') return {};
  const linear = (input: number) => input;
  const exit = exitTiming({easing: linear});
  const exitFrom = durationInFrames - exit.getDurationInFrames({fps});
  if (frame >= exitFrom) {
    return entranceStyle(animation.lines, 'exiting', exit.getProgress({frame: frame - exitFrom, fps}), fontSize);
  }
  return entranceStyle(animation.lines, 'entering', enterTiming({easing: linear}).getProgress({frame, fps}), fontSize);
};

/**
 * One ayah at a time as Unicode text in QUL's Uthmani Hafs font, following the audio: the framing
 * of reels and short clips, where `<MushafRecitation>` shows the printed page lines. Each timed
 * ayah is a Sequence from `leadInSeconds` before its first word to where the next one comes in,
 * centred at `layout.verticalAlign`, the recitation marked as `highlight` says (the words still to
 * come resting lighter, a tint or a wash on the word; the ayah on screen is the ayah being recited,
 * so `mode: 'ayah'` marks nothing), and its translation under it, with the title card and corner
 * label of `overlay` when asked, over its `background`, the audio
 * normalised and faded as `audio` says, and an end card after the last ayah when asked. The same
 * timings and translation files as the recitation (up to three translations, stacked); in the Studio
 * the Mushaf panel is docked over it, as over `<MushafRecitation>`.
 *
 * Under a memorisation mode each ayah plays `memorize.repeat` times on the clip timeline (one
 * `<Audio>` per clip, the ayah on screen through all its plays, the highlight restarting with each,
 * a "2/3" counter in a corner); the blank modes hide words (opacity 0, so nothing reflows) and
 * `'first-letters'` shows each word to come as its first letter and a tatweel (`firstLetterOf()`)
 * over the full word, hidden, so the lines break where the full text's do; the ayah-end marker is
 * kept as a cue.
 */
export const MushafAyahText: React.FC<WithPanelOption<MushafAyahTextProps>> = ({panel = true, ...props}) => {
  const {audioFile, layout, animation, highlight, memorize, text, fontSize, lineHeight, overlay, endCard, audio} =
    props;
  const {width, height, fps, durationInFrames, id} = useVideoConfig();
  const frame = useCurrentFrame();
  // Under hostAudio the template plays the recording: the composition plays none of its own.
  const ownAudio = audioFile !== '' && !followsHostAudio(props);
  const isStudio = useInStudio();
  const font = useUnicodeFont(props.font);
  const resolved = props.resolved as ResolvedAyahText | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafAyahText: `resolved` is null. calculateMetadata fills it in: pass calculateMushafAyahTextMetadata to <Composition calculateMetadata>, or resolve the props with resolveAyahText() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {timings, ayahs} = resolved;
  // The book serif and the Arabic labels: no frame is taken before they are in.
  useStudioFonts();
  const translationLayers = useTranslationLayers(text, translationsOf(resolved));
  const audioOffsetFrames = Math.round((resolved.audioOffsetSeconds ?? 0) * fps);
  // The frames before the end card: the audio fades out by their end, the last ayah stays to it.
  const cardFrames = endCardFrames(endCard, fps);
  const contentFrames = Math.max(1, durationInFrames - cardFrames);
  const curve = volumeCurveFor(audio, resolved.audio, contentFrames, fps);
  // The clip timeline calculateMetadata laid out; rebuilt (the same pure function) for a `resolved` made without it.
  const clips: readonly MemorizeClip[] = resolved.clips ?? clipTimeline(timings, memorize);
  const identity = isIdentityTimeline(clips);
  const repeats = clips.reduce((most, clip) => Math.max(most, clip.repetition), 1);
  const seconds = frame / fps;
  // The second of the recording being heard: the composition's own when ayahs play once.
  const now = audioClock(clips)(seconds);
  const clip = clipAt(clips, seconds);
  const heard = wordAt(timings, now);
  const activeWordId = highlight.mode === 'none' ? null : heard;
  // No theme here: a tint is always the text's CSS colour, read at 5:1 on the page.
  const ground = groundFor(props.background, layout);
  // Translation, gloss and label colours as drawn: one under 4.5:1 on the ground gives way to a muted ink.
  const readable = (color: string): string => readableInk(color, layout.color, ground);
  const shownOverlay = {...overlay, color: readable(overlay.color)};
  const accent = legibleAccent(highlight.color, ground);
  const spans = useMemo(
    () => wordSpanIndex(wordSpans(timings, {occurrence: highlight.occurrence, markers: markerIds(ayahs)})),
    [timings, highlight.occurrence, ayahs],
  );
  const measure = width - 2 * layout.marginX;
  const titleFontSize = fontSizeForWidth(measure);
  const showTranslation = translationLayers.length > 0 && text.translationPosition !== 'none';

  // A pure function of the frame. Under `mode: 'word'` the words still to come rest at
  // `restOpacity` and fill in as heard (the marker counts as heard at the ayah's end), or the word
  // being recited eases into the tint or its wash and back out; `mode: 'ayah'` marks nothing.
  const startOf = (ayah: ResolvedAyah, word: AyahWord): number | undefined =>
    wordTiming(timings, word.id)?.start ?? (word.kind === 'end' ? ayah.end : undefined);
  const visibilityOf = (ayah: ResolvedAyah, word: AyahWord): WordVisibility =>
    wordVisibility({
      mode: memorize.mode,
      revealAfterRepeats: memorize.revealAfterRepeats,
      start: startOf(ayah, word),
      now,
      active: word.id === heard,
      clip,
      script: 'unicode',
    });
  const markOf = (ayah: ResolvedAyah, word: AyahWord): React.CSSProperties | undefined => {
    if (highlight.mode !== 'word') return undefined;
    if (highlight.style === 'ink') {
      const start = startOf(ayah, word);
      if (start === undefined) return undefined;
      const opacity =
        Math.round((highlight.restOpacity + (1 - highlight.restOpacity) * inkFill(start, now)) * 10_000) / 10_000;
      return opacity < 1 ? {opacity} : undefined;
    }
    const span = word.kind === 'end' ? undefined : spans.get(word.id);
    const amount = span === undefined ? 0 : wordEmphasis(span, now);
    if (amount <= 0) return undefined;
    return highlight.style === 'tint'
      ? {color: interpolateColors(amount, [0, 1], [layout.color, accent])}
      : washStyle({
          color: washColor(highlight.color, washAlpha(ground) * amount),
          cap: 'both',
          height: '1.35em',
          y: '55%',
        });
  };
  const wordStyleFor = (ayah: ResolvedAyah): ((word: AyahWord) => React.CSSProperties | undefined) => {
    return (word) => {
      const style = markOf(ayah, word);
      const hidden = visibilityStyle(visibilityOf(ayah, word));
      return hidden ? {...style, ...hidden} : style;
    };
  };
  // The first-letter cue for a word to come, drawn over the full word, hidden (`<AyahText wordText>`);
  // the marker keeps its number.
  const wordTextFor =
    memorize.mode === 'first-letters'
      ? (ayah: ResolvedAyah) =>
          (word: AyahWord): string | undefined =>
            word.kind === 'word' && visibilityOf(ayah, word) === 'first-letter' ? firstLetterOf(word.text) : undefined
      : undefined;
  /**
   * Where an ayah's first play starts on the composition's clock: its own start when ayahs play once.
   * A clip of timings across surahs names its surah, so 114:1 is not taken for 113:1.
   */
  const startOnTimeline = (ayah: ResolvedAyah): number =>
    clips.find((c) => c.repetition === 1 && c.ayah === ayah.ayah && (c.surah ?? ayah.surah) === ayah.surah)
      ?.compositionFrom ?? ayah.start;
  const span = passageSpan(timings);

  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
      />
      {ownAudio && identity && (
        <CompositionAudio
          src={recordingUrl(audioFile, resolved, staticFile)}
          trimBefore={audioOffsetFrames}
          volume={(f) => volumeAt(f, curve)}
        />
      )}
      {ownAudio &&
        !identity &&
        clips.map((c) => {
          const trimBefore = audioOffsetFrames + Math.round(c.audioFrom * fps);
          const trimAfter = audioOffsetFrames + Math.round(c.audioTo * fps);
          const from = Math.round(c.compositionFrom * fps);
          return (
            <Sequence
              key={`${clipAyahKey(c)}/${c.repetition}`}
              from={from}
              durationInFrames={Math.max(1, trimAfter - trimBefore)}
              name={`Ayah ${clipAyahKey(c)} (${c.repetition}/${repeats})`}
            >
              {/* The same gain in every clip; the fades are the composition's, at its very start and end. */}
              <CompositionAudio
                src={recordingUrl(audioFile, resolved, staticFile)}
                trimBefore={trimBefore}
                trimAfter={trimAfter}
                volume={(f) => volumeAt(from + f, curve)}
              />
            </Sequence>
          );
        })}
      {ayahs.map((ayah, i) => {
        const key = `${ayah.surah}:${ayah.ayah}`;
        // On screen from `leadInSeconds` before its first word until the next ayah comes in: one
        // ayah at a time, never two half-visible ones over each other.
        const from = Math.max(0, Math.round((startOnTimeline(ayah) - animation.leadInSeconds) * fps));
        const next = ayahs[i + 1];
        const end = next ? Math.round((startOnTimeline(next) - animation.leadInSeconds) * fps) : contentFrames;
        const duration = Math.max(1, end - from);
        const block = showTranslation ? (
          // Centred, as the ayah over (or under) it is.
          <TranslationStack
            layers={readableLayers(translationLayers, layout.color, ground)}
            ayahKey={key}
            align="center"
          />
        ) : null;
        return (
          <Sequence key={key} from={from} durationInFrames={duration} premountFor={fps} name={`Ayah ${key}`}>
            <div
              style={{
                position: 'absolute',
                left: layout.marginX,
                width: measure,
                top: `${layout.verticalAlign * 100}%`,
                transform: `translateY(${-layout.verticalAlign * 100}%)`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: Math.round(text.translationSize * 0.6),
                  ...ayahPresentationStyle(animation, frame - from, duration, fps, fontSize),
                }}
              >
                {text.translationPosition === 'above' && block}
                <AyahText
                  words={ayah.words}
                  activeWordId={highlight.mode === 'word' ? activeWordId : null}
                  wordStyle={wordStyleFor(ayah)}
                  wordText={wordTextFor?.(ayah)}
                  fontFamily={font.fontFamily}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  color={layout.color}
                  maxWidth={measure}
                  // Until the face is in document.fonts the render waits; the Studio preview shows nothing rather than a fallback.
                  style={font.ready ? undefined : {visibility: 'hidden'}}
                />
                {text.translationPosition === 'below' && block}
              </div>
            </div>
          </Sequence>
        );
      })}
      <MushafTitleOverlay
        overlay={shownOverlay}
        surah={span.from.surah}
        fromAyah={span.from.ayah}
        toSurah={span.to.surah}
        toAyah={span.to.ayah}
        ayahKey={ayahKeyOf(heard) ?? ayahAt(timings, now)}
        firstWordSeconds={timings.ayat[0]!.words?.[0]?.start ?? timings.ayat[0]!.start}
        background={ground}
        // The surah name is set as a printed line would be across the measure, not at the Arabic text's size.
        fontSize={titleFontSize}
        lineHeight={lineHeightForFontSize(titleFontSize)}
        width={measure}
      />
      <RepeatCounter
        clips={clips}
        repeats={repeats}
        seconds={seconds}
        overlay={shownOverlay}
        labelShown={showsCorner(overlay.title)}
        tempo={animation.tempo}
      />
      <CompositionEndCard
        endCard={endCard}
        content={resolved.endCard}
        timings={timings}
        translations={translationLayers.map((layer) => layer.translation)}
        reciter={overlay.reciter}
        from={contentFrames}
        durationInFrames={cardFrames}
        font={overlay.font}
        color={layout.color}
        background={ground}
        metal={metalOf({ground})}
        measure={measure}
        glyphSize={titleFontSize}
        lineHeight={lineHeightForFontSize(titleFontSize)}
        width={width}
        height={height}
      />
      {isStudio && <StudioWarnings warnings={[resolved.audioWarning]} />}
      {isStudio && panel && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
