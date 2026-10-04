// @vitest-environment jsdom
// <InterlinearGlosses> over lines built in the package's DOM contract, with the layout stubbed:
// every element's client rect comes from its `data-rect` ("left,width"), and a label text's natural
// width is 20 px per character. `delayRender()` is a spy.
import {act, cleanup, render} from '@testing-library/react';
import type * as React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const handles = vi.hoisted(() => ({next: 1, open: new Set<number>(), delayed: 0, continued: [] as number[]}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  useDelayRender: () => ({
    delayRender: () => {
      const handle = handles.next++;
      handles.open.add(handle);
      handles.delayed++;
      return handle;
    },
    continueRender: (handle: number) => {
      handles.open.delete(handle);
      handles.continued.push(handle);
    },
    cancelRender: () => undefined,
  }),
}));

const {InterlinearGlosses} = await import('../../../src/interlinear');
type WordGloss = import('../../../src/types').WordGloss;

const meta = {id: 'test', name: 'Test', language: 'en', source: 'file'};
const gloss: WordGloss = {
  kind: 'word',
  meta,
  words: {'1:2:1': 'praise', '1:2:2': 'to Allah, the One worshipped', '1:2:3': 'Lord', '1:2:4': 'worlds'},
};
const transliteration: WordGloss = {kind: 'word', meta, words: {'1:2:1': 'al-ḥamdu', '1:2:2': 'lillahi'}};

type FakeWord = {readonly id: string; readonly rect: string; readonly kind?: 'end'; readonly hidden?: boolean};
/** Ayah 2 on one line, the row 600 px wide from x = 100: word 1 rightmost, word 3 sliced away. */
const WORDS: readonly FakeWord[] = [
  {id: '1:2:1', rect: '500,200'},
  {id: '1:2:2', rect: '320,160'},
  {id: '1:2:3', rect: '0,0', hidden: true},
  {id: '1:2:4', rect: '240,60'},
  {id: '1:2:5', rect: '220,20', kind: 'end'},
];

const FakeLine: React.FC<{readonly visible: boolean; readonly words?: readonly FakeWord[]; readonly line?: number}> = ({
  visible,
  words = WORDS,
  line = 3,
}) => (
  <div className="mushaf-line" data-page="1" data-line={line}>
    <div className="mushaf-line__row" data-rect="100,600" style={{visibility: visible ? 'visible' : 'hidden'}}>
      {words.map((word) => (
        <span
          key={word.id}
          className="mushaf-word"
          data-location={word.id}
          data-kind={word.kind ?? 'word'}
          data-hidden={word.hidden ? 'true' : undefined}
          data-rect={word.rect}
        />
      ))}
    </div>
  </div>
);

const props = {
  gloss,
  transliteration: null,
  activeWordId: null,
  fontFamily: 'Noto Sans',
  fontSize: 20,
  color: '#6a6a6a',
  top: 200,
};
const labels = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-interlinear-label]'));
const boxOf = (c: HTMLElement, id: string) => {
  const style = c.querySelector<HTMLElement>(`[data-interlinear-label="${id}"]`)!.style;
  return [style.left, style.width];
};
const label = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-interlinear-label="${id}"]`);

beforeEach(() => {
  handles.next = 1;
  handles.open.clear();
  handles.delayed = 0;
  handles.continued = [];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const [left = 0, width = 0] = ((this as HTMLElement).dataset?.rect ?? '0,0').split(',').map(Number);
    return {left, width, right: left + width, top: 0, bottom: 10, height: 10, x: left, y: 0, toJSON: () => ({})};
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-interlinear-fit') ? (this.textContent?.length ?? 0) * 20 : 0;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<InterlinearGlosses>', () => {
  it('places a label under each shown word of a visible row, inside the row, and releases its handle', () => {
    const {container} = render(
      <InterlinearGlosses {...props}>
        <FakeLine visible />
      </InterlinearGlosses>,
    );
    const row = container.querySelector<HTMLElement>('.mushaf-line__row')!;
    const layer = row.querySelector<HTMLElement>('[data-mushaf-interlinear]')!;
    expect(layer).not.toBeNull();
    expect(layer.style.top).toBe('200px');
    expect(layer.style.width).toBe('0px');
    // Row-relative: word 1 is 400-600, word 2 220-380, word 4 140-200, the marker 120-140.
    expect(boxOf(container, '1:2:1')).toEqual(['400px', '200px']);
    expect(boxOf(container, '1:2:2')).toEqual(['210px', '180px']);
    expect(boxOf(container, '1:2:4')).toEqual(['140px', '60px']);
    expect(label(container, '1:2:1')!.textContent).toBe('praise');
    expect(handles.delayed).toBe(1);
    expect(handles.open.size).toBe(0);
  });

  it('gives no label to the word a slice hides, nor to the marker', () => {
    const {container} = render(
      <InterlinearGlosses {...props}>
        <FakeLine visible />
      </InterlinearGlosses>,
    );
    expect(labels(container).map((l) => l.dataset.interlinearLabel)).toEqual(['1:2:4', '1:2:2', '1:2:1']);
    expect(label(container, '1:2:3')).toBeNull();
    expect(label(container, '1:2:5')).toBeNull();
  });

  it('shrinks a label that is too wide to its floor and leaves the rest to the ellipsis', () => {
    const {container} = render(
      <InterlinearGlosses {...props}>
        <FakeLine visible />
      </InterlinearGlosses>,
    );
    const fitted = (id: string) => label(container, id)!.querySelector<HTMLElement>('[data-interlinear-fit]')!.style;
    // "praise": 120 px natural in 200: kept. "to Allah, the One worshipped": 560 in 180: 70 %.
    expect(fitted('1:2:1').fontSize).toBe('20px');
    expect(fitted('1:2:2').fontSize).toBe('14px');
    expect(fitted('1:2:2').textOverflow).toBe('ellipsis');
  });

  it('holds the render while a row is hidden, and measures it once the package shows it', async () => {
    const {container} = render(
      <InterlinearGlosses {...props}>
        <FakeLine visible={false} />
      </InterlinearGlosses>,
    );
    expect(labels(container)).toHaveLength(0);
    expect(handles.open.size).toBe(1);
    // The font arrives: the package flips the row's visibility without this component re-rendering.
    await act(async () => {
      container.querySelector<HTMLElement>('.mushaf-line__row')!.style.visibility = 'visible';
    });
    expect(labels(container)).toHaveLength(3);
    expect(handles.open.size).toBe(0);
  });

  it('two rows when the transliteration is loaded too, and the active label alone in the highlight colour', () => {
    const {container} = render(
      <InterlinearGlosses {...props} transliteration={transliteration} activeWordId="1:2:2" activeColor="#c8a45c">
        <FakeLine visible />
      </InterlinearGlosses>,
    );
    const rows = Array.from(label(container, '1:2:2')!.querySelectorAll('[data-interlinear-fit]'));
    expect(rows.map((r) => r.textContent)).toEqual(['to Allah, the One worshipped', 'lillahi']);
    // A word without a transliteration keeps its (empty) second row, so the rows stay aligned.
    expect(Array.from(label(container, '1:2:4')!.querySelectorAll('[data-interlinear-fit]'))).toHaveLength(2);
    expect(label(container, '1:2:2')!.style.color).toBe('rgb(200, 164, 92)');
    expect(label(container, '1:2:2')!.dataset.active).toBe('true');
    expect(label(container, '1:2:1')!.style.color).toBe('');
  });

  it('re-measures when the lines change, and drops the labels of a line that left', () => {
    const view = render(
      <InterlinearGlosses {...props}>
        <FakeLine visible line={3} />
      </InterlinearGlosses>,
    );
    expect(labels(view.container)).toHaveLength(3);
    view.rerender(
      <InterlinearGlosses {...props}>
        <FakeLine visible line={4} words={[{id: '1:2:1', rect: '300,100'}]} />
      </InterlinearGlosses>,
    );
    expect(labels(view.container)).toHaveLength(1);
    expect(view.container.querySelector('[data-mushaf-interlinear]')!.getAttribute('data-mushaf-interlinear')).toBe(
      'p1l4sall#0',
    );
    // One word alone, 200-300 of the row: as wide as twice its room to the nearer edge.
    expect(label(view.container, '1:2:1')!.style.left).toBe('0px');
    expect(label(view.container, '1:2:1')!.style.width).toBe('500px');
    expect(handles.open.size).toBe(0);
  });

  it('skips a row that is not laid out (zero width) without holding the render, and lets go on unmount', () => {
    const NotLaidOut = () => (
      <div className="mushaf-line" data-page="1" data-line="3">
        <div className="mushaf-line__row" data-rect="0,0" style={{visibility: 'visible'}} />
      </div>
    );
    const view = render(
      <InterlinearGlosses {...props}>
        <NotLaidOut />
      </InterlinearGlosses>,
    );
    expect(handles.open.size).toBe(0);
    view.rerender(
      <InterlinearGlosses {...props}>
        <FakeLine visible={false} />
      </InterlinearGlosses>,
    );
    expect(handles.open.size).toBe(1);
    view.unmount();
    expect(handles.open.size).toBe(0);
  });
});
