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

  it('paints a span per word in order, separated by spaces, the marker as U+06DD and its digits', () => {
    const root = mount();
    const all = spans(root);
    expect(all.map((s) => s.dataset.location)).toEqual(['1:3:1', '1:3:2', '1:3:3']);
    expect(all.map((s) => s.className)).toEqual([
      'mushaf-uword mushaf-uword--word',
      'mushaf-uword mushaf-uword--word',
      'mushaf-uword mushaf-uword--end',
    ]);
    expect(all[2]!.textContent).toBe('۝٣');
    expect(root.textContent).toBe(`${WORDS[0]!.text} ${WORDS[1]!.text} ۝٣`);
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

  it('shows the text wordText gives for a word, the marker keeping its ornament', () => {
    const root = mount({wordText: (word) => (word.id === '1:3:2' ? 'ٱـ' : word.kind === 'end' ? '3' : undefined)});
    expect(spans(root).map((span) => span.textContent)).toEqual(['ٱلرَّحْمَـٰنِ', 'ٱـ', '۝3']);
  });
});
