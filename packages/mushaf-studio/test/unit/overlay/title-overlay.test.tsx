// @vitest-environment jsdom
// The title overlay under jsdom, with `remotion` and the package's `<MushafSurahName>` mocked: the
// intro card by frame, the corner label by the ayah heard, the reciter line only when set.
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRemotionMock} from '../compositions/helpers/remotion-mock';

const remotion = createRemotionMock();
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
}));
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>()),
  MushafSurahName: (props: {surah: number; framed?: boolean; fontSrc?: unknown}) => (
    <span
      data-surah-name={props.surah}
      data-framed={String(props.framed)}
      data-font-src={props.fontSrc ? 'yes' : 'no'}
    />
  ),
}));

const {
  arabicIndicDigits,
  arabicRangeText,
  ayahRangeText,
  introCardOpacity,
  introCoverOpacity,
  introEndSeconds,
  introHandoffFrames,
  introOpacity,
  latinRangeText,
  MushafCornerLabel,
  MushafTitleOverlay,
  SURAH_NAMES,
  smallCapsLabel,
  surahEnglishName,
} = await import('../../../src/overlay');
const {defaultOverlay, SINE} = await import('../../../src/schema');
type Overlay = import('../../../src/schema').Overlay;
type OverlayProps = import('../../../src/overlay').MushafTitleOverlayProps;

const overlay = (changes: Partial<Overlay> = {}): Overlay => ({...defaultOverlay, ...changes});
const base = (changes: Partial<OverlayProps> = {}): OverlayProps => ({
  overlay: overlay({title: 'both'}),
  surah: 1,
  fromAyah: 2,
  toAyah: 7,
  ayahKey: '1:3',
  firstWordSeconds: null,
  background: '#fbf7ee',
  fontSize: 80,
  lineHeight: 176,
  width: 1680,
  ...changes,
});
const at = (frame: number, p: OverlayProps) => {
  remotion.state.frame = frame;
  return render(<MushafTitleOverlay {...p} />).container;
};
const intro = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-mushaf-overlay="intro"]');
const corner = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-mushaf-overlay="corner"]');
const part = (c: HTMLElement, name: string) => c.querySelector<HTMLElement>(`[data-mushaf-overlay-part="${name}"]`);

beforeEach(() => remotion.reset());
afterEach(cleanup);

describe('surah names and ranges', () => {
  it('names the 114 surahs from the panel’s table', () => {
    expect(SURAH_NAMES).toHaveLength(114);
    expect(surahEnglishName(1)).toBe('Al-Fatihah');
    expect(surahEnglishName(9)).toBe('At-Tawbah');
    expect(surahEnglishName(114)).toBe('An-Nas');
    expect(surahEnglishName(0)).toBe('Surah 0');
    expect(surahEnglishName(115)).toBe('Surah 115');
  });

  it('writes a range or one ayah, in Latin or Arabic-Indic digits', () => {
    expect(ayahRangeText(1, 2, 7)).toBe('1:2–7');
    expect(ayahRangeText(2, 255, 255)).toBe('2:255');
    expect(ayahRangeText(1, 2, 7, 'arabic')).toBe('١:٢–٧');
    expect(arabicIndicDigits('114:6')).toBe('١١٤:٦');
  });
});

describe('the card’s timeline', () => {
  it('comes in over cardIn on SINE from 0.2 s, holds, and goes over cardOut ending at its end', () => {
    // Frame 0 is the bare ground.
    expect(introCardOpacity(0, 3)).toBe(0);
    expect(introCardOpacity(0.2, 3)).toBe(0);
    expect(introCardOpacity(0.6, 3)).toBeCloseTo(SINE(0.5), 4);
    expect(introCardOpacity(1, 3)).toBe(1);
    expect(introCardOpacity(2.3, 3)).toBe(1);
    // cardOut is 21 frames (0.7 s) calm, 30 slow.
    expect(introCardOpacity(2.65, 3)).toBeCloseTo(1 - SINE(0.5), 4);
    expect(introCardOpacity(3, 3)).toBe(0);
    expect(introCardOpacity(2.5, 3, 'slow')).toBeCloseTo(1 - SINE(0.5), 4);
    // Over the lines, its ground covers them from frame 0 and goes with the content.
    expect(introCoverOpacity(0, 3)).toBe(1);
    expect(introCoverOpacity(2.65, 3)).toBeCloseTo(1 - SINE(0.5), 4);
    expect(introCoverOpacity(3, 3)).toBe(0);
  });

  it('hands over to the lines from the first frame the card is under 0.25, never before', () => {
    for (const [tempo, out] of [
      ['calm', 21],
      ['slow', 30],
    ] as const) {
      const handoff = introHandoffFrames(tempo, 30);
      const at = (frame: number) => introCardOpacity(frame / 30, 3, tempo);
      // At the hand-off the card is under 0.25; a frame earlier it is not.
      expect(at(90 - handoff), tempo).toBeLessThan(0.25);
      expect(at(89 - handoff), tempo).toBeGreaterThanOrEqual(0.25);
      expect(handoff, tempo).toBeLessThan(out);
    }
    expect(introHandoffFrames('calm', 30)).toBe(7);
    expect(introHandoffFrames('slow', 30)).toBe(10);
    // A card too short to fade hands over at its end.
    expect(introHandoffFrames('calm', 30, 0)).toBe(0);
  });

  it('writes the range in Arabic, first ayah rightmost in an RTL isolate, and in Latin', () => {
    expect(arabicRangeText({surah: 1, ayah: 2}, {surah: 1, ayah: 7})).toBe('\u2067الآيات ٢–٧\u2069');
    expect(arabicRangeText({surah: 1, ayah: 5}, {surah: 1, ayah: 5})).toBe('\u2067الآية ٥\u2069');
    expect(latinRangeText({surah: 1, ayah: 2}, {surah: 1, ayah: 7})).toBe('Āyāt 2–7');
    expect(latinRangeText({surah: 1, ayah: 5}, {surah: 1, ayah: 5})).toBe('Āyah 5');
    expect(latinRangeText({surah: 113, ayah: 4}, {surah: 114, ayah: 2})).toBe('Āyāt 113:4–114:2');
  });

  it('takes the marks off a label set in small caps, precomposed or not, and leaves the rest', () => {
    expect(smallCapsLabel('Āyāt 2–7')).toBe('Ayat 2–7');
    expect(smallCapsLabel('A\u0304yah 5')).toBe('Ayah 5');
    expect(smallCapsLabel('Al-Fātiḥah · Āyāt 113:4–114:2')).toBe('Al-Fatihah · Ayat 113:4–114:2');
    expect(smallCapsLabel('Al-Fatihah · 3')).toBe('Al-Fatihah · 3');
    expect(smallCapsLabel('')).toBe('');
  });
});

describe('introEndSeconds and introOpacity', () => {
  it('keeps the card introSeconds, or until 0.3 s before an earlier first word, never below 0', () => {
    expect(introEndSeconds(3, null)).toBe(3);
    expect(introEndSeconds(3, 10)).toBe(3);
    expect(introEndSeconds(3, 2)).toBeCloseTo(1.7);
    expect(introEndSeconds(3, 0.2)).toBe(0);
  });

  it('is opaque, then fades over the last half second, then gone', () => {
    expect(introOpacity(0, 30, 3)).toBe(1);
    expect(introOpacity(75, 30, 3)).toBe(1);
    expect(introOpacity(82.5, 30, 3)).toBeCloseTo(0.5);
    expect(introOpacity(90, 30, 3)).toBe(0);
    expect(introOpacity(0, 30, 0)).toBe(0);
    // A card shorter than the fade fades over its whole length.
    expect(introOpacity(3, 30, 0.2)).toBeCloseTo(0.5);
  });
});

describe('<MushafTitleOverlay>', () => {
  it('shows the intro card from 0.2 s: the framed surah name, a hairline, the range in Arabic and in small caps', () => {
    const p = base({overlay: overlay({title: 'intro'}), addsTime: true});
    // Frame 0 is the bare ground.
    expect(intro(at(0, p))).toBeNull();
    cleanup();
    const c = at(30, p);
    const card = intro(c)!;
    // Drawn on the ground, with no ground of its own.
    expect(part(c, 'backdrop')).toBeNull();
    const name = card.querySelector<HTMLElement>('[data-surah-name]')!;
    expect(name.dataset).toMatchObject({surahName: '1', framed: 'true'});
    expect(part(c, 'rule')).not.toBeNull();
    expect(part(c, 'arabic-range')!.textContent).toBe('\u2067الآيات ٢–٧\u2069');
    expect(part(c, 'arabic-range')!.dir).toBe('rtl');
    // Small caps without the macrons: the font sets a capital Ā's macron beside its letter.
    expect(part(c, 'range')!.textContent).toBe('Ayat 2–7');
    expect(part(c, 'range')!.style.fontVariantCaps).toBe('all-small-caps');
    expect(corner(c)).toBeNull();
  });

  it('names both ends of a passage across surahs, framed under the first surah’s name', () => {
    const c = at(
      30,
      base({overlay: overlay({title: 'intro'}), surah: 113, fromAyah: 4, toSurah: 114, toAyah: 2, addsTime: true}),
    );
    expect(intro(c)!.querySelector<HTMLElement>('[data-surah-name]')!.dataset.surahName).toBe('113');
    expect(part(c, 'range')!.textContent).toBe('Ayat 113:4–114:2');
    expect(part(c, 'arabic-range')!.textContent).toBe('\u2067الآيات ١١٣:٤–١١٤:٢\u2069');
  });

  it('shows no card without a surah to name, the corner label at once with the surah heard', () => {
    const c = at(0, base({overlay: overlay({title: 'both'}), surah: undefined, ayahKey: '114:1'}));
    expect(intro(c)).toBeNull();
    expect(corner(c)!.textContent).toBe('An-Nas · 1');
    expect(corner(c)!.style.opacity).toBe('0.6');
    cleanup();
    expect(corner(at(0, base({overlay: overlay({title: 'corner'}), surah: undefined, ayahKey: null})))).toBeNull();
  });

  it('is gone once introSeconds have passed when it adds its time', () => {
    const p = base({overlay: overlay({title: 'intro', introSeconds: 3}), addsTime: true});
    expect(intro(at(89, p))).not.toBeNull();
    cleanup();
    expect(intro(at(90, p))).toBeNull();
    cleanup();
    expect(at(300, p).innerHTML).toBe('');
  });

  it('covers the lines in the ground and goes 0.3 s before an earlier first word when it does not add its time', () => {
    const p = base({overlay: overlay({title: 'intro', introSeconds: 3}), firstWordSeconds: 1.3});
    const first = at(0, p);
    expect(part(first, 'backdrop')!.style).toMatchObject({backgroundColor: 'rgb(251, 247, 238)', opacity: '1'});
    cleanup();
    expect(intro(at(29, p))).not.toBeNull();
    cleanup();
    expect(intro(at(30, p))).toBeNull();
  });

  it('shows the reciter line on the card only when one is set, and the translation’s credit', () => {
    const none = at(30, base({overlay: overlay({title: 'intro'}), addsTime: true}));
    expect(part(none, 'reciter')).toBeNull();
    expect(part(none, 'translation')).toBeNull();
    cleanup();
    const named = at(
      30,
      base({
        overlay: overlay({title: 'intro', reciter: 'Abdul Hamid Ghraio'}),
        addsTime: true,
        translationName: 'Saheeh International',
      }),
    );
    expect(part(named, 'reciter')!.textContent).toBe('Abdul Hamid Ghraio');
    expect(part(named, 'reciter')!.style.fontStyle).toBe('italic');
    expect(part(named, 'translation')!.textContent).toBe('Translation of the meanings · Saheeh International');
    // 0.8 L at 60 % of the ink, legible at 1080p.
    expect(part(named, 'translation')!.style.opacity).toBe('0.6');
    cleanup();
    // The corner label no longer carries the reciter.
    expect(
      corner(at(60, base({overlay: overlay({title: 'corner', reciter: 'Abdul Hamid Ghraio'})})))!.textContent,
    ).toBe('Al-Fatihah · 3');
  });

  it('hands the font props to the surah name, in the overlay’s colour and font', () => {
    const c = at(
      30,
      base({
        overlay: overlay({title: 'intro', color: '#112233', font: 'Inter'}),
        fontProps: {fontSrc: 'cdn'},
        addsTime: true,
      }),
    );
    expect(c.querySelector<HTMLElement>('[data-surah-name]')!.dataset.fontSrc).toBe('yes');
    expect(intro(c)!.style.color).toBe('rgb(17, 34, 51)');
    expect(intro(c)!.style.fontFamily).toBe('Inter');
  });

  it('shows the corner label alone under corner, in its corner inside the safe area, at the frame’s label size by default', () => {
    const c = at(60, base({overlay: overlay({title: 'corner', corner: 'bottom-left', cornerSize: 30})}));
    expect(intro(c)).toBeNull();
    const label = corner(c)!;
    expect(label.textContent).toBe('Al-Fatihah · 3');
    expect(label.style).toMatchObject({bottom: '54px', left: '54px', fontSize: '30px', textAlign: 'left'});
    expect(label.style.fontVariantCaps).toBe('all-small-caps');
    cleanup();
    // cornerSize 0 follows the frame: 2.4 % of 1080 px.
    expect(corner(at(60, base({overlay: overlay({title: 'corner'})})))!.style.fontSize).toBe('26px');
    cleanup();
    // At 9:16 it stays clear of the platform's bands.
    remotion.state.width = 1080;
    remotion.state.height = 1920;
    expect(corner(at(60, base({overlay: overlay({title: 'corner'})})))!.style).toMatchObject({
      top: '230px',
      fontSize: '37px',
    });
  });

  it('moves the corner label inside the jadwal’s inner rule when the jadwal is drawn', () => {
    // The inner rule ends at 63 px: the label starts half a label (13 px) inside it, never across the gold.
    const label = corner(at(60, base({overlay: overlay({title: 'corner', corner: 'top-right'}), jadwal: true})))!;
    expect(label.style).toMatchObject({top: '76px', right: '76px'});
    cleanup();
    remotion.state.width = 1080;
    remotion.state.height = 1920;
    expect(
      corner(at(60, base({overlay: overlay({title: 'corner', corner: 'bottom-left'}), jadwal: true})))!.style,
    ).toMatchObject({bottom: '346px', left: '82px'});
  });

  it('brings the corner label in from 0.4 s after the card under both, and halos it over an image', () => {
    const p = base({overlay: overlay({title: 'both', introSeconds: 3}), addsTime: true});
    expect(corner(at(0, p))).toBeNull();
    cleanup();
    expect(corner(at(102, p))).toBeNull();
    cleanup();
    expect(Number(corner(at(114, p))!.style.opacity)).toBeCloseTo(0.6 * SINE(12 / 24), 4);
    cleanup();
    const after = corner(at(150, p))!;
    expect(after.style.opacity).toBe('0.6');
    expect(after.style.textShadow).toBe('');
    expect(after.textContent).toBe('Al-Fatihah · 3');
    cleanup();
    expect(corner(at(150, {...p, overImage: true}))!.style.textShadow).toMatch(
      /^0 0 0.6em rgba\(251, 247, 238, 0.5\)$/,
    );
  });

  it('dissolves the number alone when the ayah changes', () => {
    const p = base({
      overlay: overlay({title: 'corner'}),
      ayahKey: '1:4',
      ayahChange: {outgoing: {key: '1:3', opacity: 0.4}, opacity: 0.3},
    });
    const label = corner(at(60, p))!;
    expect(label.textContent).toBe('Al-Fatihah · 34');
    const outgoing = label.querySelector<HTMLElement>('[data-mushaf-overlay-part="outgoing"]')!;
    expect(outgoing.textContent).toBe('3');
    expect(outgoing.style.opacity).toBe('0.4');
  });

  it('renders nothing under title none', () => {
    expect(at(0, base({overlay: overlay({title: 'none'})})).innerHTML).toBe('');
  });
});

describe('<MushafCornerLabel>', () => {
  const label = (ayahKey: string | null, surah = 1) =>
    render(<MushafCornerLabel surah={surah} ayahKey={ayahKey} color="#000" font="serif" corner="top-right" size={28} />)
      .container.firstElementChild as HTMLElement;

  it('names the surah of the ayah key and its ayah, else the surah it is given, and sits top right', () => {
    expect(label('2:255').textContent).toBe('Al-Baqarah · 255');
    cleanup();
    const el = label(null, 36);
    expect(el.textContent).toBe('Ya-Sin');
    expect(el.style).toMatchObject({top: '28px', right: '28px', textAlign: 'right'});
  });
});
