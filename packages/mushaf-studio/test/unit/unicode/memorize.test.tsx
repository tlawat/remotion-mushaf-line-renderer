// @vitest-environment jsdom
// <MushafAyahText> under the memorisation modes, against the Fatiha timings and Uthmani text
// fixtures: the clip timeline (its duration, its audio, the ayahs on screen through their plays),
// the counter, and the words each mode hides or cuts to their first letter.
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import fatihaTimings from '../../fixtures/timings/fatiha.json';
import fatihaText from '../../fixtures/unicode/fatiha-text.json';
import {createRemotionMock} from './helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
  Audio: (props: {src: string; trimBefore?: number; trimAfter?: number}) => (
    <div data-audio={props.src} data-trim-before={props.trimBefore} data-trim-after={props.trimAfter} />
  ),
}));
vi.mock('../../../src/unicode/font', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/unicode/font')>()),
  useUnicodeFont: () => ({fontFamily: 'mushaf-uthmanic-hafs', ready: true}),
}));
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  MushafSurahName: () => null,
}));
vi.mock('../../../src/studio', () => ({MushafStudioPanel: () => null, isInStudio: () => false}));

const {MushafAyahText, defaultMushafAyahTextProps, resolveAyahText, calculateMushafAyahTextMetadata} = await import(
  '../../../src/unicode'
);
const {clipTimeline, firstLetterOf, timelineDuration} = await import('../../../src/memorize');
const {fakeFetch} = await import('../translations/helpers');
type MushafAyahTextProps = import('../../../src/unicode').MushafAyahTextProps;
type ResolvedAyahText = import('../../../src/unicode').ResolvedAyahText;
type Memorize = MushafAyahTextProps['memorize'];

const files: Record<string, unknown> = {'timings.json': fatihaTimings, 'text.json': fatihaText};
const io = () => {
  const {fetch} = fakeFetch((url) => ({body: files[url.pathname.slice(1)]}));
  return {fetch, staticFile: (path: string) => `https://studio.test/${path}`};
};
const base = {...defaultMushafAyahTextProps, timingsFile: 'timings.json', textFile: 'text.json'};
const remote = {...base, timingsFile: 'https://studio.test/timings.json', textFile: 'https://studio.test/text.json'};
const three: Memorize = {mode: 'repeat', repeat: 3, pauseSeconds: 0.5, revealAfterRepeats: 1};
const words = fatihaText.words as Record<string, string>;

let plain: ResolvedAyahText;
beforeAll(async () => {
  plain = await resolveAyahText(base, io());
});
beforeEach(() => remotion.reset());
afterEach(cleanup);

const mount = async (memorize: Memorize) => {
  const props = {...base, memorize};
  const resolved = await resolveAyahText(props, io());
  return render(<MushafAyahText {...props} resolved={resolved} />).container;
};
const at = (seconds: number) => {
  remotion.state.frame = Math.round(seconds * 30);
};
const word = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-location="${id}"]`)!;

describe('<MushafAyahText> memorisation', () => {
  it('resolves the clip timeline, and the duration follows it only when ayahs repeat', async () => {
    expect(plain.clips).toEqual(clipTimeline(plain.timings, defaultMushafAyahTextProps.memorize));
    const metadata = async (memorize: Memorize) =>
      (
        await calculateMushafAyahTextMetadata({
          // URLs, not public/ paths: they reach the stubbed fetch as they are.
          props: {...remote, memorize},
          defaultProps: remote,
          abortSignal: new AbortController().signal,
          compositionId: 'MushafAyahText',
          isRendering: false,
        })
      ).durationInFrames;
    // calculateMetadata reads through the global fetch: serve the fixtures to it.
    vi.stubGlobal('fetch', io().fetch);
    try {
      expect(await metadata(defaultMushafAyahTextProps.memorize)).toBe(Math.ceil((27.559 + 1) * 30));
      expect(await metadata(three)).toBe(timelineDuration(clipTimeline(plain.timings, three), 30));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('off: one audio, no counter, every word as it is', async () => {
    at(1);
    const root = await mount(defaultMushafAyahTextProps.memorize);
    expect(root.querySelectorAll('[data-audio]')).toHaveLength(1);
    expect(root.querySelector('[data-mushaf-overlay="repeat-counter"]')).toBeNull();
    expect(word(root, '1:2:4').textContent).toBe(words['1:2:4']);
    expect(word(root, '1:2:4').style.opacity).toBe('');
  });

  it('repeat: an audio per clip, the ayah on screen through its plays, the counter, the highlight restarting', async () => {
    at(3.891 + 0.1);
    const root = await mount(three);
    const audios = Array.from(root.querySelectorAll<HTMLElement>('[data-audio]'));
    expect(audios).toHaveLength(18);
    expect(audios[1]!.dataset).toMatchObject({trimBefore: String(Math.round(0.331 * 30)), trimAfter: '102'});
    expect(root.querySelector('[data-mushaf-overlay="repeat-counter"]')!.textContent).toBe('2/3');
    expect(root.querySelector('.mushaf-uword--active')!.getAttribute('data-location')).toBe('1:2:1');
    // Ayah 3 comes in before its first play, after ayah 2's three.
    const clips = clipTimeline(plain.timings, three);
    const ayah3 = root.querySelector<HTMLElement>('[data-sequence="Ayah 1:3"]')!;
    expect(Number(ayah3.dataset.from)).toBe(Math.round((clips[3]!.compositionFrom - 0.4) * 30));
  });

  it('first-letters cuts the words to come to their first letter, keeps the marker, reveals on the next play', async () => {
    at(1.2);
    const root = await mount({...three, mode: 'first-letters'});
    expect(word(root, '1:2:1').textContent).toBe(words['1:2:1']);
    expect(word(root, '1:2:4').textContent).toBe(firstLetterOf(words['1:2:4']!));
    expect(word(root, '1:2:4').textContent).toBe('ٱـ');
    expect(word(root, '1:2:5').textContent).toBe(`۝${words['1:2:5']}`);
    cleanup();
    at(3.891 + 2.9);
    const second = await mount({...three, mode: 'first-letters'});
    expect(word(second, '1:2:4').textContent).toBe(words['1:2:4']);
  });

  it('blank-upcoming and blank-all hide words with opacity, keeping their place', async () => {
    at(1.2);
    const upcoming = await mount({...three, mode: 'blank-upcoming'});
    expect(word(upcoming, '1:2:1').style.opacity).toBe('');
    expect(word(upcoming, '1:2:4').style.opacity).toBe('0');
    expect(word(upcoming, '1:2:4').textContent).toBe(words['1:2:4']);
    cleanup();
    at(1.2);
    const all = await mount({...three, mode: 'blank-all', revealAfterRepeats: 3});
    expect(word(all, '1:2:1').style.opacity).toBe('');
    expect(word(all, '1:2:3').style.opacity).toBe('0');
  });
});
