// isHafsRecitation(): the catalogue's riwayah labels against the Hafs print the studio renders.
import {describe, expect, it} from 'vitest';
import {isHafsRecitation} from '../../../src/qud';
import recitations from '../../fixtures/qud/recitations.json';

describe('isHafsRecitation', () => {
  it('knows the catalogue’s Hafs recitations from the others', () => {
    const hafs = recitations.recitations.filter(isHafsRecitation).map((r) => r.riwayah);
    const others = recitations.recitations.filter((r) => !isHafsRecitation(r)).map((r) => r.riwayah);
    expect(new Set(hafs)).toEqual(new Set(["Hafs A'n Assem"]));
    expect(new Set(others)).toEqual(new Set(["Warsh A'n Nafi'", "Qalon A'n Nafi'"]));
  });

  it('takes the label in any case, an empty one as Hafs, and no riwayah that only contains the word', () => {
    expect(isHafsRecitation({riwayah: 'hafs'})).toBe(true);
    expect(isHafsRecitation({riwayah: '  HAFS an Asim '})).toBe(true);
    expect(isHafsRecitation({riwayah: ''})).toBe(true);
    expect(isHafsRecitation({riwayah: "Shu'bah A'n Assem"})).toBe(false);
    expect(isHafsRecitation({riwayah: 'Hafsah'})).toBe(false);
    expect(isHafsRecitation({riwayah: 'Warsh (Hafs page)'})).toBe(false);
  });
});
