// A real-life use of the package: a recited passage with the printed lines shown in time with the
// audio. Input: a recitation timings JSON (the package's `RecitationTimings`: one entry per ayah with
// a start/end and, optionally, per-word times), produced by either tool in tools/ (the QUD aligner
// API client or the Whisper script). The composition asks the package for the lines that carry those
// ayahs, lets `scheduleLines()` say when each line is on screen, schedules one <Sequence> per line and
// animates each line in and out with the package's slide+fade.

import {
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  getMushafLines,
  type LineSchedule,
  lineHeightForFontSize,
  MushafLine,
  type MushafLineData,
  MushafLineWindow,
  type MushafThemeSelection,
  parseRecitationTimings,
  type RecitationTimings,
  recitedRange,
  scheduleLines,
  slideFade,
  type WordOccurrence,
} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Audio, type CalculateMetadataFunction, Sequence, staticFile, useVideoConfig} from 'remotion';
import {type DataFiles, dataFromFiles, type FontMode, fontProps} from './sources';

export type RecitationProps = {
  /** 'plain' follows CSS `color`; a preset (light, dark, sepia, black, normal, p1-p5) or a custom theme selects the colour font. */
  theme: MushafThemeSelection;
  /** Timings JSON in the public folder, e.g. 'audio/tawbah-timings-qud.json'; or pass `timings` inline. */
  timingsFile: string | null;
  timings: RecitationTimings | null;
  /** Audio in the public folder, e.g. 'audio/tawbah.mp3'. */
  audioFile: string;
  /** Where the page fonts come from: 'fallback' (QUL's CDN, then the fonts packages), 'cdn' or 'package'. */
  fonts: FontMode;
  /** Mirror of QUL's two exports in the public folder ({words, layout} paths); null fetches them from Tarteel's CDN. */
  dataFiles: DataFiles | null;
  /** Stop after the last ayah that ends before this many seconds; null plays the whole recitation. */
  cutAtSeconds: number | null;
  /** Seconds a line is on screen before its first word is heard. */
  leadInSeconds: number;
  /** Show only the recited ayahs on the first and last lines (the neighbours' words are hidden). */
  slice: boolean;
  /** When the reciter repeats a word after a pause: change lines when it is first heard, or at its last recitation. */
  occurrence: WordOccurrence;
  /** Lines on screen at once, the current one in the middle (a `<MushafLineWindow>`); null shows one line at a time. */
  visibleLines: number | null;
  /** Opacity of the lines around the current one in the window, 0-1. */
  neighbourOpacity: number;
  /** Filled in by calculateMetadata. */
  lines: MushafLineData[] | null;
  schedule: LineSchedule[] | null;
};

export const defaultRecitationProps: RecitationProps = {
  theme: 'plain',
  timingsFile: 'audio/tawbah-timings-qud.json',
  timings: null,
  audioFile: 'audio/tawbah.mp3',
  fonts: 'fallback',
  dataFiles: null,
  cutAtSeconds: null,
  leadInSeconds: 0.4,
  slice: true,
  occurrence: 'first',
  visibleLines: 3,
  neighbourOpacity: 0.45,
  lines: null,
  schedule: null,
};

const MARGIN_X = 120;

// One pair for every line: the package's slide+fade with its default timings — 0.5 s decelerating
// in, 0.32 s accelerating out. The exit of a line finishes where the next line's entrance starts
// (see `from`/`durationInFrames` below), so two lines of text never cross-fade through each other.
const ENTER = {presentation: slideFade(), timing: enterTiming()};
const EXIT = {presentation: slideFade(), timing: exitTiming()};

/**
 * The timings this composition plays: what the file says, minus the ayahs the recording does not
 * carry whole and, under `cutAtSeconds`, the ayahs ending after the cut. This is the example's own
 * policy; the package only reports `complete`.
 */
const playable = (timings: RecitationTimings, cutAtSeconds: number | null): RecitationTimings => {
  const usable = timings.ayat.filter((a) => a.complete !== false);
  const ayat = cutAtSeconds === null ? usable : usable.filter((a, i) => i === 0 || a.end <= cutAtSeconds);
  if (ayat.length === 0) throw new Error('Recitation: the timings carry no complete ayah.');
  return {...timings, ayat};
};

export const calculateRecitationMetadata: CalculateMetadataFunction<RecitationProps> = async ({props}) => {
  const source: unknown =
    props.timings ?? (props.timingsFile ? await (await fetch(staticFile(props.timingsFile))).json() : null);
  if (source === null) throw new Error('Recitation: pass `timings` or a `timingsFile`.');
  const timings = playable(parseRecitationTimings(source), props.cutAtSeconds);

  // One call: the package finds the page itself; `data` points it at a mirror of QUL's exports
  // instead of Tarteel's CDN.
  const lines = await getMushafLines({
    ...recitedRange(timings),
    theme: props.theme,
    slice: props.slice,
    data: dataFromFiles(props.dataFiles),
  });
  // A line starts when its first recited word starts and ends when the next line starts.
  const schedule = scheduleLines(lines, timings, {occurrence: props.occurrence});
  const lastEnd = timings.ayat[timings.ayat.length - 1]!.end;
  const fps = 30;
  const durationInFrames = Math.ceil((lastEnd + 1) * fps);
  return {props: {...props, lines, schedule}, durationInFrames};
};

export const Recitation: React.FC<RecitationProps> = ({
  lines,
  schedule,
  audioFile,
  leadInSeconds,
  fonts,
  visibleLines,
  neighbourOpacity,
}) => {
  const {width, height, fps, durationInFrames} = useVideoConfig();
  if (!lines || !schedule) throw new Error('Recitation: `lines`/`schedule` are null; calculateMetadata fills them in.');
  const measure = width - 2 * MARGIN_X;
  const fontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(fontSize);
  const enterFrames = enterTiming().getDurationInFrames({fps});
  const exitFrames = exitTiming().getDurationInFrames({fps});
  if (visibleLines !== null) {
    // One window for the whole passage: line j becomes current `leadInSeconds` before its first word
    // is heard, and the scroll that brings it to the centre finishes exactly then (the default anchor),
    // so there is no `- enterFrames` here. The window itself fades in before the first step and out
    // with the composition.
    const windowLines = schedule.map((slot) => lines[slot.index]!);
    const steps = schedule.map((slot) => Math.round((slot.start - leadInSeconds) * fps));
    const from = Math.max(0, (steps[0] ?? 0) - enterFrames);
    return (
      <AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b'}}>
        <Audio src={staticFile(audioFile)} />
        <Sequence
          from={from}
          durationInFrames={durationInFrames - from}
          premountFor={fps}
          name={`${windowLines.length} lines, ${visibleLines} at once`}
          style={{
            top: Math.round((height - visibleLines * lineHeight) / 2),
            height: visibleLines * lineHeight,
            left: MARGIN_X,
            width: measure,
          }}
        >
          <MushafLineWindow
            lines={windowLines}
            steps={steps.map((step) => step - from)}
            visibleLines={visibleLines}
            neighbourOpacity={neighbourOpacity}
            fontSize={fontSize}
            lineHeight={lineHeight}
            // slideFade's travel is a share of the box; the window is `visibleLines` boxes tall.
            enter={{presentation: slideFade({distance: 28 / visibleLines}), timing: enterTiming()}}
            exit={{presentation: slideFade({distance: 28 / visibleLines}), timing: exitTiming()}}
            {...fontProps(fonts, windowLines[0]?.fontSet ?? 'qpc-v4')}
          />
        </Sequence>
      </AbsoluteFill>
    );
  }
  const top = Math.round((height - lineHeight) / 2);
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b'}}>
      <Audio src={staticFile(audioFile)} />
      {schedule.map((slot, i) => {
        const line = lines[slot.index]!;
        // Fully in place when its first word is heard, `leadInSeconds` earlier.
        const from = Math.max(0, Math.round((slot.start - leadInSeconds) * fps) - enterFrames);
        const nextFrom =
          i + 1 < schedule.length
            ? Math.max(0, Math.round((schedule[i + 1]!.start - leadInSeconds) * fps) - enterFrames)
            : null;
        // Fade through rather than cross-fade: this line's exit ends where the next one's entrance
        // begins, so the slot never holds two half-visible lines of text at once.
        const end = nextFrom !== null ? nextFrom : Math.round((slot.end + 1) * fps);
        return (
          <Sequence
            key={`${line.page}/${line.line}`}
            from={from}
            durationInFrames={Math.max(exitFrames + 1, end - from)}
            premountFor={fps}
            name={`p${line.page} l${line.line} (${line.words[0]!.id})`}
            style={{top, height: lineHeight, left: MARGIN_X, width: measure}}
          >
            <MushafLine
              line={line}
              fontSize={fontSize}
              lineHeight={lineHeight}
              enter={ENTER}
              exit={EXIT}
              {...fontProps(fonts, line.fontSet)}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
