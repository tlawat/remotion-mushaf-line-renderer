// Lines shaped like Al-Fatihah's (one ayah per line, ayahs 2-7, the ayah-end marker last on each),
// built on the synthetic mushaf's line data so they are valid `MushafLineData`, for the tests that
// pair them with the Fatiha timings fixture. Word ids run 1..31 in reading order.
import type {MushafLineData, MushafWord} from '@tlawat/remotion-mushaf-line';
import {syntheticLine} from '../../../../../remotion-mushaf-line-renderer/test/fixtures/synthetic-lines';

/** Words per ayah of Al-Fatihah, marker excluded. */
const WORDS: Readonly<Record<number, number>> = {2: 4, 3: 2, 4: 3, 5: 4, 6: 3, 7: 9};

const word = (wordId: number, ayah: number, position: number, kind: 'word' | 'end'): MushafWord => ({
  id: `1:${ayah}:${position}`,
  wordId,
  surah: 1,
  ayah,
  position,
  kind,
  text: 'ﱁ',
});

const build = (): readonly MushafLineData[] => {
  let wordId = 1;
  const lines: MushafLineData[] = [];
  for (const [ayahText, count] of Object.entries(WORDS)) {
    const ayah = Number(ayahText);
    const words: MushafWord[] = [];
    for (let position = 1; position <= count; position++) words.push(word(wordId++, ayah, position, 'word'));
    words.push(word(wordId++, ayah, count + 1, 'end'));
    lines.push(syntheticLine(1, 2, {page: 1, line: ayah + 1, centered: false, words}));
  }
  return lines;
};

const ALL = build();

/** The lines that carry ayahs `fromAyah`..`toAyah` of surah 1, as `getMushafLines()` would give them. */
export const fatihaLines = (fromAyah = 2, toAyah = 7): readonly MushafLineData[] =>
  ALL.filter((line) => line.words[0]!.ayah >= fromAyah && line.words[0]!.ayah <= toAyah);
