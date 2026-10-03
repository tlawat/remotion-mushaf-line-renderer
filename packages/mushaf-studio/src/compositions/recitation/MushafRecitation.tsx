import {
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  type LineSchedule,
  lineHeightForFontSize,
  MushafLine,
  MushafLineWindow,
  wordAt,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {
  AbsoluteFill,
  Audio,
  getRemotionEnvironment,
  Img,
  Interactive,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {MushafStudioError} from '../../errors';
import {wordStarts} from '../../lines';
import {activeWordStyleFrom, animationFrom, fontPropsFrom, scrollTimingFrom, wordStyleFrom} from '../../schema';
import {MushafStudioPanel} from '../../studio';
import {ayahKeyOf, GlossStrip, TranslationBlock} from '../../translations';
import {fileUrl, firstAyahKey} from '../shared';
import type {StudioResolvedRecitation} from './resolve';
import type {MushafRecitationProps} from './schema';

/** A background image fills the frame, cropped to it, under everything. */
const BACKGROUND_IMAGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

/** The one-line notice the composition shows in the Studio when a fonts mode degraded to the CDN. */
const WARNING_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  padding: '0.4em 1em',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 22,
  lineHeight: 1.3,
  color: '#7a2e0e',
  background: 'rgba(255, 232, 204, 0.92)',
};

/** The slot on screen at `seconds`: the last one that has started (lead-in included), else the first. */
const currentSlot = (schedule: readonly LineSchedule[], seconds: number, leadInSeconds: number): LineSchedule => {
  let current = schedule[0]!;
  for (const slot of schedule) {
    if (slot.start - leadInSeconds <= seconds) current = slot;
    else break;
  }
  return current;
};

/**
 * The flagship composition: the printed lines of a recited passage follow the audio, one line at a
 * time or through a line window, with the current word highlighted, an ayah translation and a
 * word gloss, and (in the Studio) the doubtful words marked and the Mushaf panel docked.
 */
export const MushafRecitation: React.FC<MushafRecitationProps> = (props) => {
  const {audioFile, fonts, layout, animation, highlight, text, review} = props;
  const {width, height, fps, durationInFrames, id} = useVideoConfig();
  const frame = useCurrentFrame();
  const {isStudio} = getRemotionEnvironment();
  const resolved = props.resolved as StudioResolvedRecitation | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafRecitation: `resolved` is null. calculateMetadata fills it in: pass calculateMushafRecitationMetadata to <Composition calculateMetadata>, or resolve the props with resolveRecitation() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {lines, schedule, timings} = resolved;
  const now = frame / fps;
  const activeWordId = highlight.mode === 'none' ? null : wordAt(timings, now);

  // The package's default type size is for a line spanning the whole width; the lines are inset.
  const measure = width - 2 * layout.marginX;
  const fontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(fontSize);
  const slots = layout.visibleLines === 0 ? 1 : layout.visibleLines;
  const blockHeight = slots * lineHeight;
  const top = Math.round((height - blockHeight) * layout.verticalAlign);
  const enterFrames = enterTiming().getDurationInFrames({fps});
  const exitFrames = exitTiming().getDurationInFrames({fps});
  // A line is fully in place `leadInSeconds` before its first word is heard.
  const leadFrame = (slot: LineSchedule): number => Math.round((slot.start - animation.leadInSeconds) * fps);

  const fontSetup = fontPropsFrom(fonts, lines[0]?.fontSet ?? 'qpc-v4', staticFile);
  const animationProps = animationFrom(animation, {visibleLines: slots});
  const activeWordStyle = highlight.mode === 'word' ? activeWordStyleFrom(highlight) : undefined;
  const activeProps = activeWordStyle ? {activeWordId, activeWordStyle} : {activeWordId};
  const starts = wordStarts(timings);
  const wordStyleFor = (sequenceFrom: number) =>
    wordStyleFrom({
      highlight,
      review,
      doubtful: resolved.doubtful,
      timingsIndex: starts,
      activeWordId,
      isStudio,
      sequenceFrom,
    });

  const slot = currentSlot(schedule, now, animation.leadInSeconds);
  const ayahKey = ayahKeyOf(activeWordId) ?? firstAyahKey(lines[slot.index]);

  let linesBlock: React.ReactNode;
  if (layout.visibleLines === 0) {
    // One Sequence per slot in one line box: this line's exit ends where the next one's entrance
    // begins, so the box never holds two half-visible lines of text at once.
    linesBlock = schedule.map((current, i) => {
      const line = lines[current.index]!;
      const from = Math.max(0, leadFrame(current) - enterFrames);
      const next = schedule[i + 1];
      const end = next ? Math.max(0, leadFrame(next) - enterFrames) : Math.round((current.end + 1) * fps);
      return (
        <Sequence
          key={current.index}
          from={from}
          durationInFrames={Math.max(exitFrames + 1, end - from)}
          premountFor={fps}
          name={`p${line.page} l${line.line} (${line.words[0]?.id ?? line.type})`}
        >
          <MushafLine
            line={line}
            fontSize={fontSize}
            lineHeight={lineHeight}
            wordStyle={wordStyleFor(from)}
            {...activeProps}
            {...animationProps}
            {...fontSetup.props}
          />
        </Sequence>
      );
    });
  } else {
    // One window for the passage: line j becomes current `leadInSeconds` before its first word is
    // heard, and the scroll that brings it to the centre finishes exactly then (the default anchor).
    const windowLines = schedule.map((current) => lines[current.index]!);
    const steps = schedule.map(leadFrame);
    const from = Math.max(0, (steps[0] ?? 0) - enterFrames);
    linesBlock = (
      <Sequence
        from={from}
        durationInFrames={Math.max(1, durationInFrames - from)}
        premountFor={fps}
        name={`${windowLines.length} lines, ${slots} at once`}
      >
        <MushafLineWindow
          lines={windowLines}
          steps={steps.map((step) => step - from)}
          scrollTiming={scrollTimingFrom(animation.scroll)}
          visibleLines={slots}
          neighbourOpacity={layout.neighbourOpacity}
          fontSize={fontSize}
          lineHeight={lineHeight}
          wordStyle={wordStyleFor(from)}
          {...activeProps}
          {...animationProps}
          {...fontSetup.props}
        />
      </Sequence>
    );
  }

  const translationGap = Math.round(text.translationSize * 0.6);
  const showTranslation = resolved.translation !== null && text.translationPosition !== 'none';
  const showGloss = resolved.gloss !== null || (resolved.transliteration ?? null) !== null;
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      {layout.backgroundImage !== '' && (
        <Img src={fileUrl(layout.backgroundImage, staticFile)} style={BACKGROUND_IMAGE_STYLE} />
      )}
      {audioFile !== '' && <Audio src={fileUrl(audioFile, staticFile)} />}
      <Interactive.Div
        name="Mushaf lines"
        style={{position: 'absolute', top, left: layout.marginX, width: measure, height: blockHeight}}
      >
        {linesBlock}
      </Interactive.Div>
      {showTranslation && (
        <Interactive.Div
          name="Translation"
          style={
            text.translationPosition === 'above'
              ? {position: 'absolute', left: layout.marginX, width: measure, bottom: height - top + translationGap}
              : {position: 'absolute', left: layout.marginX, width: measure, top: top + blockHeight + translationGap}
          }
        >
          <TranslationBlock
            translation={resolved.translation!}
            ayahKey={ayahKey}
            fontFamily={text.translationFont}
            fontSize={text.translationSize}
            color={text.translationColor}
            direction={text.translationDirection}
          />
        </Interactive.Div>
      )}
      {showGloss && (
        <Interactive.Div
          name="Gloss"
          style={{position: 'absolute', left: layout.marginX, width: measure, bottom: text.glossSize}}
        >
          <GlossStrip
            translation={resolved.gloss}
            transliteration={resolved.transliteration ?? null}
            activeWordId={activeWordId}
            fontFamily={text.glossFont}
            fontSize={text.glossSize}
            color={text.glossColor}
          />
        </Interactive.Div>
      )}
      {isStudio && fontSetup.warning !== null && <div style={WARNING_STYLE}>Mushaf Studio: {fontSetup.warning}</div>}
      {isStudio && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
