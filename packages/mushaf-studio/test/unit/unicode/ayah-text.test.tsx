// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import type * as React from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {AyahText, type AyahWord} from '../../../src/unicode';

afterEach(cleanup);

const WORDS: readonly AyahWord[] = [
  {id: '1:3:1', position: 1, text: 'ٱلرَّحْمَـٰنِ', kind: 'word'},
  {id: '1:3:2', position: 2, text: 'ٱلرَّحِيمِ', kind: 'word'},
  {id: '1:3:3', position: 3, text: '٣', kind: 'end'},
];

const mount = (props: Partial<React.ComponentProps<typeof AyahText>> = {}) =>
  render(<AyahText words={WORDS} fontFamily="mushaf-uthmanic-hafs" fontSize={96} lineHeight={1.9} {...props} />)
    .container.firstElementChild as HTMLElement;

const spans = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('span.mushaf-uword'));

describe('<AyahText>', () => {
  it('is one right-to-left Arabic block, centred, in the font, with wider word spacing', () => {
    const root = mount({color: 'rgb(244, 239, 230)', maxWidth: 840});
    expect(root.tagName).toBe('DIV');
    expect(root.getAttribute('dir')).toBe('rtl');
    expect(root.getAttribute('lang')).toBe('ar');
    expect(root.className).toBe('mushaf-ayah-text');
    expect(root.style.textAlign).toBe('center');
    expect(root.style.wordSpacing).toBe('0.25em');
    expect(root.style.fontFamily).toBe('mushaf-uthmanic-hafs');
    expect(root.style.fontSize).toBe('96px');
    expect(root.style.lineHeight).toBe('1.9');
    expect(root.style.color).toBe('rgb(244, 239, 230)');
    expect(root.style.maxWidth).toBe('840px');
    expect(root.style.fontFeatureSettings).toBe('');
  });

  it('paints a span per word in order, separated by spaces, the marker as its digits alone', () => {
    const root = mount();
    const all = spans(root);
    expect(all.map((s) => s.dataset.location)).toEqual(['1:3:1', '1:3:2', '1:3:3']);
    expect(all.map((s) => s.className)).toEqual([
      'mushaf-uword mushaf-uword--word',
      'mushaf-uword mushaf-uword--word',
      'mushaf-uword mushaf-uword--end',
    ]);
    expect(all[2]!.textContent).toBe('٣');
    expect(root.textContent).toBe(`${WORDS[0]!.text} ${WORDS[1]!.text} ٣`);
  });

  it('marks the active word with the class and the highlight style, over its own word style', () => {
    const root = mount({
      activeWordId: '1:3:2',
      highlightStyle: {color: 'rgb(200, 164, 92)'},
      wordStyle: (word) => (word.kind === 'word' ? {opacity: 0.4, color: 'rgb(1, 2, 3)'} : undefined),
    });
    const [first, active, marker] = spans(root);
    expect(active!.className).toBe('mushaf-uword mushaf-uword--word mushaf-uword--active');
    expect(active!.style.color).toBe('rgb(200, 164, 92)');
    expect(active!.style.opacity).toBe('0.4');
    expect(first!.className).not.toContain('--active');
    expect(first!.style.color).toBe('rgb(1, 2, 3)');
    expect(marker!.getAttribute('style')).toBeNull();
    expect(root.querySelectorAll('.mushaf-uword--active')).toHaveLength(1);
  });

  it('marks nothing without an active word, or for one not in the ayah', () => {
    expect(
      mount({activeWordId: null, highlightStyle: {color: 'red'}}).querySelector('.mushaf-uword--active'),
    ).toBeNull();
    expect(
      mount({activeWordId: '1:4:1', highlightStyle: {color: 'red'}}).querySelector('.mushaf-uword--active'),
    ).toBeNull();
  });

  it('takes a className and a style over its own', () => {
    const root = mount({className: 'reel', style: {visibility: 'hidden', textAlign: 'right'}});
    expect(root.className).toBe('mushaf-ayah-text reel');
    expect(root.style.visibility).toBe('hidden');
    expect(root.style.textAlign).toBe('right');
  });

  it('is pure in its props: the same props give the same markup', () => {
    const props = {activeWordId: '1:3:1', highlightStyle: {color: 'red'}} as const;
    const a = mount(props).outerHTML;
    cleanup();
    expect(mount(props).outerHTML).toBe(a);
  });

  it('keeps the last word and the marker together in one nowrap span, the word spans as they are', () => {
    const root = mount({activeWordId: '1:3:2', highlightStyle: {color: 'rgb(200, 164, 92)'}});
    const tails = root.querySelectorAll<HTMLElement>('.mushaf-ayah-tail');
    expect(tails).toHaveLength(1);
    const tail = tails[0]!;
    expect(tail.tagName).toBe('SPAN');
    expect(tail.style.whiteSpace).toBe('nowrap');
    expect(tail.parentElement).toBe(root);
    const [last, marker] = Array.from(tail.children) as HTMLElement[];
    expect(tail.children).toHaveLength(2);
    expect(last!.className).toBe('mushaf-uword mushaf-uword--word mushaf-uword--active');
    expect(last!.dataset.location).toBe('1:3:2');
    expect(last!.style.color).toBe('rgb(200, 164, 92)');
    expect(marker!.className).toBe('mushaf-uword mushaf-uword--end');
    expect(marker!.dataset.location).toBe('1:3:3');
    expect(tail.textContent).toBe(`${WORDS[1]!.text} ٣`);
    // The words before stay outside it, a line break possible after each.
    expect(spans(root)[0]!.parentElement).toBe(root);
    expect(root.textContent).toBe(`${WORDS[0]!.text} ${WORDS[1]!.text} ٣`);
  });

  it('groups nothing for an ayah without its marker, or a marker alone', () => {
    const words = mount({words: WORDS.slice(0, 2)});
    expect(words.querySelector('.mushaf-ayah-tail')).toBeNull();
    expect(spans(words).every((span) => span.parentElement === words)).toBe(true);
    expect(words.textContent).toBe(`${WORDS[0]!.text} ${WORDS[1]!.text}`);
    cleanup();
    const marker = mount({words: WORDS.slice(2)});
    expect(marker.querySelector('.mushaf-ayah-tail')).toBeNull();
    expect(marker.textContent).toBe('٣');
  });

  it('draws the cue wordText gives over the word, which stays hidden under it to keep its width', () => {
    const root = mount({wordText: (word) => (word.id === '1:3:2' ? 'ٱـ' : word.kind === 'end' ? '3' : undefined)});
    const [plain, cued, marker] = spans(root);
    expect(plain!.textContent).toBe(WORDS[0]!.text);
    expect(plain!.children).toHaveLength(0);
    // The word span keeps its class and id; inside, the full word is laid out hidden, the cue over it.
    expect(cued!.className).toBe('mushaf-uword mushaf-uword--word');
    expect(cued!.dataset.location).toBe('1:3:2');
    const box = cued!.firstElementChild as HTMLElement;
    expect(cued!.children).toHaveLength(1);
    expect(box.dataset.mushafCueBox).toBe('');
    expect(box.style.display).toBe('inline-block');
    expect(box.style.position).toBe('relative');
    const [full, cue] = Array.from(box.children) as HTMLElement[];
    expect(full!.dataset.mushafCueWord).toBe('');
    expect(full!.textContent).toBe(WORDS[1]!.text);
    expect(full!.style.visibility).toBe('hidden');
    expect(cue!.dataset.mushafCue).toBe('');
    expect(cue!.textContent).toBe('ٱـ');
    // Over the word's right edge, where a right-to-left word starts; seen whenever the ayah is.
    expect(cue!.style.position).toBe('absolute');
    expect(cue!.style.top).toBe('0px');
    expect(cue!.style.right).toBe('0px');
    expect(cue!.style.left).toBe('');
    expect(cue!.style.visibility).toBe('');
    // The marker's ornament keeps its place the same way.
    expect(marker!.querySelector<HTMLElement>('[data-mushaf-cue-word]')!.textContent).toBe('٣');
    expect(marker!.querySelector<HTMLElement>('[data-mushaf-cue]')!.textContent).toBe('3');
  });

  it('shows a word as it is when wordText gives nothing, or the word itself', () => {
    const root = mount({wordText: (word) => (word.id === '1:3:1' ? word.text : undefined)});
    expect(spans(root).map((span) => span.children.length)).toEqual([0, 0, 0]);
    expect(root.querySelector('[data-mushaf-cue]')).toBeNull();
  });
});
