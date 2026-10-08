// @vitest-environment jsdom
// <MushafRecitation> under the memorisation modes and with interlinear glosses, mounted under jsdom
// with `remotion` and the package's line components mocked (as in recitation.test.tsx): the clip
// timeline's audio, the lines and words timed per clip, the counter, the word visibility per mode,
// the line slots that grow for the glosses, and (with the window mock rendering the package's DOM
// contract) the glosses hidden with their words.
import {cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fatiha from '../../fixtures/timings/fatiha.json';
import {fatihaLines} from './helpers/fatiha-lines';
import {createRemotionMock} from './helpers/remotion-mock';

const remotion = createRemotionMock();
const delays = vi.hoisted(() => ({delayed: 0, open: new Set<number>()}));
/** `rows`: the window mock renders each line's row and words as the package does, for the glosses to measure. */
const contract = vi.hoisted(() => ({rows: false}));
vi.mock('remotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('remotion')>();
  const Audio = (props: {src: string; trimBefore?: number; trimAfter?: number}) => (
    <div data-audio={props.src} data-trim-before={props.trimBefore} data-trim-after={props.trimAfter} />
  );
  return {
    ...actual,
    ...remotion.module,
    Audio,
    useDelayRender: () => ({
      delayRender: () => {
        delays.delayed++;
        delays.open.add(delays.delayed);
        return delays.delayed;
      },
      continueRender: (handle: number) => delays.open.delete(handle),
      cancelRender: () => undefined,
    }),
  };
});

type LineData = import('@tlawat/remotion-mushaf-line').MushafLineData;
type LineProps = import('@tlawat/remotion-mushaf-line').MushafLineProps & {line: LineData};
type WindowProps = import('@tlawat/remotion-mushaf-line').MushafLineWindowProps;
vi.mock('@tlawat/remotion-mushaf-line', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tlawat/remotion-mushaf-line')>();
  const wordStyles = (
    props: Pick<LineProps, 'wordStyle' | 'activeWordId'>,
    lines: readonly LineData[],
    frame: number,
  ) =>
    JSON.stringify(
      Object.fromEntries(
        lines.flatMap((line) =>
          line.words.map((word) => [
            word.id,
            props.wordStyle?.(word, {line, frame, fps: 30, active: word.id === props.activeWordId, inSlice: true}) ??
              null,
          ]),
        ),
      ),
    );
  const MushafLine = (props: LineProps) => {
    const frame = remotion.useLocalFrame();
    return (
      <span
        className="mushaf-line-mock"
        data-line={props.line.line}
        data-line-height={props.lineHeight}
        data-style={JSON.stringify(props.style ?? null)}
        data-active-word-id={props.activeWordId ?? ''}
        data-word-styles={wordStyles(props, [props.line], frame)}
      />
    );
  };
  const MushafLineWindow = (props: WindowProps) => {
    const frame = remotion.useLocalFrame();
    const first = props.lines[0];
    return (
      <div
        className="mushaf-line-window-mock"
        data-line-count={props.lines.length}
        data-line-height={props.lineHeight}
        data-steps={JSON.stringify(props.steps ?? null)}
        data-position={props.position ?? ''}
        data-line-style={JSON.stringify(
          first && props.lineStyle
            ? props.lineStyle(first, {line: first, index: 0, position: 0, distance: 0, current: true, frame, fps: 30})
            : null,
        )}
        data-active-word-id={props.activeWordId ?? ''}
        data-word-styles={wordStyles(props, props.lines, frame)}
      >
        {contract.rows &&
          props.lines.map((line) => (
            <div key={line.line} className="mushaf-line" data-page={line.page} data-line={line.line}>
              {/* Every word 100 px wide, right to left from the row's right edge. */}
              <div className="mushaf-line__row" data-rect="0,1200" style={{visibility: 'visible'}}>
                {line.words.map((word, i) => (
                  <span
                    key={word.id}
                    className="mushaf-word"
                    data-location={word.id}
                    data-kind={word.kind}
                    data-rect={`${1100 - i * 100},100`}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
    );
  };
  return {...actual, MushafLine, MushafLineWindow, MushafSurahName: () => null};
});
vi.mock('../../../src/translations', () => ({
  ayahKeyOf: (id: string | null) => (id ? id.split(':').slice(0, 2).join(':') : null),
  TranslationBlock: () => null,
  TranslationStack: () => null,
  GlossStrip: () => <div data-gloss-strip="" />,
}));
vi.mock('../../../src/studio', () => ({MushafStudioPanel: () => null, isInStudio: () => false}));

const {MushafRecitation, defaultMushafRecitationProps} = await import('../../../src/compositions/recitation');
const {scheduleLines} = await import('@tlawat/remotion-mushaf-line');
const {clipTimeline} = await import('../../../src/memorize');
const {registerMushafFonts} = await import('../../../src/fonts');
const {interlinearExtraHeight, interlinearFontSize} = await import('../../../src/interlinear');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;
type ResolvedRecitation = import('../../../src/compositions/recitation').ResolvedRecitation;
type StudioTimings = import('../../../src/types').StudioTimings;
type Memorize = MushafRecitationProps['memorize'];

const timings = fatiha as unknown as StudioTimings;
const lines = fatihaLines();
const meta = {id: 'test', name: 'Test', language: 'en', source: 'file'};
const gloss = {kind: 'word' as const, meta, words: {'1:2:1': 'praise'}};
const resolved = (changes: Partial<ResolvedRecitation> = {}): ResolvedRecitation => ({
  timings,
  audioOffsetSeconds: 0,
  lines,
  schedule: scheduleLines(lines, timings),
  translation: null,
  gloss: null,
  transliteration: null,
  doubtful: {},
  ...changes,
});
const memorize = (changes: Partial<Memorize>): Memorize => ({...defaultMushafRecitationProps.memorize, ...changes});
const props = (changes: Partial<MushafRecitationProps> = {}, content: Partial<ResolvedRecitation> = {}) => ({
  ...defaultMushafRecitationProps,
  ...changes,
  resolved: resolved(content),
});
const mount = (p: MushafRecitationProps) => render(<MushafRecitation {...p} />).container;
const windowOf = (c: HTMLElement) => c.querySelector<HTMLElement>('.mushaf-line-window-mock')!;
const audios = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-audio]'));
const counter = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-mushaf-overlay="repeat-counter"]');
const stylesOf = (element: HTMLElement): Record<string, {opacity?: number} | null> =>
  JSON.parse(element.dataset.wordStyles!);
const at = (seconds: number) => {
  remotion.state.frame = Math.round(seconds * 30);
};
/** Repeat ayahs three times, half a second apart: ayah 2's plays start at 0.331, 3.891 and 7.451. */
const three = {repeat: 3, pauseSeconds: 0.5, revealAfterRepeats: 1};

beforeEach(() => {
  remotion.reset();
  registerMushafFonts({});
  delays.delayed = 0;
  delays.open.clear();
  contract.rows = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<MushafRecitation> memorisation', () => {
  it('off: one audio, the window driven by steps, no counter, every word shown', () => {
    at(1);
    const c = mount(props());
    expect(audios(c)).toHaveLength(1);
    expect(JSON.parse(windowOf(c).dataset.steps!)).not.toBeNull();
    expect(counter(c)).toBeNull();
    expect(Object.values(stylesOf(windowOf(c))).every((s) => s === null)).toBe(true);
  });

  it('repeat: one trimmed audio per clip, at the clip’s frame, and the counter', () => {
    at(4);
    const c = mount(props({memorize: memorize({mode: 'repeat', ...three})}, {audioOffsetSeconds: 2}));
    const clips = clipTimeline(timings, {mode: 'repeat', ...three});
    const list = audios(c);
    expect(list).toHaveLength(clips.length);
    const second = list[1]!;
    expect(second.dataset).toMatchObject({
      trimBefore: String(Math.round((2 + 0.331) * 30)),
      trimAfter: String(Math.round((2 + 3.391) * 30)),
    });
    const sequence = second.closest<HTMLElement>('[data-sequence]')!;
    expect(sequence.dataset).toMatchObject({from: String(Math.round(3.891 * 30)), sequence: 'Ayah 2 (2/3)'});
    expect(counter(c)!.textContent).toBe('2/3');
    // The title label sits top right by default: the counter goes top left.
    expect(counter(c)!.style.left).toBe('28px');
    expect(counter(c)!.style.color).toBe('rgb(27, 27, 27)');
    // Repeat hides nothing.
    expect(Object.values(stylesOf(windowOf(c))).every((s) => s === null)).toBe(true);
  });

  it('restarts the highlight with each play, and scrolls the window by position', () => {
    at(3.891 + 0.1);
    const c = mount(props({memorize: memorize({mode: 'repeat', ...three})}));
    expect(windowOf(c).dataset.activeWordId).toBe('1:2:1');
    expect(windowOf(c).dataset.steps).toBe('null');
    expect(Number(windowOf(c).dataset.position)).toBeCloseTo(0, 6);
    cleanup();
    // The third play of ayah 2 is done; ayah 3's line is current once its first play is near.
    at(12);
    const later = mount(props({memorize: memorize({mode: 'repeat', ...three})}));
    expect(later.querySelector<HTMLElement>('.mushaf-line-window-mock')!.dataset.activeWordId).toMatch(/^1:3:/);
    expect(Number(later.querySelector<HTMLElement>('.mushaf-line-window-mock')!.dataset.position)).toBeCloseTo(1, 6);
  });

  it('blank-upcoming hides the words to come on the first play and shows everything on the next', () => {
    at(1.5);
    const first = stylesOf(windowOf(mount(props({memorize: memorize({mode: 'blank-upcoming', ...three})}))));
    expect(first['1:2:1']).toBeNull();
    expect(first['1:2:4']).toEqual({opacity: 0});
    expect(first['1:7:1']).toEqual({opacity: 0});
    cleanup();
    at(3.891 + 1.2);
    const second = stylesOf(windowOf(mount(props({memorize: memorize({mode: 'blank-upcoming', ...three})}))));
    expect(Object.values(second).every((s) => s === null)).toBe(true);
  });

  it('blank-all hides what earlier ayahs recited; first-letters is a faint outline in the printed lines', () => {
    const clips = clipTimeline(timings, {mode: 'blank-all', ...three});
    const ayah3 = clips.find((clip) => clip.ayah === 3)!;
    at(ayah3.compositionFrom + 0.05);
    const blankAll = stylesOf(windowOf(mount(props({memorize: memorize({mode: 'blank-all', ...three})}))));
    expect(blankAll['1:2:1']).toEqual({opacity: 0});
    expect(blankAll['1:3:1']).toBeNull();
    expect(blankAll['1:3:2']).toEqual({opacity: 0});
    cleanup();
    const firstLetters = stylesOf(windowOf(mount(props({memorize: memorize({mode: 'first-letters', ...three})}))));
    expect(firstLetters['1:2:1']).toBeNull();
    expect(firstLetters['1:3:2']).toEqual({opacity: 0.12});
  });

  it('times the lines per clip when shown one at a time', () => {
    at(0);
    const c = mount(
      props({
        layout: {...defaultMushafRecitationProps.layout, visibleLines: 0},
        memorize: memorize({mode: 'repeat', ...three}),
      }),
    );
    const lineSequences = Array.from(c.querySelectorAll<HTMLElement>('[data-sequence^="p1 "]'));
    // One ayah per line: each line stays through its three plays, so one Sequence per line.
    expect(lineSequences).toHaveLength(6);
    const clips = clipTimeline(timings, {mode: 'repeat', ...three});
    const ayah3 = clips.find((clip) => clip.ayah === 3)!;
    expect(Number(lineSequences[1]!.dataset.from)).toBeGreaterThan(Math.round(ayah3.compositionFrom * 30) - 30);
  });
});

describe('<MushafRecitation> interlinear glosses', () => {
  const plainHeight = (c: HTMLElement) => Number(windowOf(c).dataset.lineHeight);

  it('grows the line slots only when interlinear is on and a gloss is loaded, and moves the line up', () => {
    const strip = mount(props({}, {gloss}));
    const base = plainHeight(strip);
    expect(strip.querySelector('[data-gloss-strip]')).not.toBeNull();
    expect(windowOf(strip).dataset.lineStyle).toBe('null');
    cleanup();
    const text = {...defaultMushafRecitationProps.text, glossPosition: 'interlinear' as const};
    const noGloss = mount(props({text}));
    expect(plainHeight(noGloss)).toBe(base);
    cleanup();
    const on = mount(props({text}, {gloss}));
    const extra = interlinearExtraHeight(1, interlinearFontSize(text.glossSize, 98));
    expect(plainHeight(on)).toBe(base + extra);
    expect(JSON.parse(windowOf(on).dataset.lineStyle!)).toEqual({transform: `translateY(${-extra / 2}px)`});
    expect(on.querySelector('[data-gloss-strip]')).toBeNull();
    expect(on.querySelector('[data-mushaf-interlinear-root]')).not.toBeNull();
    // The lines' block holds the grown slots.
    const block = on.querySelector<HTMLElement>('[data-mushaf-block="Mushaf lines"]')!;
    expect(block.style.height).toBe(`${3 * (base + extra)}px`);
    // No row to measure in the mocked lines: the handle is released.
    expect(delays.open.size).toBe(0);
    cleanup();
    const none = mount(props({text: {...text, glossPosition: 'none'}}, {gloss}));
    expect(none.querySelector('[data-gloss-strip]')).toBeNull();
    expect(plainHeight(none)).toBe(base);
  });

  it('two rows with a transliteration, and the shift on a line shown alone', () => {
    const text = {...defaultMushafRecitationProps.text, glossPosition: 'interlinear' as const};
    const c = mount(
      props({text, layout: {...defaultMushafRecitationProps.layout, visibleLines: 0}}, {gloss, transliteration: gloss}),
    );
    const line = c.querySelector<HTMLElement>('.mushaf-line-mock')!;
    const extra = interlinearExtraHeight(2, interlinearFontSize(text.glossSize, 98));
    expect(Number(line.dataset.lineHeight)).toBe(216 + extra);
    expect(JSON.parse(line.dataset.style!)).toEqual({transform: `translateY(${-extra / 2}px)`});
  });
});

describe('<MushafRecitation> interlinear glosses under a memorisation mode', () => {
  const text = {...defaultMushafRecitationProps.text, glossPosition: 'interlinear' as const};
  const glosses = {
    kind: 'word' as const,
    meta,
    words: {'1:2:1': 'praise', '1:2:2': 'to Allah', '1:2:4': 'worlds', '1:3:1': 'the Most Merciful'},
  };
  const label = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-interlinear-label="${id}"]`)!;
  const mountWithRows = (mode: Memorize['mode']) => {
    contract.rows = true;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const [left = 0, width = 0] = ((this as HTMLElement).dataset?.rect ?? '0,0').split(',').map(Number);
      return {left, width, right: left + width, top: 0, bottom: 10, height: 10, x: left, y: 0, toJSON: () => ({})};
    });
    return mount(props({text, memorize: memorize({mode, ...three})}, {gloss: glosses}));
  };

  it('blank-upcoming hides the label of a word to come and shows a recited one, on the first play only', () => {
    // 1.5 s: ayah 2's first play, word 2 being recited (from 0.901), word 4 to come (1.941).
    at(1.5);
    const c = mountWithRows('blank-upcoming');
    const words = stylesOf(windowOf(c));
    expect(words['1:2:4']).toEqual({opacity: 0});
    expect(label(c, '1:2:4').style.opacity).toBe('0');
    expect(label(c, '1:2:4').dataset.visibility).toBe('hidden');
    expect(label(c, '1:3:1').style.opacity).toBe('0');
    // Recited: shown, as its word is.
    expect(words['1:2:1']).toBeNull();
    expect(label(c, '1:2:1').style.opacity).toBe('');
    expect(label(c, '1:2:1').dataset.visibility).toBeUndefined();
    // The active word: shown, in the highlight colour.
    expect(windowOf(c).dataset.activeWordId).toBe('1:2:2');
    expect(label(c, '1:2:2').dataset.active).toBe('true');
    expect(label(c, '1:2:2').style.opacity).toBe('');
    expect(label(c, '1:2:2').style.color).not.toBe('');
    expect(delays.open.size).toBe(0);
    cleanup();
    // The second play reveals everything, the labels with the words.
    at(3.891 + 1.2);
    const second = mountWithRows('blank-upcoming');
    for (const id of ['1:2:1', '1:2:2', '1:2:4', '1:3:1']) expect(label(second, id).style.opacity).toBe('');
  });

  it('first-letters leaves a faint label under a faint word', () => {
    at(1.5);
    const c = mountWithRows('first-letters');
    expect(stylesOf(windowOf(c))['1:2:4']).toEqual({opacity: 0.12});
    expect(label(c, '1:2:4').style.opacity).toBe('0.12');
    expect(label(c, '1:2:4').dataset.visibility).toBe('faint');
    expect(label(c, '1:2:1').style.opacity).toBe('');
  });

  it('with memorize off (or repeat) every label is shown as before', () => {
    at(1.5);
    for (const mode of ['off', 'repeat'] as const) {
      const c = mountWithRows(mode);
      const all = Array.from(c.querySelectorAll<HTMLElement>('[data-interlinear-label]'));
      expect(all.map((l) => l.dataset.interlinearLabel).sort()).toEqual(['1:2:1', '1:2:2', '1:2:4', '1:3:1']);
      for (const l of all) {
        expect(l.style.opacity).toBe('');
        expect(l.dataset.visibility).toBeUndefined();
      }
      expect(label(c, '1:2:4').textContent).toBe('worlds');
      cleanup();
    }
  });
});
