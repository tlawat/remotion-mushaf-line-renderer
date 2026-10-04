import {
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  lineHeightForFontSize,
  revealRtlStyle,
  slideFadeStyle,
  wordAt,
  wordTiming,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {volumeAt} from '../audio/volume';
import {backgroundFor} from '../background/compat';
import {MushafBackground} from '../background/MushafBackground';
import {endCardFrames} from '../compositions/extras';
import {
  CompositionAudio,
  CompositionEndCard,
  glowLevelAt,
  StudioWarnings,
  translationsOf,
  useTranslationLayers,
  volumeCurveFor,
} from '../compositions/parts';
import {ayahAt, fileUrl} from '../compositions/shared';
import {MushafStudioError} from '../errors';
import {
  audioClock,
  clipAt,
  clipTimeline,
  firstLetterOf,
  isIdentityTimeline,
  type MemorizeClip,
  RepeatCounter,
  visibilityStyle,
  type WordVisibility,
  wordVisibility,
} from '../memorize';
import {MushafTitleOverlay} from '../overlay';
import {activeWordStyleFrom} from '../schema';
import {MushafStudioPanel} from '../studio';
import {useInStudio} from '../studio/environment';
import {ayahKeyOf, TranslationStack} from '../translations';
import {AyahText} from './AyahText';
import {useUnicodeFont} from './font';
import type {ResolvedAyah, ResolvedAyahText} from './resolve';
import type {AyahAnimation, MushafAyahTextProps} from './schema';
import type {AyahWord} from './text';

/** The class of the translations under the ayah, and the rule that centres them as the ayah is. */
const CENTRED = 'mushaf-ayah-text-translations';
// `<TranslationBlock>` sets `text-align: start` inline; under a centred ayah its text is centred too.
const CENTRED_RULE = `.${CENTRED} .mushaf-translation{text-align:center!important}`;

/** `slideFade()`'s travel for one line, as a share of its line box, and how much of it an exit takes. */
const SLIDE_SHARE = 0.28;
const EXIT_DISTANCE_SCALE = 0.6;

const entranceStyle = (
  entrance: Exclude<AyahAnimation['enter'], 'none'>,
  direction: 'entering' | 'exiting',
  progress: number,
  lineBox: number,
): React.CSSProperties => {
  switch (entrance) {
    case 'fade':
      return {opacity: direction === 'entering' ? progress : 1 - progress};
    case 'reveal-rtl':
      return revealRtlStyle(progress, direction);
    case 'slide-fade': {
      // slideFadeStyle() moves by a share of the box it animates; an ayah block can be many lines
      // tall, so the travel is one line box's worth in px, the opacity the package's own.
      const travel = lineBox * SLIDE_SHARE;
      const offset = direction === 'entering' ? (1 - progress) * travel : -progress * travel * EXIT_DISTANCE_SCALE;
      return {opacity: slideFadeStyle(progress, direction).opacity, transform: `translateY(${offset.toFixed(4)}px)`};
    }
  }
};

/**
 * The style of an ayah `frame` frames into its Sequence of `durationInFrames`: the entrance over the
 * first `enterTiming()` frames, the exit over the last `exitTiming()` frames (the exit wins where a
 * short Sequence has them overlap), on the package's curves and presentations. `lineBox` is one line
 * of the Arabic text in px. A pure function of its arguments.
 */
export const ayahPresentationStyle = (
  animation: Pick<AyahAnimation, 'enter' | 'exit'>,
  frame: number,
  durationInFrames: number,
  fps: number,
  lineBox: number,
): React.CSSProperties => {
  const exit = exitTiming();
  const exitFrom = durationInFrames - exit.getDurationInFrames({fps});
  if (animation.exit !== 'none' && frame >= exitFrom) {
    return entranceStyle(animation.exit, 'exiting', exit.getProgress({frame: frame - exitFrom, fps}), lineBox);
  }
  if (animation.enter !== 'none') {
    return entranceStyle(animation.enter, 'entering', enterTiming().getProgress({frame, fps}), lineBox);
  }
  return {};
};

/**
 * One ayah at a time as Unicode text in QUL's Uthmani Hafs font, following the audio: the framing
 * of reels and short clips, where `<MushafRecitation>` shows the printed page lines. Each timed
 * ayah is a Sequence from `leadInSeconds` before its first word to where the next one comes in,
 * centred at `layout.verticalAlign`, with the current word (or ayah) highlighted, the others dimmed
 * as `highlight` says, and its translation under it, with the title card and corner label of
 * `overlay` when asked, over its `background` (the glow following the recitation), the audio
 * normalised and faded as `audio` says, and an end card after the last ayah when asked. The same
 * timings and translation files as the recitation (up to three translations, stacked); in the Studio
 * the Mushaf panel is docked over it, as over `<MushafRecitation>`.
 *
 * Under a memorisation mode each ayah plays `memorize.repeat` times on the clip timeline (one
 * `<Audio>` per clip, the ayah on screen through all its plays, the highlight restarting with each,
 * a "2/3" counter in a corner); the blank modes hide words (opacity 0, so nothing reflows) and
 * `'first-letters'` shows each word to come as its first letter and a tatweel (`firstLetterOf()`),
 * the ayah-end marker kept as a cue.
 */
export const MushafAyahText: React.FC<MushafAyahTextProps> = (props) => {
  const {audioFile, layout, animation, highlight, memorize, text, fontSize, lineHeight, overlay, endCard, audio} =
    props;
  const {width, height, fps, durationInFrames, id} = useVideoConfig();
  const frame = useCurrentFrame();
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
  const activeAyah = highlight.mode === 'ayah' ? ayahKeyOf(activeWordId) : null;
  const highlightStyle = activeWordStyleFrom(highlight);
  const dims = highlight.mode !== 'none' && highlight.dimOthers < 1;
  const measure = width - 2 * layout.marginX;
  const lineBox = fontSize * lineHeight;
  const titleFontSize = fontSizeForWidth(measure);
  const showTranslation = translationLayers.length > 0 && text.translationPosition !== 'none';

  // A pure function of the frame: the ayah of the current word is painted whole under `mode: 'ayah'`;
  // the other words are dimmed, or only those not heard yet (the marker counts as heard at the ayah's end).
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
  const wordStyleFor = (ayah: ResolvedAyah): ((word: AyahWord) => React.CSSProperties | undefined) => {
    const inActiveAyah = activeAyah === `${ayah.surah}:${ayah.ayah}`;
    return (word) => {
      let style: React.CSSProperties | undefined = inActiveAyah && highlightStyle ? {...highlightStyle} : undefined;
      if (dims && !inActiveAyah && word.id !== activeWordId) {
        const start = startOf(ayah, word);
        if (!highlight.dimUpcomingOnly || (start !== undefined && start > now)) {
          style = {...style, opacity: highlight.dimOthers};
        }
      }
      const hidden = visibilityStyle(visibilityOf(ayah, word));
      return hidden ? {...style, ...hidden} : style;
    };
  };
  // The first-letter cue for a word to come; the marker keeps its number.
  const wordTextFor =
    memorize.mode === 'first-letters'
      ? (ayah: ResolvedAyah) =>
          (word: AyahWord): string | undefined =>
            word.kind === 'word' && visibilityOf(ayah, word) === 'first-letter' ? firstLetterOf(word.text) : undefined
      : undefined;
  /** Where an ayah's first play starts on the composition's clock: its own start when ayahs play once. */
  const startOnTimeline = (ayah: ResolvedAyah): number =>
    clips.find((c) => c.ayah === ayah.ayah && c.repetition === 1)?.compositionFrom ?? ayah.start;

  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      <MushafBackground
        background={{
          ...backgroundFor(props.background, layout),
          ...(resolved.backgroundVideoSeconds ? {videoSeconds: resolved.backgroundVideoSeconds} : {}),
        }}
        audioLevel={glowLevelAt(resolved.audio, now, fps)}
        glowY={layout.verticalAlign}
      />
      {showTranslation && <style>{CENTRED_RULE}</style>}
      {audioFile !== '' && identity && (
        <CompositionAudio
          src={fileUrl(audioFile, staticFile)}
          trimBefore={audioOffsetFrames}
          volume={(f) => volumeAt(f, curve)}
        />
      )}
      {audioFile !== '' &&
        !identity &&
        clips.map((c) => {
          const trimBefore = audioOffsetFrames + Math.round(c.audioFrom * fps);
          const trimAfter = audioOffsetFrames + Math.round(c.audioTo * fps);
          const from = Math.round(c.compositionFrom * fps);
          return (
            <Sequence
              key={`${c.ayah}/${c.repetition}`}
              from={from}
              durationInFrames={Math.max(1, trimAfter - trimBefore)}
              name={`Ayah ${c.ayah} (${c.repetition}/${repeats})`}
            >
              {/* The same gain in every clip; the fades are the composition's, at its very start and end. */}
              <CompositionAudio
                src={fileUrl(audioFile, staticFile)}
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
          <TranslationStack layers={translationLayers} ayahKey={key} className={CENTRED} />
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
                  ...ayahPresentationStyle(animation, frame - from, duration, fps, lineBox),
                }}
              >
                {text.translationPosition === 'above' && block}
                <AyahText
                  words={ayah.words}
                  activeWordId={highlight.mode === 'word' ? activeWordId : null}
                  highlightStyle={highlightStyle}
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
        overlay={overlay}
        surah={timings.surah}
        fromAyah={timings.ayat[0]!.ayah}
        toAyah={timings.ayat[timings.ayat.length - 1]!.ayah}
        ayahKey={ayahKeyOf(heard) ?? ayahAt(timings, now)}
        firstWordSeconds={timings.ayat[0]!.words?.[0]?.start ?? timings.ayat[0]!.start}
        background={layout.background}
        // The surah name is set as a printed line would be across the measure, not at the Arabic text's size.
        fontSize={titleFontSize}
        lineHeight={lineHeightForFontSize(titleFontSize)}
        width={measure}
      />
      <RepeatCounter
        clips={clips}
        repeats={repeats}
        seconds={seconds}
        overlay={overlay}
        background={layout.background}
      />
      <CompositionEndCard
        endCard={endCard}
        content={resolved.endCard}
        timings={timings}
        translations={translationLayers.map((layer) => layer.translation)}
        reciter={overlay.reciter}
        from={contentFrames}
        durationInFrames={cardFrames}
        fontFamily={overlay.font}
        color={layout.color}
        background={layout.background}
        width={width}
        height={height}
      />
      {isStudio && <StudioWarnings warnings={[resolved.audioWarning]} />}
      {isStudio && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
