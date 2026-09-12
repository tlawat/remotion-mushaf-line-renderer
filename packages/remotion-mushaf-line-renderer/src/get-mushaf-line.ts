import {KIND_BY_CHAR, indexPage, runAt, type CompiledLayout} from './data/format';
import {loadLayout} from './data/load-layout';
import {MushafError} from './errors';
import {assertLine, assertPage, getMushafDefinition, paletteFor, resolveMushafId, type ResolvedPalette} from './mushafs';
import type {GetMushafLineOptions, MushafId, MushafLineData, MushafWord, MushafWordKind} from './types';

/**
 * Resolves one line of a mushaf page to plain, JSON-serialisable data.
 *
 * Pure and Remotion-free: safe to call in `calculateMetadata()`, in a Node script that prepares
 * `inputProps`, or in a `<Player>` host. The only asynchronous step is loading the mushaf data
 * (QUL's exports, from Tarteel's CDN or the `data` source given), cached after the first call.
 *
 * `mushaf` defaults to the plain `'qpc-v4'` glyphs (black, following CSS `color`); pass
 * `tajweed: true` for QUL's colour font, or `mandala` for its coloured ayah rosettes with the text
 * in the inherited CSS `color`. The returned `mushaf`, `palette` and `paletteColors` are the resolved look, so the data
 * alone determines how the line is painted.
 */
export const getMushafLine = async ({mushaf, tajweed, mandala, page, line, data}: GetMushafLineOptions): Promise<MushafLineData> => {
  const id = resolveMushafId(mushaf, tajweed, mandala);
  const def = getMushafDefinition(id);
  assertPage(def, page);
  assertLine(def, page, line);
  const layout = await loadLayout(def.dataset, data);
  return withPalette(lineFromLayout(layout, id, page, line), paletteFor({tajweed, mandala}));
};

/**
 * Records the palette and its colours on a resolved line. Keys are omitted rather than set to
 * `undefined` when there is nothing to record, so JSON round-trips stay byte-identical.
 */
export const withPalette = (line: MushafLineData, resolved: ResolvedPalette | undefined): MushafLineData =>
  resolved === undefined ? line : {...line, palette: resolved.palette, ...(Object.keys(resolved.paletteColors).length === 0 ? {} : {paletteColors: resolved.paletteColors})};

/** Synchronous core of `getMushafLine()` for an already loaded layout (also used by test fixtures). */
export const lineFromLayout = (layout: CompiledLayout, mushaf: MushafId, page: number, line: number): MushafLineData => {
  const def = getMushafDefinition(mushaf);
  assertPage(def, page);
  assertLine(def, page, line);
  if (page > layout.pages.length) {
    throw new MushafError('DATA_LOAD_FAILED', `Layout data for "${def.dataset}" has ${layout.pages.length} pages; page ${page} is missing. Re-run scripts/fetch-qul.mjs.`, {mushaf, page});
  }
  const index = indexPage(layout, page);
  const entry = index.lines[line - 1];
  if (!entry) {
    throw new MushafError('DATA_LOAD_FAILED', `Layout data for "${def.dataset}" has ${index.lines.length} lines on page ${page}; line ${line} is missing. Re-run scripts/fetch-qul.mjs.`, {mushaf, page, line});
  }

  const words: MushafWord[] = [];
  if (entry.type === 'ayah' && entry.first >= 0) {
    for (let i = entry.first; i <= entry.last; i++) {
      const run = runAt(index, i);
      const position = run.firstPosition + (i - run.start);
      const kind = KIND_BY_CHAR[index.page.k[i] ?? ''];
      if (!kind) {
        throw new MushafError('DATA_LOAD_FAILED', `Layout data for "${def.dataset}" has an unknown word kind "${index.page.k[i]}" on page ${page}.`, {mushaf, page, line});
      }
      words.push({
        id: `${run.surah}:${run.ayah}:${position}`,
        wordId: index.page.w + i,
        surah: run.surah,
        ayah: run.ayah,
        position,
        kind: kind as MushafWordKind,
        text: index.page.t[i] as string,
      });
    }
  }

  const data: MushafLineData = {
    version: 1,
    mushaf,
    page,
    line,
    type: entry.type,
    centered: entry.centered,
    fontFamily: def.fontFamily(page),
    words,
  };
  // The key is omitted rather than set to undefined so JSON round-trips are byte-identical.
  return entry.surahNumber === undefined ? data : {...data, surahNumber: entry.surahNumber};
};
