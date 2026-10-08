import {ayahKey, type CompiledLayout, indexAyahs, indexPage} from '../data/format';
import {loadLayout} from '../data/load-layout';
import {describeValue, MushafError} from '../errors';
import {assertPage, type MushafDefinition, resolveSelection} from '../mushaf/registry';
import type {
  GetMushafLinesForRangesOptions,
  GetMushafLinesOptions,
  GetMushafLocationOptions,
  MushafLineData,
  MushafLocation,
  MushafSlice,
  RecitedRange,
} from '../types';
import {lineFromLayout} from './get-mushaf-line';
import {resolveSlice, type SliceBand} from './slice';

/** The ayahs a line carries, ascending. Empty for `surah_name` and `basmallah` lines. */
export const lineAyahs = (line: MushafLineData): number[] => {
  const seen = new Set<number>();
  for (const word of line.words) seen.add(word.ayah);
  return [...seen].sort((a, b) => a - b);
};

const assertSurah = (surah: unknown): number => {
  if (typeof surah !== 'number' || !Number.isInteger(surah) || surah < 1 || surah > 114) {
    throw new MushafError('AYAH_NOT_FOUND', `surah must be an integer from 1 to 114, got ${describeValue(surah)}.`, {
      surah,
    });
  }
  return surah;
};

const assertAyah = (name: string, ayah: unknown): number => {
  if (typeof ayah !== 'number' || !Number.isInteger(ayah) || ayah < 1) {
    throw new MushafError('AYAH_NOT_FOUND', `${name} must be a positive integer, got ${describeValue(ayah)}.`, {
      [name]: ayah,
    });
  }
  return ayah;
};

/** Highest ayah number of a surah in the compiled data; 0 when the data has no such surah. */
const lastAyahOf = (layout: CompiledLayout, surah: number): number => {
  const index = indexAyahs(layout);
  let last = 0;
  // The longest surah has 286 ayahs; the loop stops at the first gap after the surah's ayahs.
  for (let a = 1; a <= 300; a++) if (index.has(ayahKey(surah, a))) last = a;
  return last;
};

/** The page carrying the first word of an ayah, or a loud error naming the highest ayah of the surah. */
const pageOfAyah = (layout: CompiledLayout, def: MushafDefinition, surah: number, ayah: number): number => {
  const page = indexAyahs(layout).get(ayahKey(surah, ayah));
  if (page === undefined) {
    const last = lastAyahOf(layout, surah);
    throw new MushafError(
      'AYAH_NOT_FOUND',
      last === 0
        ? `"${def.id}" has no surah ${surah}.`
        : `Surah ${surah} of "${def.id}" ends at ayah ${last}; ayah ${ayah} does not exist.`,
      {mushaf: def.id, surah, ayah, lastAyah: last},
    );
  }
  return page;
};

/** Pages present in the loaded data — never more than the registry's page count. */
const pagesOf = (layout: CompiledLayout, def: MushafDefinition): number => Math.min(def.pages, layout.pages.length);

const locate = (layout: CompiledLayout, def: MushafDefinition, surah: number, ayah: number): MushafLocation => {
  const page = pageOfAyah(layout, def, surah, ayah);
  const index = indexPage(layout, page);
  for (let line = 1; line <= index.lines.length; line++) {
    const entry = index.lines[line - 1];
    if (entry?.type !== 'ayah' || entry.first < 0) continue;
    const hit = index.runs.some(
      (run) => run.surah === surah && run.ayah === ayah && run.start <= entry.last && run.end >= entry.first,
    );
    if (hit) return {page, line};
  }
  // The ayah index said this page carries the ayah, so a line must contain it.
  throw new MushafError(
    'DATA_LOAD_FAILED',
    `The layout data for "${def.dataset}" places ${surah}:${ayah} on page ${page} but no line on that page carries it. Check the data source.`,
    {mushaf: def.id, surah, ayah, page},
  );
};

/** Where a surah (or one of its ayahs) is printed: `{page, line}` of its first word. */
export const getMushafLocation = async ({
  mushaf,
  surah,
  ayah = 1,
  data,
}: GetMushafLocationOptions): Promise<MushafLocation> => {
  const {def} = resolveSelection({mushaf});
  assertSurah(surah);
  assertAyah('ayah', ayah);
  const layout = await loadLayout(def.dataset, data);
  return locate(layout, def, surah, ayah);
};

/**
 * Resolves several lines at once, in reading order — the two shapes an app actually needs:
 *
 * - `{page}`: every line of that page, `surah_name` and `basmallah` lines included (they carry no
 *   words; `<MushafLine>` renders `ayah` lines only, so filter on `line.type`).
 * - `{surah, fromAyah?, toAyah?}`: every line that carries a word of that ayah range, wherever it is
 *   printed — the page is found through the compiled ayah index, so callers never guess a start page.
 *   A line at either end of the range usually carries neighbouring ayahs too; that is how the mushaf
 *   is printed, and `lineAyahs(line)` says which ayahs a line holds. `slice: true` records the range
 *   on the lines it cuts, so `<MushafLine>` shows only the ayahs asked for.
 *
 * Pure and Remotion-free, like `getMushafLine()`. `data` names the mushaf data source (default:
 * QUL's exports on Tarteel's CDN). Where the fonts come from is decided where the lines are drawn
 * (`<MushafLine fontSrc fontFallback>`), not here.
 */
export const getMushafLines = async (options: GetMushafLinesOptions): Promise<MushafLineData[]> => {
  const {mushaf, theme, data} = options;
  if ((options as {readonly fontUrl?: unknown}).fontUrl !== undefined) {
    throw new MushafError(
      'BAD_FONT_SRC',
      'getMushafLines(): `fontUrl` was removed in 0.4. Pass `fontSrc` (your own URLs) or `fontFallback` (a fonts package) to <MushafLine> or loadPageFont() instead.',
      {fontUrl: (options as {readonly fontUrl?: unknown}).fontUrl},
    );
  }
  const resolved = resolveSelection({mushaf, theme});
  const {def} = resolved;
  const layout = await loadLayout(def.dataset, data);
  const lineAt = (page: number, line: number): MushafLineData => lineFromLayout(layout, resolved, page, line);

  if (options.slice !== undefined && typeof options.slice !== 'boolean') {
    throw new MushafError(
      'BAD_SLICE',
      `getMushafLines(): slice must be true or false when given, got ${describeValue(options.slice)}.`,
      {slice: options.slice},
    );
  }

  if (options.page !== undefined) {
    const page = assertPage(def, options.page);
    // `slice` is typed `never` on this form; a JS caller still gets told why.
    if ((options as {readonly slice?: unknown}).slice !== undefined) {
      throw new MushafError(
        'BAD_SLICE',
        'getMushafLines(): `slice` goes with the {surah, fromAyah, toAyah} form — a page has no ayah range to slice to.',
        {page},
      );
    }
    if (page > layout.pages.length) {
      throw new MushafError(
        'DATA_LOAD_FAILED',
        `The layout data for "${def.dataset}" has ${layout.pages.length} pages; page ${page} is missing. Check the data source.`,
        {mushaf: def.id, page},
      );
    }
    return indexPage(layout, page).lines.map((_, i) => lineAt(page, i + 1));
  }

  const range = assertRange(layout, def, options.surah, options.fromAyah, options.toAyah);
  // The range, recorded on the lines it cuts — the first and/or last of the passage, when they
  // carry words of other ayahs — so <MushafLine> shows only these ayahs there. Lines the range keeps
  // whole carry nothing: they render as printed, and the data says so. The words stay whole always.
  const slice = {fromAyah: range.fromAyah, toAyah: range.toAyah};
  const sliced = (line: MushafLineData): MushafLineData =>
    options.slice && resolveSlice(line, slice) !== null ? {...line, slice} : line;
  return linesOfRange(layout, def, range).map((at) => sliced(lineAt(at.page, at.line)));
};

/** Validates one ayah range against the loaded data, defaults filled in. */
const assertRange = (
  layout: CompiledLayout,
  def: MushafDefinition,
  surahValue: unknown,
  fromAyahValue: unknown,
  toAyahValue: unknown,
): RecitedRange & {readonly start: MushafLocation} => {
  const surah = assertSurah(surahValue);
  const fromAyah = assertAyah('fromAyah', fromAyahValue ?? 1);
  // Locating the first ayah first, so a missing one is reported as such rather than as a bad range.
  const start = locate(layout, def, surah, fromAyah);
  const toAyah = toAyahValue === undefined ? lastAyahOf(layout, surah) : assertAyah('toAyah', toAyahValue);
  if (toAyah < fromAyah) {
    throw new MushafError('AYAH_NOT_FOUND', `toAyah (${toAyah}) is before fromAyah (${fromAyah}).`, {
      surah,
      fromAyah,
      toAyah,
    });
  }
  return {surah, fromAyah, toAyah, start};
};

/** Where the lines carrying a word of a validated range are, in reading order. */
const linesOfRange = (
  layout: CompiledLayout,
  def: MushafDefinition,
  {surah, fromAyah, toAyah, start}: RecitedRange & {readonly start: MushafLocation},
): MushafLocation[] => {
  const out: MushafLocation[] = [];
  for (let page = start.page; page <= pagesOf(layout, def); page++) {
    const index = indexPage(layout, page);
    for (let line = page === start.page ? start.line : 1; line <= index.lines.length; line++) {
      const entry = index.lines[line - 1];
      if (entry?.type !== 'ayah' || entry.first < 0) continue;
      const runs = index.runs.filter((run) => run.start <= entry.last && run.end >= entry.first);
      const overlaps = runs.some((run) => run.surah === surah && run.ayah >= fromAyah && run.ayah <= toAyah);
      if (overlaps) {
        out.push({page, line});
        continue;
      }
      // Every word of this line is past the range (later surah, or a later ayah): done.
      if (runs.every((run) => run.surah > surah || (run.surah === surah && run.ayah > toAyah))) return out;
    }
  }
  return out;
};

/**
 * The header lines printed before a surah's first ayah, in reading order: its `surah_name` line and,
 * when it has one, its `basmallah` line. Walks back from the line of ayah 1, onto the previous page
 * when the header closes it.
 */
const headerLinesOf = (layout: CompiledLayout, def: MushafDefinition, surah: number): MushafLocation[] => {
  const start = locate(layout, def, surah, 1);
  const out: MushafLocation[] = [];
  let {page, line} = start;
  for (;;) {
    line--;
    if (line < 1) {
      page--;
      if (page < 1) break;
      line = indexPage(layout, page).lines.length;
    }
    const entry = indexPage(layout, page).lines[line - 1];
    if (entry === undefined || entry.type === 'ayah' || entry.surahNumber !== surah) break;
    out.unshift({page, line});
  }
  return out;
};

type Kept = {
  readonly data: MushafLineData;
  /** The band of `wordId`s the ranges keep on this line, when any range reaches it. */
  band: SliceBand | null;
  /** The one range that reached the line, while only one has. */
  range: RecitedRange | null;
  ranges: number;
};

/**
 * The lines of several ayah ranges in reading order, for a recitation that crosses surahs (a juz, a
 * hizb): `recitedRanges(timings)` gives the ranges. Each range's lines come as `getMushafLines()`
 * finds them, sliced like `slice: true` (default; `slice: false` keeps every line whole). Between
 * two surahs come the later surah's header lines as printed (its `surah_name` line and its
 * `basmallah` line, when it has one), when its range starts at ayah 1.
 *
 * A line two ranges share appears once: a page where one surah ends mid-page and the next begins, or
 * a line carrying the end of one range and the start of the next. Its slice keeps both ranges' words,
 * as a word band from the first kept word to the last (`{fromWordId, toWordId}`); a line one range
 * cuts alone carries `{fromAyah, toAyah}`, exactly as `getMushafLines({slice: true})` records it.
 *
 * Ranges must be in reading order and must not overlap: each starts after the previous one ends.
 * An empty list gives no lines.
 */
export const getMushafLinesForRanges = async (
  ranges: readonly RecitedRange[],
  options: GetMushafLinesForRangesOptions = {},
): Promise<MushafLineData[]> => {
  const {mushaf, theme, data} = options;
  const resolved = resolveSelection({mushaf, theme});
  const {def} = resolved;
  if (!Array.isArray(ranges)) {
    throw new MushafError(
      'AYAH_NOT_FOUND',
      `getMushafLinesForRanges(): ranges must be an array of {surah, fromAyah, toAyah}, got ${describeValue(ranges)}.`,
      {ranges},
    );
  }
  if (options.slice !== undefined && typeof options.slice !== 'boolean') {
    throw new MushafError(
      'BAD_SLICE',
      `getMushafLinesForRanges(): slice must be true or false when given, got ${describeValue(options.slice)}.`,
      {slice: options.slice},
    );
  }
  if (ranges.length === 0) return [];
  const layout = await loadLayout(def.dataset, data);
  const checked = ranges.map((range, i) => {
    if (typeof range !== 'object' || range === null) {
      throw new MushafError(
        'AYAH_NOT_FOUND',
        `getMushafLinesForRanges(): ranges[${i}] must be {surah, fromAyah, toAyah}, got ${describeValue(range)}.`,
        {index: i},
      );
    }
    return assertRange(layout, def, range.surah, range.fromAyah, range.toAyah);
  });
  checked.forEach((range, i) => {
    const previous = checked[i - 1];
    if (previous && ayahKey(range.surah, range.fromAyah) <= ayahKey(previous.surah, previous.toAyah)) {
      throw new MushafError(
        'AYAH_NOT_FOUND',
        `getMushafLinesForRanges(): ranges[${i}] (${range.surah}:${range.fromAyah}-${range.toAyah}) does not start after ranges[${i - 1}] (${previous.surah}:${previous.fromAyah}-${previous.toAyah}). Give the ranges in reading order, without overlaps.`,
        {index: i},
      );
    }
  });

  const kept = new Map<string, Kept>();
  const order: Kept[] = [];
  const keep = (at: MushafLocation): Kept => {
    const key = `${at.page}:${at.line}`;
    let entry = kept.get(key);
    if (!entry) {
      entry = {data: lineFromLayout(layout, resolved, at.page, at.line), band: null, range: null, ranges: 0};
      kept.set(key, entry);
      order.push(entry);
    }
    return entry;
  };
  checked.forEach((range, i) => {
    const previous = checked[i - 1];
    if (previous && previous.surah !== range.surah && range.fromAyah === 1) {
      for (const at of headerLinesOf(layout, def, range.surah)) keep(at);
    }
    for (const at of linesOfRange(layout, def, range)) {
      const entry = keep(at);
      for (const word of entry.data.words) {
        if (word.surah !== range.surah || word.ayah < range.fromAyah || word.ayah > range.toAyah) continue;
        entry.band = {
          first: Math.min(entry.band?.first ?? word.wordId, word.wordId),
          last: Math.max(entry.band?.last ?? word.wordId, word.wordId),
        };
      }
      entry.ranges++;
      entry.range = {surah: range.surah, fromAyah: range.fromAyah, toAyah: range.toAyah};
    }
  });

  const sliceOf = ({data: line, band, range, ranges: count}: Kept): MushafSlice | null => {
    const words = line.words;
    if (band === null || range === null || words.length === 0) return null;
    if (band.first === words[0]!.wordId && band.last === words[words.length - 1]!.wordId) return null;
    // One range on a line of its own surah: the ayah form, as getMushafLines({slice: true}) records it.
    if (count === 1 && words.every((word) => word.surah === range.surah))
      return {fromAyah: range.fromAyah, toAyah: range.toAyah};
    return {fromWordId: band.first, toWordId: band.last};
  };
  return order.map((entry) => {
    const slice = options.slice === false ? null : sliceOf(entry);
    return slice === null ? entry.data : {...entry.data, slice};
  });
};
