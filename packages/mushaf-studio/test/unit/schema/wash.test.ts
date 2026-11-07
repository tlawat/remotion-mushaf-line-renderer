// The wash's exact CSS (render-design.md 5.1.3, and 5.12 for MushafAyahText): a band 1.55 em tall
// centred at 54 % of the line box, feathered 0.22 em top and bottom, with half-ellipse caps
// `min(0.35em, 50%)` wide whose solid core ends at 72 %. Pinned literally, so a change of geometry
// is a change of this test, not something `washStyle()` can agree with itself about.
import {describe, expect, it} from 'vitest';
import {washStyle} from '../../../src/schema';

const C = 'rgba(177, 147, 83, 0.1)';
const BAND = `linear-gradient(to bottom, transparent 0, ${C} 0.22em, ${C} calc(100% - 0.22em), transparent 100%)`;
const CAP_LEFT = `radial-gradient(farthest-side at left center, ${C} 72%, transparent 100%)`;
const CAP_RIGHT = `radial-gradient(farthest-side at right center, ${C} 72%, transparent 100%)`;
const c = 'min(0.35em, 50%)';

describe('washStyle', () => {
  it('is one band inside a run (cap none)', () => {
    expect(washStyle({color: C, cap: 'none'})).toEqual({
      backgroundImage: BAND,
      backgroundSize: '100% 1.55em',
      backgroundPosition: 'center 54%',
      backgroundRepeat: 'no-repeat',
    });
  });

  it('ends a run on the right (start, the first word in RTL) with the cap tile there and the body shortened by it', () => {
    expect(washStyle({color: C, cap: 'start'})).toEqual({
      backgroundImage: `${CAP_LEFT}, ${BAND}`,
      backgroundSize: `${c} 1.55em, calc(100% - ${c}) 1.55em`,
      backgroundPosition: 'right 54%, left 54%',
      backgroundRepeat: 'no-repeat',
    });
  });

  it('mirrors it on the left for end', () => {
    expect(washStyle({color: C, cap: 'end'})).toEqual({
      backgroundImage: `${CAP_RIGHT}, ${BAND}`,
      backgroundSize: `${c} 1.55em, calc(100% - ${c}) 1.55em`,
      backgroundPosition: 'left 54%, right 54%',
      backgroundRepeat: 'no-repeat',
    });
  });

  it('gives a lone word three layers: right cap, centred body short of both caps, left cap', () => {
    expect(washStyle({color: C, cap: 'both'})).toEqual({
      backgroundImage: `${CAP_LEFT}, ${BAND}, ${CAP_RIGHT}`,
      backgroundSize: `${c} 1.55em, calc(100% - 2 * ${c}) 1.55em, ${c} 1.55em`,
      backgroundPosition: 'right 54%, center 54%, left 54%',
      backgroundRepeat: 'no-repeat',
    });
  });

  it('takes MushafAyahText’s 1.35 em band at 55 % of its shorter line box', () => {
    expect(washStyle({color: C, cap: 'both', height: '1.35em', y: '55%'})).toEqual({
      backgroundImage: `${CAP_LEFT}, ${BAND}, ${CAP_RIGHT}`,
      backgroundSize: `${c} 1.35em, calc(100% - 2 * ${c}) 1.35em, ${c} 1.35em`,
      backgroundPosition: 'right 55%, center 55%, left 55%',
      backgroundRepeat: 'no-repeat',
    });
  });
});
