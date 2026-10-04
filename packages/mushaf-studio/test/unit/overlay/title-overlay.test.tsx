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
  ayahRangeText,
  introEndSeconds,
  introOpacity,
  MushafCornerLabel,
  MushafTitleOverlay,
  SURAH_NAMES,
  surahEnglishName,
} = await import('../../../src/overlay');
const {defaultOverlay} = await import('../../../src/schema');
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
  it('shows the intro card at frame 0: the framed surah name, the range in both digits, over the page colour', () => {
    const c = at(0, base({overlay: overlay({title: 'intro'})}));
    const card = intro(c)!;
    expect(card).not.toBeNull();
    expect(card.style.backgroundColor).toBe('rgb(251, 247, 238)');
    expect(card.style.opacity).toBe('1');
    const name = card.querySelector<HTMLElement>('[data-surah-name]')!;
    expect(name.dataset).toMatchObject({surahName: '1', framed: 'true'});
    expect(part(c, 'range')!.textContent).toBe('Al-Fatihah · 1:2–7 · ١:٢–٧');
    expect(corner(c)).toBeNull();
  });

  it('is gone once introSeconds have passed', () => {
    const p = base({overlay: overlay({title: 'intro', introSeconds: 3})});
    expect(intro(at(89, p))).not.toBeNull();
    cleanup();
    expect(intro(at(90, p))).toBeNull();
    cleanup();
    expect(at(300, p).innerHTML).toBe('');
  });

  it('goes 0.3 s before a first word heard inside introSeconds', () => {
    const p = base({overlay: overlay({title: 'intro', introSeconds: 3}), firstWordSeconds: 1.3});
    expect(intro(at(29, p))).not.toBeNull();
    cleanup();
    expect(intro(at(30, p))).toBeNull();
  });

  it('shows the reciter line only when one is set, in the card and the corner', () => {
    const none = at(0, base({overlay: overlay({title: 'intro'})}));
    expect(part(none, 'reciter')).toBeNull();
    cleanup();
    const named = at(0, base({overlay: overlay({title: 'intro', reciter: 'Abdul Hamid Ghraio'})}));
    expect(part(named, 'reciter')!.textContent).toBe('Abdul Hamid Ghraio');
    cleanup();
    expect(corner(at(0, base({overlay: overlay({title: 'corner', reciter: 'Abdul Hamid Ghraio'})})))!.textContent).toBe(
      'Al-Fatihah · 1:3 · Abdul Hamid Ghraio',
    );
  });

  it('hands the font props to the surah name, in the overlay’s colour and font', () => {
    const c = at(
      0,
      base({overlay: overlay({title: 'intro', color: '#112233', font: 'Inter'}), fontProps: {fontSrc: 'cdn'}}),
    );
    expect(c.querySelector<HTMLElement>('[data-surah-name]')!.dataset.fontSrc).toBe('yes');
    expect(intro(c)!.style.color).toBe('rgb(17, 34, 51)');
    expect(intro(c)!.style.fontFamily).toBe('Inter');
  });

  it('shows the corner label alone under corner, with the ayah key it is given, in its corner', () => {
    const c = at(0, base({overlay: overlay({title: 'corner', corner: 'bottom-left', cornerSize: 30})}));
    expect(intro(c)).toBeNull();
    const label = corner(c)!;
    expect(label.textContent).toBe('Al-Fatihah · 1:3');
    expect(label.style).toMatchObject({bottom: '30px', left: '30px', fontSize: '30px', textAlign: 'left'});
  });

  it('brings the corner label in as the card goes under both', () => {
    const p = base({overlay: overlay({title: 'both', introSeconds: 3})});
    expect(corner(at(0, p))).toBeNull();
    cleanup();
    expect(corner(at(82, p))!.style.opacity).not.toBe('');
    cleanup();
    const after = corner(at(120, p))!;
    expect(after.style.opacity).toBe('');
    expect(after.textContent).toBe('Al-Fatihah · 1:3');
  });

  it('renders nothing under title none', () => {
    expect(at(0, base({overlay: overlay({title: 'none'})})).innerHTML).toBe('');
  });
});

describe('<MushafCornerLabel>', () => {
  const label = (ayahKey: string | null, surah = 1) =>
    render(
      <MushafCornerLabel
        surah={surah}
        ayahKey={ayahKey}
        reciter=""
        color="#000"
        font="serif"
        corner="top-right"
        size={28}
      />,
    ).container.firstElementChild as HTMLElement;

  it('names the surah of the ayah key, else the surah it is given, and sits top right', () => {
    expect(label('2:255').textContent).toBe('Al-Baqarah · 2:255');
    cleanup();
    const el = label(null, 36);
    expect(el.textContent).toBe('Ya-Sin');
    expect(el.style).toMatchObject({top: '28px', right: '28px', textAlign: 'right'});
  });
});
