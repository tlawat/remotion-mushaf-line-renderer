import {ayahKey, indexAyahs, indexPage, type CompiledLayout} from './data/format';
import {loadLayout} from './data/load-layout';
import {MushafError, describeValue} from './errors';
import {lineFromLayout, withPalette} from './get-mushaf-line';
import {resolveSlice} from './slice';
import {assertPage, getMushafDefinition, paletteFor, resolveMushafId, type MushafDefinition} from './mushafs';
import type {GetMushafLinesOptions, GetMushafLocationOptions, MushafFontUrl, MushafId, MushafLineData, MushafLocation} from './types';

/** The ayahs a line carries, ascending. Empty for `surah_name` and `basmallah` lines. */
export const lineAyahs = (line: MushafLineData): number[] => {
  const seen = new Set<number>();
  for (const word of line.words) seen.add(word.ayah);
  return [...seen].sort((a, b) => a - b);
};

const assertSurah = (surah: unknown): number => {
  if (typeof surah !== 'number' || !Number.isInteger(surah) || surah < 1 || surah > 114) {
    throw new MushafError('AYAH_NOT_FOUND', `surah must be an integer from 1 to 114, got ${describeValue(surah)}.`, {surah});
  }
  return surah;
};

const assertAyah = (name: string, ayah: unknown): number => {
  if (typeof ayah !== 'number' || !Number.isInteger(ayah) || ayah < 1) {
    throw new MushafError('AYAH_NOT_FOUND', `${name} must be a positive integer, got ${describeValue(ayah)}.`, {[name]: ayah});
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
      last === 0 ? `"${def.id}" has no surah ${surah}.` : `Surah ${surah} of "${def.id}" ends at ayah ${last}; ayah ${ayah} does not exist.`,
      {mushaf: def.id, surah, ayah, lastAyah: last},
    );
  }
  return page;
};

/** Pages present in the compiled data — the registry's page count until the data is compiled. */
const pagesOf = (layout: CompiledLayout, def: MushafDefinition): number => Math.min(def.pages, layout.pages.length);

/** Where a surah (or one of its ayahs) is printed: `{page, line}` of its first word. */
export const getMushafLocation = async ({mushaf, surah, ayah = 1}: GetMushafLocationOptions): Promise<MushafLocation> => {
  const def = getMushafDefinition(mushaf ?? resolveMushafId(undefined, undefined));
  assertSurah(surah);
  assertAyah('ayah', ayah);
  const layout = await loadLayout(def.dataset);
  const page = pageOfAyah(layout, def, surah, ayah);
  const index = indexPage(layout, page);
  for (let line = 1; line <= index.lines.length; line++) {
    const entry = index.lines[line - 1];
    if (!entry || entry.type !== 'ayah' || entry.first < 0) continue;
    const hit = index.runs.some((run) => run.surah === surah && run.ayah === ayah && run.start <= entry.last && run.end >= entry.first);
    if (hit) return {page, line};
  }
  // The ayah index said this page carries the ayah, so a line must contain it.
  throw new MushafError('DATA_LOAD_FAILED', `Layout data for "${def.dataset}" places ${surah}:${ayah} on page ${page} but no line on that page carries it. Re-run scripts/fetch-qul.mjs.`, {mushaf: def.id, surah, ayah, page});
};

const pinFontUrl = (line: MushafLineData, fontUrl: MushafFontUrl | undefined, mushaf: MushafId): MushafLineData =>
  fontUrl ? {...line, fontUrl: fontUrl(line.page, mushaf)} : line;

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
 * Pure and Remotion-free, like `getMushafLine()`. `fontUrl` pins a mirror on every returned line.
 */
export const getMushafLines = async (options: GetMushafLinesOptions): Promise<MushafLineData[]> => {
  const id = resolveMushafId(options.mushaf, options.tajweed, options.mandala);
  const def = getMushafDefinition(id);
  const layout = await loadLayout(def.dataset);
  const palette = paletteFor(options);
  const resolved = (line: MushafLineData): MushafLineData => withPalette(pinFontUrl(line, options.fontUrl, id), palette);

  if (options.slice !== undefined && typeof options.slice !== 'boolean') {
    throw new MushafError('BAD_SLICE', `getMushafLines(): slice must be true or false when given, got ${describeValue(options.slice)}.`, {slice: options.slice});
  }

  if (options.page !== undefined) {
    const page = assertPage(def, options.page);
    // `slice` is typed `never` on this form; a JS caller still gets told why.
    if ((options as {readonly slice?: unknown}).slice !== undefined) {
      throw new MushafError('BAD_SLICE', 'getMushafLines(): `slice` goes with the {surah, fromAyah, toAyah} form — a page has no ayah range to slice to.', {page});
    }
    if (page > layout.pages.length) {
      throw new MushafError('DATA_LOAD_FAILED', `Layout data for "${def.dataset}" has ${layout.pages.length} pages; page ${page} is missing. Re-run scripts/fetch-qul.mjs.`, {mushaf: id, page});
    }
    const index = indexPage(layout, page);
    return index.lines.map((_, i) => resolved(lineFromLayout(layout, id, page, i + 1)));
  }

  const surah = assertSurah(options.surah);
  const fromAyah = assertAyah('fromAyah', options.fromAyah ?? 1);
  // Locating the first ayah first, so a missing one is reported as such rather than as a bad range.
  const start = await getMushafLocation({mushaf: id, surah, ayah: fromAyah});
  const toAyah = options.toAyah === undefined ? lastAyahOf(layout, surah) : assertAyah('toAyah', options.toAyah);
  if (toAyah < fromAyah) {
    throw new MushafError('AYAH_NOT_FOUND', `toAyah (${toAyah}) is before fromAyah (${fromAyah}).`, {surah, fromAyah, toAyah});
  }
  // The range, recorded on the lines it cuts — the first and/or last of the passage, when they
  // carry words of other ayahs — so <MushafLine> shows only these ayahs there. Lines the range keeps
  // whole carry nothing: they render as printed, and the data says so. The words stay whole always.
  const range = {fromAyah, toAyah};
  const sliced = (line: MushafLineData): MushafLineData => (options.slice && resolveSlice(line, range) !== null ? {...line, slice: range} : line);
  const out: MushafLineData[] = [];
  for (let page = start.page; page <= pagesOf(layout, def); page++) {
    const index = indexPage(layout, page);
    for (let line = page === start.page ? start.line : 1; line <= index.lines.length; line++) {
      const entry = index.lines[line - 1];
      if (!entry || entry.type !== 'ayah' || entry.first < 0) continue;
      const runs = index.runs.filter((run) => run.start <= entry.last && run.end >= entry.first);
      const overlaps = runs.some((run) => run.surah === surah && run.ayah >= fromAyah && run.ayah <= toAyah);
      if (overlaps) {
        out.push(sliced(resolved(lineFromLayout(layout, id, page, line))));
        continue;
      }
      // Every word of this line is past the range (later surah, or a later ayah): done.
      if (runs.every((run) => run.surah > surah || (run.surah === surah && run.ayah > toAyah))) return out;
    }
  }
  return out;
};
