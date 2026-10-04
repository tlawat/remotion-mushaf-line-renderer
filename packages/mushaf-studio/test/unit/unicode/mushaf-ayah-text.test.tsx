// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import fatihaTimings from '../../fixtures/timings/fatiha.json';
import fatihaText from '../../fixtures/unicode/fatiha-text.json';
import {createRemotionMock} from './helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));

// The font is the hook's business (font.test.tsx); here it is loaded, or not, on demand.
const font = {fontFamily: 'mushaf-uthmanic-hafs', ready: true};
vi.mock('../../../src/unicode/font', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/unicode/font')>()),
  useUnicodeFont: () => font,
}));

// The surah name's fonts are the package's business; here it says which surah it was given.
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  MushafSurahName: (props: {surah: number}) => <span data-surah-name={props.surah} />,
}));

// The panel is the studio tests' business (test/unit/studio); here it says where it was rendered and with what.
vi.mock('../../../src/studio', () => ({
  MushafStudioPanel: (props: {compositionId: string; props: {textFile?: string}}) => (
    <div data-panel={props.compositionId} data-text-file={props.props.textFile} />
  ),
  isInStudio: () => false,
}));

const {MushafAyahText, defaultMushafAyahTextProps, resolveAyahText} = await import('../../../src/unicode');
const {fakeFetch} = await import('../translations/helpers');
type MushafAyahTextProps = import('../../../src/unicode').MushafAyahTextProps;
type ResolvedAyahText = import('../../../src/unicode').ResolvedAyahText;

const TRANSLATION = {
  version: 1,
  kind: 'ayah',
  meta: {id: 'quran.com:20', name: 'Saheeh International', language: 'en', source: 'quran.com'},
  text: {'1:2': '[All] praise is [due] to Allāh, Lord of the worlds -', '1:3': 'The Entirely Merciful'},
};

let resolved: ResolvedAyahText;
let withTranslation: ResolvedAyahText;

beforeAll(async () => {
  const files: Record<string, unknown> = {
    'timings.json': fatihaTimings,
    'text.json': fatihaText,
    'translation.json': TRANSLATION,
  };
  const {fetch} = fakeFetch((url) => ({body: files[url.pathname.slice(1)]}));
  const io = {fetch, staticFile: (path: string) => `https://studio.test/${path}`};
  const base = {...defaultMushafAyahTextProps, timingsFile: 'timings.json', textFile: 'text.json'};
  resolved = await resolveAyahText(base, io);
  withTranslation = await resolveAyahText({...base, text: {...base.text, translationFile: 'translation.json'}}, io);
});

beforeEach(() => {
  remotion.reset();
  font.ready = true;
});

afterEach(cleanup);

type Overrides = Partial<Omit<MushafAyahTextProps, 'highlight' | 'text' | 'layout' | 'animation'>> & {
  readonly highlight?: Partial<MushafAyahTextProps['highlight']>;
  readonly text?: Partial<MushafAyahTextProps['text']>;
  readonly layout?: Partial<MushafAyahTextProps['layout']>;
  readonly animation?: Partial<MushafAyahTextProps['animation']>;
};

const mount = (overrides: Overrides = {}, data: ResolvedAyahText | null = resolved) => {
  const d = defaultMushafAyahTextProps;
  const props: MushafAyahTextProps = {
    ...d,
    ...overrides,
    highlight: {...d.highlight, ...overrides.highlight},
    text: {...d.text, ...overrides.text},
    layout: {...d.layout, ...overrides.layout},
    animation: {...d.animation, ...overrides.animation},
    resolved: data,
  };
  return render(<MushafAyahText {...props} />).container;
};

const sequences = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-sequence]'));
const word = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-location="${id}"]`)!;
const ayahBlock = (root: HTMLElement, key: string) =>
  root.querySelector<HTMLElement>(`[data-sequence="Ayah ${key}"] .mushaf-ayah-text`)!;

/** The frame at `seconds` of the audio. */
const at = (seconds: number) => {
  remotion.state.frame = Math.round(seconds * remotion.state.fps);
};

describe('<MushafAyahText>', () => {
  it('plays one Sequence per timed ayah, from the lead-in before its first word to where the next comes in', () => {
    const root = mount();
    const all = sequences(root);
    expect(all.map((s) => s.dataset.sequence)).toEqual([
      'Ayah 1:2',
      'Ayah 1:3',
      'Ayah 1:4',
      'Ayah 1:5',
      'Ayah 1:6',
      'Ayah 1:7',
    ]);
    const lead = defaultMushafAyahTextProps.animation.leadInSeconds;
    const fromOf = (start: number) => Math.max(0, Math.round((start - lead) * 30));
    const starts = resolved.ayahs.map((a) => a.start);
    expect(all.map((s) => Number(s.dataset.from))).toEqual(starts.map(fromOf));
    expect(all.map((s) => Number(s.dataset.duration))).toEqual(
      starts.map((start, i) => (i < starts.length - 1 ? fromOf(starts[i + 1]!) : 900) - fromOf(start)),
    );
    expect(all.every((s) => s.dataset.premount === '30')).toBe(true);
    // No two ayahs share a frame.
    for (let i = 1; i < all.length; i++) {
      expect(Number(all[i]!.dataset.from)).toBe(
        Number(all[i - 1]!.dataset.from) + Number(all[i - 1]!.dataset.duration),
      );
    }
    expect(ayahBlock(root, '1:7').textContent).toContain('۝٧');
  });

  it('plays the audio, a URL as it is and a public/ path through staticFile()', () => {
    expect(mount().querySelector<HTMLElement>('[data-audio]')!.dataset.audio).toBe(
      defaultMushafAyahTextProps.audioFile,
    );
    cleanup();
    expect(
      mount({audioFile: 'mushaf-studio/fatiha/audio.mp3'}).querySelector<HTMLElement>('[data-audio]')!.dataset.audio,
    ).toBe('/static/mushaf-studio/fatiha/audio.mp3');
    cleanup();
    expect(mount({audioFile: ''}).querySelector('[data-audio]')).toBeNull();
  });

  it('paints the page and sets the ayah in the loaded font, centred in the margins at verticalAlign', () => {
    const root = mount({layout: {marginX: 100, verticalAlign: 0.3}, fontSize: 80, lineHeight: 2});
    expect((root.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(16, 20, 24)');
    const block = ayahBlock(root, '1:2');
    expect(block.style.fontFamily).toBe('mushaf-uthmanic-hafs');
    expect(block.style.fontSize).toBe('80px');
    expect(block.style.lineHeight).toBe('2');
    expect(block.style.maxWidth).toBe('880px');
    expect(block.style.visibility).toBe('');
    const frame = block.parentElement!.parentElement!;
    expect(frame.style.left).toBe('100px');
    expect(frame.style.width).toBe('880px');
    expect(frame.style.top).toBe('30%');
    expect(frame.style.transform).toBe('translateY(-30%)');
  });

  it('hides the text until the font is ready', () => {
    font.ready = false;
    expect(ayahBlock(mount(), '1:2').style.visibility).toBe('hidden');
  });

  it('animates each ayah in its own Sequence: gone before, in place between, gone after', () => {
    at(5);
    const root = mount();
    const style = (key: string) => ayahBlock(root, key).parentElement!.style;
    expect(style('1:3').opacity).toBe('1');
    expect(style('1:3').transform).toBe('translateY(0.0000px)');
    expect(style('1:2').opacity).toBe('0');
    expect(style('1:4').opacity).toBe('0');
    cleanup();
    const still = mount({animation: {enter: 'none', exit: 'none'}});
    expect(ayahBlock(still, '1:4').parentElement!.style.opacity).toBe('');
  });

  it('highlights the word being recited and only that one', () => {
    at(5); // 1:3:2 is heard from 4.563 to 5.693
    const root = mount({highlight: {style: 'color', color: '#c8a45c'}});
    const active = root.querySelectorAll<HTMLElement>('.mushaf-uword--active');
    expect(Array.from(active).map((s) => s.dataset.location)).toEqual(['1:3:2']);
    expect(active[0]!.style.color).toBe('rgb(200, 164, 92)');
    expect(word(root, '1:3:1').style.color).toBe('');
  });

  it('glows or marks the word, as highlight.style says', () => {
    at(5);
    const glow = mount({highlight: {style: 'glow', color: '#c8a45c'}});
    expect(word(glow, '1:3:2').style.textShadow).toContain('0.25em');
    cleanup();
    const marker = mount({highlight: {style: 'marker', color: '#c8a45c'}});
    expect(word(marker, '1:3:2').style.background).toContain('rgba(200, 164, 92, 0.35)');
  });

  it('paints the whole ayah under mode "ayah", and nothing under mode "none"', () => {
    at(5);
    const ayah = mount({highlight: {mode: 'ayah'}});
    expect(ayah.querySelectorAll('.mushaf-uword--active')).toHaveLength(0);
    for (const id of ['1:3:1', '1:3:2', '1:3:3']) expect(word(ayah, id).style.color).toBe('rgb(200, 164, 92)');
    expect(word(ayah, '1:4:1').style.color).toBe('');
    cleanup();
    const none = mount({highlight: {mode: 'none', dimOthers: 0.3}});
    expect(none.querySelectorAll('.mushaf-uword--active')).toHaveLength(0);
    expect(word(none, '1:3:1').style.opacity).toBe('');
  });

  it('dims the other words, or only those still to come (the marker at its ayah’s end)', () => {
    at(5);
    const all = mount({highlight: {dimOthers: 0.4}});
    expect(word(all, '1:3:2').style.opacity).toBe('');
    expect(word(all, '1:3:1').style.opacity).toBe('0.4');
    expect(word(all, '1:2:1').style.opacity).toBe('0.4');
    cleanup();
    const upcoming = mount({highlight: {dimOthers: 0.4, dimUpcomingOnly: true}});
    expect(word(upcoming, '1:2:1').style.opacity).toBe('');
    expect(word(upcoming, '1:3:1').style.opacity).toBe('');
    expect(word(upcoming, '1:3:2').style.opacity).toBe('');
    expect(word(upcoming, '1:3:3').style.opacity).toBe('0.4');
    expect(word(upcoming, '1:4:1').style.opacity).toBe('0.4');
  });

  it('shows the translation of each ayah under it only when one is loaded', () => {
    expect(mount().querySelector('.mushaf-translation')).toBeNull();
    cleanup();
    const root = mount({}, withTranslation);
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mushaf-translation'));
    expect(blocks.map((b) => b.dataset.ayahKey)).toEqual(['1:2', '1:3', '1:4', '1:5', '1:6', '1:7']);
    const third = root.querySelector<HTMLElement>('[data-sequence="Ayah 1:3"] .mushaf-translation')!;
    expect(third.textContent).toBe('The Entirely Merciful');
    expect(third.style.textAlign).toBe('center');
    expect(third.previousElementSibling!.className).toBe('mushaf-ayah-text');
  });

  it('puts the translation above with translationPosition "above", and leaves it out with "none"', () => {
    const above = mount({text: {translationPosition: 'above'}}, withTranslation);
    const third = above.querySelector<HTMLElement>('[data-sequence="Ayah 1:3"] .mushaf-translation')!;
    expect(third.nextElementSibling!.className).toBe('mushaf-ayah-text');
    cleanup();
    expect(
      mount({text: {translationPosition: 'none'}}, withTranslation).querySelector('.mushaf-translation'),
    ).toBeNull();
  });

  it('shows the title overlay: the card in the dark page’s ink, and the corner label with the ayah of the word heard, even with no highlight', () => {
    expect(defaultMushafAyahTextProps.overlay.color).toBe('#f4efe6');
    const both = {...defaultMushafAyahTextProps.overlay, title: 'both' as const, introSeconds: 3};
    // The first word is at 0.331 s: the card is still there at frame 0 and gone a frame later.
    const first = mount({overlay: both});
    expect(first.querySelector<HTMLElement>('[data-surah-name]')!.dataset.surahName).toBe('1');
    expect(first.querySelector<HTMLElement>('[data-mushaf-overlay="intro"]')!.style.color).toBe('rgb(244, 239, 230)');
    cleanup();
    remotion.state.frame = 120; // 4 s: ayah 3
    const c = mount({overlay: both, highlight: {mode: 'none'}});
    expect(c.querySelector('[data-mushaf-overlay="intro"]')).toBeNull();
    expect(c.querySelector('[data-mushaf-overlay="corner"]')!.textContent).toBe('Al-Fatihah · 1:3');
  });

  it('refuses to render without resolved, saying how to fill it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => mount({}, null)).toThrow(/`resolved` is null.*calculateMushafAyahTextMetadata/);
    vi.restoreAllMocks();
  });

  it('renders the panel in the Studio preview only, with the composition id and its props', () => {
    const outside = mount();
    expect(outside.querySelector('[data-panel]')).toBeNull();
    expect(outside.querySelectorAll('[data-sequence]')).toHaveLength(6);
    cleanup();
    remotion.state.isStudio = true;
    const studio = mount({textFile: 'mushaf-studio/p/text-uthmani-1-2-7.json'});
    const panel = studio.querySelector<HTMLElement>('[data-panel]')!;
    expect(panel.dataset.panel).toBe('MushafAyahText');
    expect(panel.dataset.textFile).toBe('mushaf-studio/p/text-uthmani-1-2-7.json');
    expect(studio.querySelectorAll('[data-sequence]')).toHaveLength(6);
    cleanup();
    // The Studio's own in-browser render: `isStudio` stays set, `isClientSideRendering` comes through the hook.
    remotion.state.isClientSideRendering = true;
    expect(mount().querySelector('[data-panel]')).toBeNull();
    cleanup();
    remotion.state.isClientSideRendering = false;
    remotion.state.isRendering = true;
    expect(mount().querySelector('[data-panel]')).toBeNull();
  });
});
