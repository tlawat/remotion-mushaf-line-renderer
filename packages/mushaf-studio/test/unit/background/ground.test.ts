// The ground the marks are measured against comes from what is painted, the image that
// `layout.backgroundImage` still shows for props saved before the `background` group included.
import {describe, expect, it} from 'vitest';
import {defaultBackground, groundFor} from '../../../src/background';
import {legibleAccent, washAlpha} from '../../../src/schema';

const CHARCOAL = '#121416';
const IVORY = '#f8f3e6';

describe('groundFor', () => {
  it('reads light ink over a legacy layout.backgroundImage as a dark ground, not the page colour under it', () => {
    const layout = {background: IVORY, color: '#f1eadb', backgroundImage: 'bg.jpg'};
    expect(defaultBackground.kind).toBe('color');
    expect(groundFor(defaultBackground, layout)).toBe(CHARCOAL);
    // So the tint is lightened for the dark picture, and the wash takes the dark ground's strength.
    expect(legibleAccent('#b8913a', groundFor(defaultBackground, layout))).toBe('#b19353');
    expect(washAlpha(groundFor(defaultBackground, layout))).toBe(0.09);
    // Dark ink over the same image: an ivory stand-in.
    expect(groundFor(defaultBackground, {...layout, color: '#1c1a16'})).toBe(IVORY);
  });

  it('is the page colour when nothing covers it, and the stand-in for an image or a video of the group', () => {
    const layout = {background: '#10241b', color: '#eee7d6', backgroundImage: ''};
    expect(groundFor(defaultBackground, layout)).toBe('#10241b');
    expect(groundFor({...defaultBackground, kind: 'gradient'}, layout)).toBe('#10241b');
    expect(groundFor({...defaultBackground, kind: 'image', src: 'a.jpg'}, layout)).toBe(CHARCOAL);
    expect(groundFor({...defaultBackground, kind: 'video', src: 'a.mp4'}, layout)).toBe(CHARCOAL);
  });
});
