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
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {ayahAt, fileUrl} from '../compositions/shared';
import {MushafStudioError} from '../errors';
import {MushafTitleOverlay} from '../overlay';
import {activeWordStyleFrom} from '../schema';
import {MushafStudioPanel} from '../studio';
import {useInStudio} from '../studio/environment';
import {ayahKeyOf, TranslationBlock} from '../translations';
import {AyahText} from './AyahText';
import {useUnicodeFont} from './font';
import type {ResolvedAyah, ResolvedAyahText} from './resolve';
import type {AyahAnimation, MushafAyahTextProps} from './schema';
import type {AyahWord} from './text';

/** A background image fills the frame, cropped to it, under everything. */
const BACKGROUND_IMAGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

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
 * `overlay` when asked. The same timings and translation files as the
 * recitation; in the Studio the Mushaf panel is docked over it, as over `<MushafRecitation>`.
 */
export const MushafAyahText: React.FC<MushafAyahTextProps> = (props) => {
  const {audioFile, layout, animation, highlight, text, fontSize, lineHeight, overlay} = props;
  const {width, fps, durationInFrames, id} = useVideoConfig();
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
  const {timings, ayahs, translation} = resolved;
  const now = frame / fps;
  const heard = wordAt(timings, now);
  const activeWordId = highlight.mode === 'none' ? null : heard;
  const activeAyah = highlight.mode === 'ayah' ? ayahKeyOf(activeWordId) : null;
  const highlightStyle = activeWordStyleFrom(highlight);
  const dims = highlight.mode !== 'none' && highlight.dimOthers < 1;
  const measure = width - 2 * layout.marginX;
  const lineBox = fontSize * lineHeight;
  const titleFontSize = fontSizeForWidth(measure);
  const showTranslation = translation !== null && text.translationPosition !== 'none';

  // A pure function of the frame: the ayah of the current word is painted whole under `mode: 'ayah'`;
  // the other words are dimmed, or only those not heard yet (the marker counts as heard at the ayah's end).
  const wordStyleFor = (ayah: ResolvedAyah): ((word: AyahWord) => React.CSSProperties | undefined) => {
    const inActiveAyah = activeAyah === `${ayah.surah}:${ayah.ayah}`;
    return (word) => {
      let style: React.CSSProperties | undefined = inActiveAyah && highlightStyle ? {...highlightStyle} : undefined;
      if (dims && !inActiveAyah && word.id !== activeWordId) {
        const start = wordTiming(timings, word.id)?.start ?? (word.kind === 'end' ? ayah.end : undefined);
        if (!highlight.dimUpcomingOnly || (start !== undefined && start > now)) {
          style = {...style, opacity: highlight.dimOthers};
        }
      }
      return style;
    };
  };

  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      {layout.backgroundImage !== '' && (
        <Img src={fileUrl(layout.backgroundImage, staticFile)} style={BACKGROUND_IMAGE_STYLE} />
      )}
      {audioFile !== '' && <Audio src={fileUrl(audioFile, staticFile)} />}
      {ayahs.map((ayah, i) => {
        const key = `${ayah.surah}:${ayah.ayah}`;
        // On screen from `leadInSeconds` before its first word until the next ayah comes in: one
        // ayah at a time, never two half-visible ones over each other.
        const from = Math.max(0, Math.round((ayah.start - animation.leadInSeconds) * fps));
        const next = ayahs[i + 1];
        const end = next ? Math.round((next.start - animation.leadInSeconds) * fps) : durationInFrames;
        const duration = Math.max(1, end - from);
        const block = showTranslation ? (
          <TranslationBlock
            translation={translation}
            ayahKey={key}
            fontFamily={text.translationFont}
            fontSize={text.translationSize}
            color={text.translationColor}
            direction={text.translationDirection}
            style={{textAlign: 'center'}}
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
                  ...ayahPresentationStyle(animation, frame - from, duration, fps, lineBox),
                }}
              >
                {text.translationPosition === 'above' && block}
                <AyahText
                  words={ayah.words}
                  activeWordId={highlight.mode === 'word' ? activeWordId : null}
                  highlightStyle={highlightStyle}
                  wordStyle={wordStyleFor(ayah)}
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
      {isStudio && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
