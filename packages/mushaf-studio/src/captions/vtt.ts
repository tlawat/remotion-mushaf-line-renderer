import {MushafStudioError} from '../errors';
import {type Caption, type CaptionCue, checkCaptionTimes} from './convert';
import {cueText, cueTime} from './srt';

/** WebVTT's `align:` cue setting. `start` and `end` follow the cue text's direction; `left` and `right` do not. */
export type VttAlign = 'start' | 'center' | 'end' | 'left' | 'right';

export type VttOptions = {
  /**
   * `'word'` (default): one cue per caption. `'ayah'`: one cue per ayah, its words joined by a
   * space, from the first word's start to the last one's end; needs the cues of `toCaptionCues()`,
   * which say which ayah each word is in.
   */
  readonly lines?: 'word' | 'ayah' | undefined;
  /**
   * The `align:` setting of every cue; none by default (the player's, `center`). WebVTT takes a
   * cue's direction from its first strong character, so for Arabic text `'start'` puts it at the
   * right edge, as `'right'` does whatever the text.
   */
  readonly align?: VttAlign | undefined;
  /**
   * The `line:` setting of every cue: a line number (negative counts from the bottom, `-1` is the
   * last line) or a percentage of the frame height from the top (`'90%'`). None by default.
   */
  readonly line?: number | `${number}%` | undefined;
};

type CaptionsToVtt = {
  (cues: readonly CaptionCue[], options?: VttOptions): string;
  (captions: readonly Caption[], options?: VttOptions & {readonly lines?: 'word' | undefined}): string;
};

// `&` and `<` start an escape and a tag in cue text; `>` is escaped too, so a caption can never
// hold the `-->` that would end the cue's text.
const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isCue = (item: Caption | CaptionCue): item is CaptionCue => 'caption' in item;

/** Consecutive cues of one ayah as one caption: a recitation that goes back to an ayah makes a cue again. */
const mergeByAyah = (cues: readonly CaptionCue[]): Caption[] => {
  const merged: Caption[] = [];
  let key: string | null = null;
  for (const {caption, surah, ayah} of cues) {
    const last = merged[merged.length - 1];
    const own = `${surah}:${ayah}`;
    if (last !== undefined && own === key) {
      merged[merged.length - 1] = {
        ...last,
        text: `${last.text} ${cueText(caption.text)}`,
        endMs: Math.max(last.endMs, caption.endMs),
      };
    } else merged.push({...caption, text: cueText(caption.text)});
    key = own;
  }
  return merged;
};

const settingsOf = (options: VttOptions): string => {
  const settings: string[] = [];
  if (options.align !== undefined) settings.push(`align:${options.align}`);
  if (options.line !== undefined) {
    if (typeof options.line === 'number' ? !Number.isInteger(options.line) : !/^\d+(\.\d+)?%$/.test(options.line))
      throw new MushafStudioError(
        'BAD_STUDIO_PROP',
        `captionsToVtt() line is ${JSON.stringify(options.line)}: expected a whole line number (-1 for the last line) or a percentage such as "90%".`,
        {option: 'line', value: options.line},
      );
    settings.push(`line:${options.line}`);
  }
  return settings.length === 0 ? '' : ` ${settings.join(' ')}`;
};

/**
 * Captions as WebVTT, for export: the `WEBVTT` header, then one cue per caption (`lines: 'word'`) or
 * per ayah (`lines: 'ayah'`, from the cues of `toCaptionCues()`), times `HH:MM:SS.mmm`, each cue's
 * lines trimmed, blank lines dropped and `&`, `<`, `>` escaped. `align` and `line` add those cue
 * settings to every cue. A time below 0 is written as 0; one that is not a finite number is
 * `BAD_TIMING_EDIT`, naming the caption. `BAD_STUDIO_PROP` for `lines: 'ayah'` on plain captions, or
 * a `line` that is neither a whole number nor a percentage.
 *
 * ```text
 * WEBVTT
 *
 * 00:00:00.320 --> 00:00:03.391 align:start
 * ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ
 * ```
 */
export const captionsToVtt: CaptionsToVtt = (
  input: readonly Caption[] | readonly CaptionCue[],
  options: VttOptions = {},
): string => {
  const items: readonly (Caption | CaptionCue)[] = input;
  const captions = items.map((item) => (isCue(item) ? item.caption : item));
  for (const [i, caption] of captions.entries()) checkCaptionTimes(i, caption);
  let cues: readonly Caption[] = captions.map((caption) => ({...caption, text: cueText(caption.text)}));
  if (options.lines === 'ayah') {
    const tagged = items.filter(isCue);
    if (tagged.length !== items.length)
      throw new MushafStudioError(
        'BAD_STUDIO_PROP',
        "captionsToVtt() with lines: 'ayah' needs to know each caption's ayah: pass the cues of toCaptionCues(timings), not the captions of toCaptions().",
        {option: 'lines'},
      );
    cues = mergeByAyah(tagged);
  }
  const settings = settingsOf(options);
  const body = cues
    .map((cue) => `${cueTime(cue.startMs, '.')} --> ${cueTime(cue.endMs, '.')}${settings}\n${escapeText(cue.text)}\n\n`)
    .join('');
  return `WEBVTT\n\n${body}`;
};
