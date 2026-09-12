import {type CompiledLayout, indexPage, KIND_BY_CHAR, runAt} from '../data/format';
import {loadLayout} from '../data/load-layout';
import {MushafError} from '../errors';
import {assertLine, assertPage, type ResolvedSelection, resolveSelection} from '../mushaf/registry';
import type {GetMushafLineOptions, MushafLineData, MushafWord, MushafWordKind} from '../types';

/**
 * Resolves one line of a mushaf page to plain, JSON-serialisable data.
 *
 * Pure and Remotion-free: safe to call in `calculateMetadata()`, in a Node script that prepares
 * `inputProps`, or in a `<Player>` host. The only asynchronous step is loading the mushaf data
 * (QUL's exports, from Tarteel's CDN or the `data` source given), cached after the first call.
 *
 * The returned `look`, `fontSet` and `colors` are the resolved appearance, so the data alone
 * decides how the line is painted.
 */
export const getMushafLine = async ({
  page,
  line,
  data,
  ...selection
}: GetMushafLineOptions): Promise<MushafLineData> => {
  const resolved = resolveSelection(selection);
  assertPage(resolved.def, page);
  assertLine(resolved.def, page, line);
  const layout = await loadLayout(resolved.def.dataset, data);
  return lineFromLayout(layout, resolved, page, line);
};

/** Synchronous core of `getMushafLine()` for an already loaded layout (also used by test fixtures). */
export const lineFromLayout = (
  layout: CompiledLayout,
  {def, look, fontSet, colors}: ResolvedSelection,
  page: number,
  line: number,
): MushafLineData => {
  assertPage(def, page);
  assertLine(def, page, line);
  const dataProblem = (problem: string) =>
    new MushafError('DATA_LOAD_FAILED', `The layout data for "${def.dataset}" ${problem}. Check the data source.`, {
      mushaf: def.id,
      page,
      line,
    });
  if (page > layout.pages.length) throw dataProblem(`has ${layout.pages.length} pages; page ${page} is missing`);
  const index = indexPage(layout, page);
  const entry = index.lines[line - 1];
  if (!entry) throw dataProblem(`has ${index.lines.length} lines on page ${page}; line ${line} is missing`);

  const words: MushafWord[] = [];
  if (entry.type === 'ayah' && entry.first >= 0) {
    for (let i = entry.first; i <= entry.last; i++) {
      const run = runAt(index, i);
      const position = run.firstPosition + (i - run.start);
      const kind = KIND_BY_CHAR[index.page.k[i] ?? ''];
      if (!kind) throw dataProblem(`has an unknown word kind "${index.page.k[i]}" on page ${page}`);
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

  // Optional keys are omitted rather than set to undefined so JSON round-trips are byte-identical.
  return {
    version: 2,
    mushaf: def.id,
    look,
    fontSet: fontSet.id,
    page,
    line,
    type: entry.type,
    centered: entry.centered,
    fontFamily: fontSet.fontFamily(page),
    ...(colors === undefined ? {} : {colors}),
    ...(entry.surahNumber === undefined ? {} : {surahNumber: entry.surahNumber}),
    words,
  };
};
