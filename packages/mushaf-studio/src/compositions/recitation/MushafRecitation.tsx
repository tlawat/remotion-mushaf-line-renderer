import {enterTiming, exitTiming, MushafLine, MushafLineWindow, wordAt} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {MushafStudioError} from '../../errors';
import {
  InterlinearGlosses,
  interlinearExtraHeight,
  interlinearFontSize,
  interlinearLineShift,
  interlinearRows,
  interlinearTop,
} from '../../interlinear';
import {wordStarts} from '../../lines';
import {
  audioClock,
  clipTimeline,
  isIdentityTimeline,
  type MemorizeClip,
  RepeatCounter,
  scheduleForClips,
  scrollTargetPosition,
} from '../../memorize';
import {MushafTitleOverlay} from '../../overlay';
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
  headerCount,
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
 * word gloss (in a strip, or under each printed word), the surah's header lines before ayah 1 and a
 * title card and corner label when asked, and (in the Studio) the doubtful words marked and the
 * Mushaf panel docked.
 *
 * Under a memorisation mode each ayah plays `memorize.repeat` times on the clip timeline (one
 * `<Audio>` per clip, the lines and words timed per clip, the window scrolling back to the ayah's
 * first line for the next play, a "2/3" counter in a corner), and the blank modes hide the words as
 * `wordVisibility()` says. `'first-letters'` cannot cut a glyph-font word into letters: here it is
 * `'blank-upcoming'` with a faint outline (opacity 0.12).
 */
export const MushafRecitation: React.FC<MushafRecitationProps> = (props) => {
  const {audioFile, fonts, layout, animation, highlight, memorize, text, review, overlay} = props;
  const {width, height, fps, durationInFrames, id} = useVideoConfig();
  const frame = useCurrentFrame();
  const isStudio = useInStudio();
  const resolved = props.resolved as (ResolvedRecitation & {readonly clips?: readonly MemorizeClip[]}) | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafRecitation: `resolved` is null. calculateMetadata fills it in: pass calculateMushafRecitationMetadata to <Composition calculateMetadata>, or resolve the props with resolveRecitation() for a <Player>.',
      {prop: 'resolved'},
    );
  }
  const {lines, schedule, timings} = resolved;
  // The clip timeline calculateMetadata laid out; rebuilt (the same pure function) for a `resolved` made without it.
  const clips = resolved.clips ?? clipTimeline(timings, memorize);
  const identity = isIdentityTimeline(clips);
  const repeats = clips.reduce((most, clip) => Math.max(most, clip.repetition), 1);
  const toAudio = audioClock(clips);
  const seconds = frame / fps;
  // The second of the recording being heard: the composition's own when ayahs play once.
  const now = toAudio(seconds);
  // The word being heard drives the gloss and the translation whatever the highlight does; the
  // lines are told about it only when something follows the recitation.
  const heard = wordAt(timings, now);
  const activeWordId = highlight.mode === 'none' ? null : heard;

  // Interlinear glosses: every line slot grows by the label rows, and the line moves up into it.
  const glossRows =
    text.glossPosition === 'interlinear' ? interlinearRows(resolved.gloss, resolved.transliteration) : 0;
  const plainGeometry = blockGeometry(layout, {width, height});
  const labelSize = interlinearFontSize(text.glossSize, plainGeometry.fontSize);
  const extraLineHeight = interlinearExtraHeight(glossRows, labelSize);
  const geometry = extraLineHeight === 0 ? plainGeometry : blockGeometry(layout, {width, height}, {extraLineHeight});
  const lineShift = interlinearLineShift(extraLineHeight);
  const {fontSize, lineHeight, slots} = geometry;
  const enterFrames = enterTiming().getDurationInFrames({fps});
  const exitFrames = exitTiming().getDurationInFrames({fps});
  const headers = headerCount(lines);
  // The slots in composition time: the schedule itself, or laid on the clips when ayahs repeat.
  const timeline = scheduleForClips(schedule, lines, clips, headers);
  const leads = leadFrames(timeline, animation.leadInSeconds, fps);

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
      audioTime: toAudio,
      memorize: {settings: memorize, clips},
    });

  const slot = timeline[currentSlot(leads, frame)]!;
  const ayahKey = ayahKeyOf(heard) ?? ayahAt(timings, now) ?? firstAyahKey(lines[slot.index]);

  let linesBlock: React.ReactNode;
  if (layout.visibleLines === 0) {
    // One Sequence per slot in one line box: this line's exit ends where the next one's entrance
    // begins, so the box never holds two half-visible lines of text at once.
    linesBlock = timeline.map((current, i) => {
      const line = lines[current.index]!;
      const from = Math.max(0, leads[i]! - enterFrames);
      const nextLead = leads[i + 1];
      const end = nextLead === undefined ? Math.round((current.end + 1) * fps) : Math.max(0, nextLead - enterFrames);
      // A header line squeezed out by a recitation that starts at once has no frame of its own:
      // stretched to its exit, it would sit over the first ayah line.
      if (current.index < headers && end <= from) return null;
      return (
        <Sequence
          // A line comes back for each play of its ayah: one Sequence per slot of the timeline, named by when it starts.
          key={`${current.index}@${current.start}`}
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
            {...(lineShift ? {style: lineShift} : {})}
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
    const steps = leads.map((step) => step - from);
    const scrollTiming = scrollTimingFrom(animation.scroll);
    // When ayahs repeat, the current line goes back to the ayah's first line for the next play:
    // the window is given its position, from the timeline's slots and the window line each one is.
    const windowIndex = new Map(schedule.map((current, j) => [current.index, j]));
    const scroll = identity
      ? {steps, scrollTiming}
      : {
          position: scrollTargetPosition({
            frame: frame - from,
            fps,
            steps,
            targets: timeline.map((current) => windowIndex.get(current.index) ?? 0),
            timing: scrollTiming,
          }),
        };
    linesBlock = (
      <Sequence
        from={from}
        durationInFrames={Math.max(1, durationInFrames - from)}
        premountFor={fps}
        name={`${windowLines.length} lines, ${slots} at once`}
      >
        <MushafLineWindow
          lines={windowLines}
          {...scroll}
          visibleLines={slots}
          neighbourOpacity={layout.neighbourOpacity}
          fontSize={fontSize}
          lineHeight={lineHeight}
          wordStyle={wordStyleFor(from)}
          {...(lineShift ? {lineStyle: () => lineShift} : {})}
          {...activeProps}
          {...animationProps}
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
        activeColor={highlight.mode === 'none' ? undefined : highlight.color}
        fontFamily={text.glossFont}
        fontSize={labelSize}
        color={text.glossColor}
        top={interlinearTop(lineHeight, extraLineHeight)}
      >
        {linesBlock}
      </InterlinearGlosses>
    );
  }

  const showTranslation = resolved.translation !== null && text.translationPosition !== 'none';
  const showGloss = text.glossPosition === 'strip' && (resolved.gloss !== null || resolved.transliteration !== null);
  return (
    <AbsoluteFill style={{backgroundColor: layout.background, color: layout.color}}>
      {layout.backgroundImage !== '' && (
        <Img src={fileUrl(layout.backgroundImage, staticFile)} style={BACKGROUND_IMAGE_STYLE} />
      )}
      {audioFile !== '' && identity && (
        <Audio src={fileUrl(audioFile, staticFile)} trimBefore={Math.round(resolved.audioOffsetSeconds * fps)} />
      )}
      {audioFile !== '' &&
        !identity &&
        clips.map((clip) => {
          // Frames of the file: the composition's own offset into the recording, then the clip's range.
          const trimBefore = Math.round((resolved.audioOffsetSeconds + clip.audioFrom) * fps);
          const trimAfter = Math.round((resolved.audioOffsetSeconds + clip.audioTo) * fps);
          return (
            <Sequence
              key={`${clip.ayah}/${clip.repetition}`}
              from={Math.round(clip.compositionFrom * fps)}
              durationInFrames={Math.max(1, trimAfter - trimBefore)}
              name={`Ayah ${clip.ayah} (${clip.repetition}/${repeats})`}
            >
              <Audio src={fileUrl(audioFile, staticFile)} trimBefore={trimBefore} trimAfter={trimAfter} />
            </Sequence>
          );
        })}
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
      <MushafTitleOverlay
        overlay={overlay}
        surah={timings.surah}
        fromAyah={timings.ayat[0]!.ayah}
        toAyah={timings.ayat[timings.ayat.length - 1]!.ayah}
        ayahKey={ayahKey}
        firstWordSeconds={timings.ayat[0]!.words?.[0]?.start ?? timings.ayat[0]!.start}
        background={layout.background}
        fontSize={fontSize}
        lineHeight={lineHeight}
        width={geometry.measure}
        fontProps={fontSetup.props}
      />
      <RepeatCounter
        clips={clips}
        repeats={repeats}
        seconds={seconds}
        overlay={overlay}
        background={layout.background}
      />
      {isStudio && fontSetup.warning !== null && <div style={WARNING_STYLE}>Mushaf Studio: {fontSetup.warning}</div>}
      {isStudio && <MushafStudioPanel compositionId={id} props={props} />}
    </AbsoluteFill>
  );
};
