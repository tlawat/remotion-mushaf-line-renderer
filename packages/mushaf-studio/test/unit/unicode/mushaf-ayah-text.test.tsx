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

vi.mock('@remotion/media', () => ({
  Audio: (props: {src: string; trimBefore?: number}) => (
    <div data-media-audio={props.src} data-trim-before={props.trimBefore} />
  ),
}));

// The panel is the studio tests' business (test/unit/studio); here it says where it was rendered and with what.
vi.mock('../../../src/studio', () => ({
  MushafStudioPanel: (props: {compositionId: string; props: {textFile?: string}}) => (
    <div data-panel={props.compositionId} data-text-file={props.props.textFile} />
  ),
  isInStudio: () => false,
}));

const {MushafAyahText, ayahPresence, ayahTextPlan, defaultMushafAyahTextProps, resolveAyahText} = await import(
  '../../../src/unicode'
);
const {clipTimeline} = await import('../../../src/memorize');
const {fakeFetch} = await import('../translations/helpers');
const {frameGeometry, legibleAccent, markerIds, parseColor, washColor} = await import('../../../src/schema');
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
  it('plays one Sequence per timed ayah, each change after the last word, the two overlapping only by the dissolve', () => {
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
    const plans = ayahTextPlan({
      timings: resolved.timings,
      clips: resolved.clips ?? clipTimeline(resolved.timings, defaultMushafAyahTextProps.memorize),
      markers: markerIds(resolved.ayahs),
      fps: 30,
      leadInSeconds: defaultMushafAyahTextProps.animation.leadInSeconds,
      tempo: 'calm',
      motion: 'fade',
    });
    expect(all.map((s) => [Number(s.dataset.from), Number(s.dataset.duration)])).toEqual(
      plans.map((plan) => [plan.from, plan.durationInFrames]),
    );
    expect(all.every((s) => s.dataset.premount === '30')).toBe(true);
    // The first ayah is settled the lead-in before its first word, after a 24-frame appearance.
    const firstWord = resolved.timings.ayat[0]!.words![0]!.start;
    expect(plans[0]!.from).toBe(Math.max(0, Math.round((firstWord - 0.4) * 30) - 24));
    for (let i = 1; i < plans.length; i++) {
      const outgoing = resolved.timings.ayat[i - 1]!;
      const lastEnd = outgoing.words![outgoing.words!.length - 1]!.end;
      // Late, never early: the change starts once the outgoing ayah's last word has ended.
      expect(plans[i]!.enter.start).toBeGreaterThanOrEqual(Math.ceil(lastEnd * 30 - 1e-6));
      // The two overlap only over the change, and are never both at reading strength.
      const before = plans[i - 1]!;
      expect(plans[i]!.from).toBeLessThan(before.from + before.durationInFrames);
      for (let f = plans[i]!.enter.start; f <= plans[i]!.enter.start + plans[i]!.enter.duration; f++) {
        const out = ayahPresence(before, f).opacity;
        const into = ayahPresence(plans[i]!, f).opacity;
        expect(Math.min(out, into)).toBeLessThanOrEqual(0.2);
        expect(out + into).toBeGreaterThanOrEqual(0.15);
      }
    }
    // The last holds 1.5 s after the last word, then fades over a second: the composition ends there.
    const last = plans[plans.length - 1]!;
    expect(last.exit).toMatchObject({duration: 30, last: true});
    expect(last.exit.start + 30).toBe(last.from + last.durationInFrames);
    expect(ayahBlock(root, '1:7').textContent).toContain('٧');
  });

  it('plays the audio, a URL as it is and a public/ path through staticFile()', () => {
    // An explicit URL: the default `audioFile` may be either.
    const url = 'https://media.test/fatiha/audio.mp3';
    expect(mount({audioFile: url}).querySelector<HTMLElement>('[data-audio]')!.dataset.audio).toBe(url);
    cleanup();
    expect(
      mount({audioFile: 'mushaf-studio/fatiha/audio.mp3'}).querySelector<HTMLElement>('[data-audio]')!.dataset.audio,
    ).toBe('/static/mushaf-studio/fatiha/audio.mp3');
    cleanup();
    expect(mount({audioFile: ''}).querySelector('[data-audio]')).toBeNull();
  });

  it('paints the page and sets the ayah in the loaded font, centred in the margins at verticalAlign', () => {
    const root = mount({layout: {marginX: 100, verticalAlign: 0.3}, fontSize: 80, lineHeight: 2});
    expect((root.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(18, 20, 22)');
    const block = ayahBlock(root, '1:2');
    expect(block.style.fontFamily).toBe('mushaf-uthmanic-hafs');
    expect(block.style.fontSize).toBe('80px');
    expect(block.style.lineHeight).toBe('2');
    // 78 % of the frame, inside the margins.
    expect(block.style.maxWidth).toBe('842px');
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
    // Settled: no opacity of its own.
    expect(style('1:3').opacity).toBe('');
    // A dissolve: nothing moves.
    expect(style('1:3').transform).toBe('');
    expect(style('1:2').opacity).toBe('0');
    expect(style('1:4').opacity).toBe('0');
    cleanup();
    const rise = mount({animation: {lines: 'rise'}});
    // Risen into place: no transform left.
    expect(ayahBlock(rise, '1:3').parentElement!.style.transform).toBe('');
    cleanup();
    const still = mount({animation: {lines: 'cut'}});
    expect(ayahBlock(still, '1:4').parentElement!.style.opacity).toBe('');
  });

  it('tints the word being recited in the accent read on the dark page, and only that one', () => {
    at(5); // 1:3:2 is heard from 4.563 to 5.693
    const root = mount({highlight: {style: 'tint', color: '#c8a45c'}});
    const active = root.querySelectorAll<HTMLElement>('.mushaf-uword--active');
    expect(Array.from(active).map((s) => s.dataset.location)).toEqual(['1:3:2']);
    const accent = parseColor(legibleAccent('#c8a45c', '#121416'))!;
    expect(active[0]!.style.color).toBe(`rgb(${accent.r}, ${accent.g}, ${accent.b})`);
    expect(word(root, '1:3:1').style.color).toBe('');
    expect(word(root, '1:3:3').style.color).toBe('');
  });

  it('washes the word being recited, faintly', () => {
    at(5);
    const wash = mount({highlight: {style: 'wash', color: '#c8a45c'}});
    // Drawn behind the text from where the word's ink is, not as the word's own background.
    expect(word(wash, '1:3:2').style.backgroundImage).toBe('');
    const bands = [...wash.querySelectorAll<HTMLElement>('[data-mushaf-word-band]')];
    expect(bands).toHaveLength(1);
    const strength = /, ([\d.]+)\)$/.exec(washColor('#c8a45c', 0.13))![1];
    expect(bands[0]!.style.backgroundImage).toContain(`, ${strength}) `);
    // The block isolates the bands under its text.
    expect(wash.querySelector<HTMLElement>('.mushaf-ayah-text')!.style.isolation).toBe('isolate');
    expect(bands[0]!.parentElement!.style.zIndex).toBe('-1');
  });

  it('marks nothing under mode "ayah" (the ayah on screen is the one recited), nor under mode "none"', () => {
    at(5);
    for (const mode of ['ayah', 'none'] as const) {
      for (const style of ['ink', 'tint', 'wash'] as const) {
        const root = mount({highlight: {mode, style}});
        expect(root.querySelectorAll('.mushaf-uword--active')).toHaveLength(0);
        // Only the word's own box: no opacity, colour or band.
        for (const id of ['1:3:1', '1:3:2', '1:3:3', '1:4:1'])
          expect(word(root, id).getAttribute('style')).toBe('display: inline-block;');
        cleanup();
      }
    }
  });

  it('rests the words still to come in ink and fills each in as heard (the marker at its ayah’s end)', () => {
    at(5);
    const ink = mount();
    expect(word(ink, '1:2:1').style.opacity).toBe('');
    expect(word(ink, '1:3:1').style.opacity).toBe('');
    expect(word(ink, '1:3:2').style.opacity).toBe('');
    expect(word(ink, '1:3:3').style.opacity).toBe('0.6');
    expect(word(ink, '1:4:1').style.opacity).toBe('0.6');
    cleanup();
    expect(word(mount({highlight: {restOpacity: 0.8}}), '1:3:3').style.opacity).toBe('0.8');
  });

  it('shows the translation of each ayah under it only when one is loaded', () => {
    expect(mount().querySelector('.mushaf-translation')).toBeNull();
    cleanup();
    const root = mount({}, withTranslation);
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mushaf-translation'));
    expect(blocks.map((b) => b.dataset.ayahKey)).toEqual(['1:2', '1:3', '1:4', '1:5', '1:6', '1:7']);
    const third = root.querySelector<HTMLElement>('[data-sequence="Ayah 1:3"] .mushaf-translation')!;
    expect(third.textContent).toBe('The Entirely Merciful');
    // Centred as the ayah is, through the stack's `align`: no style rule of the composition's own.
    expect(blocks.every((b) => b.style.textAlign === 'center')).toBe(true);
    const stack = third.closest<HTMLElement>('.mushaf-translation-stack')!;
    expect(stack.className).toBe('mushaf-translation-stack');
    expect(Array.from(root.querySelectorAll('style')).some((s) => s.textContent?.includes('mushaf-translation'))).toBe(
      false,
    );
    expect(stack.previousElementSibling!.className).toBe('mushaf-ayah-text');
  });

  it('puts the translation above with translationPosition "above", and leaves it out with "none"', () => {
    const above = mount({text: {translationPosition: 'above'}}, withTranslation);
    const third = above.querySelector<HTMLElement>('[data-sequence="Ayah 1:3"] .mushaf-translation')!;
    expect(third.closest('.mushaf-translation-stack')!.nextElementSibling!.className).toBe('mushaf-ayah-text');
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
    expect(c.querySelector('[data-mushaf-overlay="corner"]')!.textContent).toBe('Al-Fatihah · 3');
    cleanup();
    // With the jadwal drawn the corner label sits inside its inner rule.
    const ruled = mount({overlay: both, layout: {frame: 'hairline'}});
    const {safe} = frameGeometry(remotion.state.width, remotion.state.height, {jadwal: true});
    expect(ruled.querySelector('[data-mushaf-jadwal]')).not.toBeNull();
    expect(ruled.querySelector<HTMLElement>('[data-mushaf-overlay="corner"]')!.style.right).toBe(`${safe}px`);
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
    // In a drop-in slot (`panel={false}`) the slot docks the panel, not the composition.
    const inSlot = render(<MushafAyahText {...defaultMushafAyahTextProps} resolved={resolved} panel={false} />);
    expect(inSlot.container.querySelector('[data-panel]')).toBeNull();
    expect(inSlot.container.querySelectorAll('[data-sequence]')).toHaveLength(6);
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
