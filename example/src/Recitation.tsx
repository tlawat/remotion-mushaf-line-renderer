// A real-life use of the package: a recited passage with the printed lines shown in time with the
// audio. Input: a timings JSON (one entry per ayah with a start/end and, optionally, per-word times)
// produced by tools/align-recitation.py. The composition asks the package for the lines that carry
// those ayahs, schedules one <Sequence> per line from the time of its first word, and animates each
// line in and out with the package's slide+fade.
import * as React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {
  MushafLine,
  enterTiming,
  exitTiming,
  fontSizeForWidth,
  getMushafLines,
  lineHeightForFontSize,
  type MushafId,
  type MushafColors,
  type MushafLineData,
} from 'remotion-mushaf-line-renderer';
import {slideFade} from 'remotion-mushaf-line-renderer/presentations/slide-fade';

export type WordTiming = {id: string; start: number; end: number};
export type AyahTiming = {ayah: number; start: number; end: number; complete?: boolean; words?: WordTiming[]};
export type RecitationTimings = {surah: number; audio?: string; durationSeconds?: number; ayat: AyahTiming[]};

export type LineSchedule = {
  /** Index into `lines`. */
  line: number;
  /** Seconds at which the line's first word is heard, and at which the next line takes over. */
  start: number;
  end: number;
};

export type RecitationProps = {
  mushaf: MushafId;
  /** Colour font (tajweed) instead of plain black glyphs. */
  tajweed: boolean;
  /** The ayah rosettes in colour with the text following CSS `color`; an object recolours parts. */
  mandala: boolean | MushafColors;
  /** Timings JSON in the public folder, e.g. 'audio/tawbah-timings.json'; or pass `timings` inline. */
  timingsFile: string | null;
  timings: RecitationTimings | null;
  /** Audio in the public folder, e.g. 'audio/tawbah.mp3'. */
  audioFile: string;
  /** Font pin pattern in the public folder ('fonts/{mushaf}/p{page}.woff2'); null uses QUL's CDN. */
  fontFilePattern: string | null;
  /** Stop after the last ayah that ends before this many seconds; null plays the whole recitation. */
  cutAtSeconds: number | null;
  /** Seconds a line is on screen before its first word is heard. */
  leadInSeconds: number;
  /** Filled in by calculateMetadata. */
  lines: MushafLineData[] | null;
  schedule: LineSchedule[] | null;
};

export const defaultRecitationProps: RecitationProps = {
  mushaf: 'qpc-v4',
  tajweed: false,
  mandala: false,
  timingsFile: 'audio/tawbah-timings.json',
  timings: null,
  audioFile: 'audio/tawbah.mp3',
  fontFilePattern: null,
  cutAtSeconds: 60,
  leadInSeconds: 0.4,
  lines: null,
  schedule: null,
};

const MARGIN_X = 120;

// One pair for every line: the package's slide+fade with its default timings — 0.5 s decelerating
// in, 0.32 s accelerating out. The exit of a line finishes where the next line's entrance starts
// (see `from`/`durationInFrames` below), so two lines of text never cross-fade through each other.
const ENTER = {presentation: slideFade(), timing: enterTiming()};
const EXIT = {presentation: slideFade(), timing: exitTiming()};

const parseId = (id: string) => {
  const [s, a, w] = id.split(':').map(Number);
  return {surah: s!, ayah: a!, position: w!};
};

/** Start time of a word: its own timing, else interpolated inside its ayah by position. */
const wordStart = (timing: AyahTiming, position: number, wordCount: number): number => {
  const exact = timing.words?.find((w) => parseId(w.id).position === position);
  if (exact) return exact.start;
  return timing.start + ((timing.end - timing.start) * (position - 1)) / Math.max(1, wordCount);
};

export const calculateRecitationMetadata: CalculateMetadataFunction<RecitationProps> = async ({props}) => {
  const timings: RecitationTimings | null = props.timings ?? (props.timingsFile ? await (await fetch(staticFile(props.timingsFile))).json() : null);
  if (!timings || timings.ayat.length === 0) throw new Error('Recitation: pass `timings` or a `timingsFile` with at least one ayah.');
  const usable = timings.ayat.filter((a) => a.complete !== false);
  const cut = props.cutAtSeconds;
  const chosen = cut === null ? usable : usable.filter((a, i) => i === 0 || a.end <= cut);
  const firstAyah = chosen[0]!.ayah;
  const lastAyah = chosen[chosen.length - 1]!.ayah;
  const byAyah = new Map(chosen.map((a) => [a.ayah, a]));

  // One call: the package finds the page itself and pins the font of every line it returns.
  const pattern = props.fontFilePattern;
  const lines = await getMushafLines({
    mushaf: props.mushaf,
    tajweed: props.tajweed,
    mandala: props.mandala,
    surah: timings.surah,
    fromAyah: firstAyah,
    toAyah: lastAyah,
    ...(pattern ? {fontUrl: (page: number, mushaf: MushafId) => staticFile(pattern.replace('{mushaf}', mushaf).replace('{page}', String(page)))} : {}),
  });

  // A line starts when its first recited word starts and ends when the next line starts.
  const starts = lines.map((line) => {
    const word = line.words.find((w) => byAyah.has(w.ayah)) ?? line.words[0]!;
    const timing = byAyah.get(word.ayah);
    if (!timing) return null;
    // Only needed without per-word times: the ayah's word count is then estimated from what is visible.
    const wordCount = timing.words?.length ?? Math.max(word.position, line.words.filter((w) => w.ayah === word.ayah).length);
    return Math.max(0, wordStart(timing, word.position, wordCount));
  });
  const lastEnd = byAyah.get(lastAyah)!.end;
  const schedule: LineSchedule[] = [];
  lines.forEach((_, i) => {
    const start = starts[i];
    if (start === null) return;
    const next = starts.slice(i + 1).find((s): s is number => s !== null);
    schedule.push({line: i, start, end: next ?? lastEnd});
  });
  const fps = 30;
  const durationInFrames = Math.ceil((lastEnd + 1) * fps);
  return {props: {...props, lines, schedule}, durationInFrames};
};

export const Recitation: React.FC<RecitationProps> = ({lines, schedule, audioFile, leadInSeconds}) => {
  const {width, height, fps} = useVideoConfig();
  if (!lines || !schedule) throw new Error('Recitation: `lines`/`schedule` are null; calculateMetadata fills them in.');
  const measure = width - 2 * MARGIN_X;
  const fontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(fontSize);
  const top = Math.round((height - lineHeight) / 2);
  const enterFrames = enterTiming().getDurationInFrames({fps});
  const exitFrames = exitTiming().getDurationInFrames({fps});
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee', color: '#1b1b1b'}}>
      <Audio src={staticFile(audioFile)} />
      {schedule.map((slot, i) => {
        const line = lines[slot.line]!;
        // Fully in place when its first word is heard, `leadInSeconds` earlier.
        const from = Math.max(0, Math.round((slot.start - leadInSeconds) * fps) - enterFrames);
        const nextFrom = i + 1 < schedule.length ? Math.max(0, Math.round((schedule[i + 1]!.start - leadInSeconds) * fps) - enterFrames) : null;
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
            <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} enter={ENTER} exit={EXIT} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
