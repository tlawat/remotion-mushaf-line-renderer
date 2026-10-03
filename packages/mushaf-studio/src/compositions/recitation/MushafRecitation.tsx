import {enterTiming, exitTiming, MushafLine, MushafLineWindow, wordAt} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {MushafStudioError} from '../../errors';
import {wordStarts} from '../../lines';
import {activeWordStyleFrom, animationFrom, fontPropsFrom, scrollTimingFrom, wordStyleFrom} from '../../schema';
import {MushafStudioPanel} from '../../studio';
import {useInStudio} from '../../studio/environment';
import {ayahKeyOf, GlossStrip, TranslationBlock} from '../../translations';
import type {ResolvedRecitation} from '../../types';
import {
  ayahAt,
  BACKGROUND_IMAGE_STYLE,
  blockGeometry,
  fileUrl,
  firstAyahKey,
  glossBlockStyle,
  leadFrames,
  linesBlockStyle,
  translationBlockStyle,
  WARNING_STYLE,
} from '../shared';
import type {MushafRecitationProps} from './schema';

/** The slot on screen at `frame`, by the frames the slots are in place at: the last one in place, else the first. */
const currentSlot = (leads: readonly number[], frame: number): number => {
  let current = 0;
  for (let i = 0; i < leads.length; i++) {
    if (leads[i]! <= frame) current = i;
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
  const isStudio = useInStudio();
  const resolved = props.resolved as ResolvedRecitation | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafRecitation: `resolved` is null. calculateMetadata fills it in: pass calculateMushafRecitationMetadata to <Composition calculateMetadata>, or resolve the props with resolveRecitation() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {lines, schedule, timings} = resolved;
  const now = frame / fps;
  // The word being heard drives the gloss and the translation whatever the highlight does; the
  // lines are told about it only when something follows the recitation.
  const heard = wordAt(timings, now);
  const activeWordId = highlight.mode === 'none' ? null : heard;

  const geometry = blockGeometry(layout, {width, height});
  const {fontSize, lineHeight, slots} = geometry;
  const enterFrames = enterTiming().getDurationInFrames({fps});
  const exitFrames = exitTiming().getDurationInFrames({fps});
  const leads = leadFrames(schedule, animation.leadInSeconds, fps);

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
      timings,
      activeWordId,
      isStudio,
      sequenceFrom,
    });

  const slot = schedule[currentSlot(leads, frame)]!;
  const ayahKey = ayahKeyOf(heard) ?? ayahAt(timings, now) ?? firstAyahKey(lines[slot.index]);

  let linesBlock: React.ReactNode;
  if (layout.visibleLines === 0) {
    // One Sequence per slot in one line box: this line's exit ends where the next one's entrance
    // begins, so the box never holds two half-visible lines of text at once.
    linesBlock = schedule.map((current, i) => {
      const line = lines[current.index]!;
      const from = Math.max(0, leads[i]! - enterFrames);
      const nextLead = leads[i + 1];
      const end = nextLead === undefined ? Math.round((current.end + 1) * fps) : Math.max(0, nextLead - enterFrames);
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
    const from = Math.max(0, (leads[0] ?? 0) - enterFrames);
    linesBlock = (
      <Sequence
        from={from}
        durationInFrames={Math.max(1, durationInFrames - from)}
        premountFor={fps}
        name={`${windowLines.length} lines, ${slots} at once`}
      >
        <MushafLineWindow
          lines={windowLines}
          steps={leads.map((step) => step - from)}
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

  const showTranslation = resolved.translation !== null && text.translationPosition !== 'none';
  const showGloss = resolved.gloss !== null || resolved.transliteration !== null;
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      {layout.backgroundImage !== '' && (
        <Img src={fileUrl(layout.backgroundImage, staticFile)} style={BACKGROUND_IMAGE_STYLE} />
      )}
      {audioFile !== '' && (
        <Audio src={fileUrl(audioFile, staticFile)} trimBefore={Math.round(resolved.audioOffsetSeconds * fps)} />
      )}
      <div data-mushaf-block="Mushaf lines" style={linesBlockStyle(geometry, layout)}>
        {linesBlock}
      </div>
      {showTranslation && (
        <div data-mushaf-block="Translation" style={translationBlockStyle(geometry, layout, text, height)}>
          <TranslationBlock
            translation={resolved.translation!}
            ayahKey={ayahKey}
            fontFamily={text.translationFont}
            fontSize={text.translationSize}
            color={text.translationColor}
            direction={text.translationDirection}
          />
        </div>
      )}
      {showGloss && (
        <div data-mushaf-block="Gloss" style={glossBlockStyle(geometry, layout, text)}>
          <GlossStrip
            translation={resolved.gloss}
            transliteration={resolved.transliteration}
            activeWordId={heard}
            fontFamily={text.glossFont}
            fontSize={text.glossSize}
            color={text.glossColor}
          />
        </div>
      )}
      {isStudio && fontSetup.warning !== null && <div style={WARNING_STYLE}>Mushaf Studio: {fontSetup.warning}</div>}
      {isStudio && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
