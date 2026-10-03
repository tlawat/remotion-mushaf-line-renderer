import {type Caption, checkCaptionTimes} from './convert';

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** `HH:MM:SS,mmm`; past 99 hours the hours take more digits rather than wrap. */
const srtTime = (ms: number): string => {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(total % 1000, 3)}`;
};

// A blank line ends a cue in SRT, so a caption's own blank lines are dropped; the space that
// `toCaptions()` puts before every word but the first is trimmed with the rest.
const cueText = (text: string): string =>
  text
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');

/**
 * Captions as SRT, for export: one cue per caption, numbered from 1, each followed by a blank line,
 * each line of a caption's text trimmed. A time below 0 is written as 0; one that is not a finite
 * number is `BAD_TIMING_EDIT`, naming the caption.
 *
 * ```text
 * 1
 * 00:00:00,320 --> 00:00:00,890
 * ٱلْحَمْدُ
 * ```
 */
export const captionsToSrt = (captions: readonly Caption[]): string =>
  captions
    .map((caption, i) => {
      checkCaptionTimes(i, caption);
      return `${i + 1}\n${srtTime(caption.startMs)} --> ${srtTime(caption.endMs)}\n${cueText(caption.text)}\n\n`;
    })
    .join('');
