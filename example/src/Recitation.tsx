// A real-life use of the package: a recited passage with the printed lines shown in time with the
// audio. Input: a timings JSON (one entry per ayah with a start/end and, optionally, per-word times)
// produced by tools/align-recitation.py. The composition resolves the printed lines that carry those
// ayahs, schedules one <Sequence> per line from the time of its first word, and animates each line
// in with a vertical slide + fade and out the same way while the next one arrives.
import * as React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {linearTiming, type TransitionPresentation, type TransitionPresentationComponentProps} from '@remotion/transitions';
import {MushafLine, getMushafLine, type MushafId, type MushafLineData} from 'remotion-mushaf-line-renderer';

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
  /** First page of the surah (page 187 for At-Tawbah); the lines are found from there. */
  startPage: number;
  /** Timings JSON in the public folder, e.g. 'audio/tawbah-timings.json'; or pass `timings` inline. */
  timingsFile: string | null;
  timings: RecitationTimings | null;
  /** Audio in the public folder, e.g. 'audio/tawbah.mp3'. */
  audioFile: string;
  /** Font pin pattern in the public folder ('fonts/qpc-v4-tajweed/p{page}.woff2'); null uses QUL's CDN. */
  fontFilePattern: string | null;
  /** Stop after the last ayah that ends before this many seconds; null plays the whole recitation. */
  cutAtSeconds: number | null;
  /** Seconds a line is on screen before its first word is heard. */
  leadInSeconds: number;
  /** Seconds the entrance/exit animation lasts. */
  transitionSeconds: number;
  /** Filled in by calculateMetadata. */
  lines: MushafLineData[] | null;
  schedule: LineSchedule[] | null;
};

export const defaultRecitationProps: RecitationProps = {
  mushaf: 'qpc-v4-tajweed',
  startPage: 187,
  timingsFile: 'audio/tawbah-timings.json',
  timings: null,
  audioFile: 'audio/tawbah.mp3',
  fontFilePattern: null,
  cutAtSeconds: 60,
  leadInSeconds: 0.4,
  transitionSeconds: 0.4,
  lines: null,
  schedule: null,
};

const MARGIN_X = 120;

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

/** The printed lines that carry ayahs first..last of `surah`, scanning pages from `startPage`. */
const findLines = async (mushaf: MushafId, startPage: number, surah: number, firstAyah: number, lastAyah: number): Promise<MushafLineData[]> => {
  const out: MushafLineData[] = [];
  let started = false;
  for (let page = startPage; page <= startPage + 40; page++) {
    for (let line = 1; line <= (page <= 2 ? 8 : 15); line++) {
      const data = await getMushafLine({mushaf, page, line});
      if (data.type !== 'ayah' || data.words.length === 0) continue;
      const last = data.words[data.words.length - 1]!;
      const beyond = last.surah > surah || (last.surah === surah && last.ayah > lastAyah);
      if (!started) {
        const covers = data.words.some((w) => w.surah === surah && w.ayah === firstAyah);
        if (!covers) {
          if (beyond) return out;
          continue;
        }
        started = true;
      }
      out.push(data);
      if (beyond || (last.surah === surah && last.ayah === lastAyah && last.kind === 'end')) return out;
    }
  }
  return out;
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

  const lines = await findLines(props.mushaf, props.startPage, timings.surah, firstAyah, lastAyah);
  const fontUrl = (page: number) => (props.fontFilePattern ? staticFile(props.fontFilePattern.replace('{page}', String(page))) : null);
  const pinned = lines.map((line) => {
    const url = fontUrl(line.page);
    return url ? {...line, fontUrl: url} : line;
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
  return {props: {...props, lines: pinned, schedule}, durationInFrames};
};

// Vertical slide + fade, written the way any @remotion/transitions presentation is: entering
// rises from below while fading in; exiting continues upwards while fading out.
type SlideFadeProps = {distancePercent?: number};
const VerticalSlideFade: React.FC<TransitionPresentationComponentProps<SlideFadeProps>> = ({children, presentationDirection, presentationProgress, passedProps}) => {
  const distance = passedProps.distancePercent ?? 60;
  const p = presentationProgress;
  const style: React.CSSProperties =
    presentationDirection === 'entering' ? {opacity: p, transform: `translateY(${((1 - p) * distance).toFixed(3)}%)`} : {opacity: 1 - p, transform: `translateY(${(-p * distance).toFixed(3)}%)`};
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
export const verticalSlideFade = (props: SlideFadeProps = {}): TransitionPresentation<SlideFadeProps> => ({component: VerticalSlideFade, props});

export const Recitation: React.FC<RecitationProps> = ({lines, schedule, audioFile, leadInSeconds, transitionSeconds}) => {
  const {width, height, fps} = useVideoConfig();
  if (!lines || !schedule) throw new Error('Recitation: `lines`/`schedule` are null; calculateMetadata fills them in.');
  const measure = width - 2 * MARGIN_X;
  const fontSize = Math.floor((measure * 2500) / 42501);
  const lineHeight = Math.round(2.2 * fontSize);
  const top = Math.round((height - lineHeight) / 2);
  const transition = Math.max(1, Math.round(transitionSeconds * fps));
  const timing = linearTiming({durationInFrames: transition});
  const animation = {presentation: verticalSlideFade(), timing};
  return (
    <AbsoluteFill style={{backgroundColor: '#fbf7ee'}}>
      <Audio src={staticFile(audioFile)} />
      {schedule.map((slot, i) => {
        const line = lines[slot.line]!;
        // Fully in when the first word is heard; leaves while the next line comes in.
        const from = Math.max(0, Math.round((slot.start - leadInSeconds) * fps) - transition);
        const nextFrom = i + 1 < schedule.length ? Math.max(0, Math.round((schedule[i + 1]!.start - leadInSeconds) * fps) - transition) : null;
        const end = nextFrom !== null ? nextFrom + transition : Math.round((slot.end + 1) * fps);
        return (
          <Sequence key={`${line.page}/${line.line}`} from={from} durationInFrames={Math.max(1, end - from)} premountFor={fps} name={`p${line.page} l${line.line} (${line.words[0]!.id})`} style={{top, height: lineHeight, left: MARGIN_X, width: measure}}>
            <MushafLine line={line} fontSize={fontSize} lineHeight={lineHeight} enter={animation} exit={animation} style={{color: '#1b1b1b'}} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
