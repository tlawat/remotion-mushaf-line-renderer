// @vitest-environment jsdom
// The background under jsdom with `remotion` mocked: the style of each kind and fit, the Ken Burns
// transform over the composition, the dim layer, the glow and its opacity from the audio level, and
// the video's loop.
import {cleanup, render} from '@testing-library/react';
import type * as React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRemotionMock} from '../compositions/helpers/remotion-mock';

const remotion = createRemotionMock();
type MediaProps = {src: string; muted?: boolean; loop?: boolean; style?: React.CSSProperties};
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  ...remotion.module,
  Img: ({src, style}: MediaProps) => <img data-media="img" data-src={src} style={style} alt="" />,
  OffthreadVideo: ({src, muted, style}: MediaProps) => (
    <div data-media="offthread" data-src={src} data-muted={String(muted)} style={style} />
  ),
  Html5Video: ({src, muted, loop, style}: MediaProps) => (
    <div data-media="html5" data-src={src} data-muted={String(muted)} data-loop={String(loop)} style={style} />
  ),
  Loop: ({durationInFrames, children}: {durationInFrames: number; children: React.ReactNode}) => (
    <div data-loop-frames={durationInFrames}>{children}</div>
  ),
  // Divs stand in for the videos. The real one passes its HTML attributes through; the shared mock keeps only the style.
  AbsoluteFill: ({style, children, ...rest}: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-absolute-fill="" style={style} {...rest}>
      {children}
    </div>
  ),
}));

const {
  backgroundBaseStyle,
  backgroundSchema,
  defaultBackground,
  GLOW_REST,
  glowOpacity,
  glowStyle,
  kenBurnsTransform,
  MushafBackground,
  mediaBoxStyle,
  mediaStyle,
  showsMedia,
} = await import('../../../src/background');
type Background = import('../../../src/background').Background;

const background = (changes: Partial<Background> = {}): Background => ({...defaultBackground, ...changes});
const at = (frame: number, props: React.ComponentProps<typeof MushafBackground>) => {
  remotion.state.frame = frame;
  return render(<MushafBackground staticFile={(path) => `/static/${path}`} {...props} />).container;
};
const part = (c: HTMLElement, name: string) => c.querySelector<HTMLElement>(`[data-mushaf-background-part="${name}"]`);

beforeEach(() => remotion.reset());
afterEach(cleanup);

describe('backgroundSchema', () => {
  it('accepts its defaults, describes every field, and refuses values out of range', () => {
    expect(backgroundSchema.parse(defaultBackground)).toEqual(defaultBackground);
    for (const [name, field] of Object.entries(backgroundSchema.shape)) expect(field.description, name).toBeTruthy();
    expect(backgroundSchema.safeParse(background({blur: 41})).success).toBe(false);
    expect(backgroundSchema.safeParse(background({dim: 1.1})).success).toBe(false);
    expect(backgroundSchema.safeParse(background({kenBurnsScale: 1.31})).success).toBe(false);
    expect(backgroundSchema.safeParse(background({kenBurnsScale: 0.9})).success).toBe(false);
  });
});

describe('backgroundBaseStyle / showsMedia / mediaStyle', () => {
  it('paints the colour, and the gradient over it', () => {
    expect(backgroundBaseStyle(background({color: '#123456'}))).toEqual({backgroundColor: '#123456'});
    expect(backgroundBaseStyle(background({kind: 'image', color: '#123456'}))).toEqual({backgroundColor: '#123456'});
    expect(
      backgroundBaseStyle(background({kind: 'gradient', gradient: {from: '#000000', to: '#ffffff', angle: 135}})),
    ).toEqual({backgroundColor: '#fbf7ee', backgroundImage: 'linear-gradient(135deg, #000000, #ffffff)'});
  });

  it('shows media for an image or a video with a src only', () => {
    expect(showsMedia({kind: 'image', src: 'bg.jpg'})).toBe(true);
    expect(showsMedia({kind: 'video', src: 'https://example.test/bg.mp4'})).toBe(true);
    expect(showsMedia({kind: 'image', src: ''})).toBe(false);
    expect(showsMedia({kind: 'color', src: 'bg.jpg'})).toBe(false);
    expect(showsMedia({kind: 'gradient', src: 'bg.jpg'})).toBe(false);
  });

  it('fits the media by cover or contain', () => {
    expect(mediaStyle({fit: 'cover'})).toMatchObject({width: '100%', height: '100%', objectFit: 'cover'});
    expect(mediaStyle({fit: 'contain'})).toMatchObject({objectFit: 'contain'});
  });

  it('blurs the media box and lets it overhang the frame by twice the blur', () => {
    expect(mediaBoxStyle(background({blur: 10}), 0, 300)).toEqual({
      position: 'absolute',
      left: -20,
      top: -20,
      width: 'calc(100% + 40px)',
      height: 'calc(100% + 40px)',
      filter: 'blur(10px)',
    });
    expect(mediaBoxStyle(background(), 0, 300)).toEqual({
      position: 'absolute',
      left: -0,
      top: -0,
      width: '100%',
      height: '100%',
    });
  });
});

describe('kenBurnsTransform', () => {
  it('zooms from 1 to the scale over the whole composition', () => {
    expect(kenBurnsTransform('slow-zoom', 1.2, 0, 301)).toBe('scale(1)');
    expect(kenBurnsTransform('slow-zoom', 1.2, 150, 301)).toBe('scale(1.1)');
    expect(kenBurnsTransform('slow-zoom', 1.2, 300, 301)).toBe('scale(1.2)');
  });

  it('pans across the margin the scale gives, edge to edge', () => {
    // At 1.2 the picture overhangs by 0.2 / 2.4 of its width on each side: 8.3333%.
    expect(kenBurnsTransform('pan-left', 1.2, 0, 301)).toBe('scale(1.2) translateX(8.3333%)');
    expect(kenBurnsTransform('pan-left', 1.2, 150, 301)).toBe('scale(1.2) translateX(0%)');
    expect(kenBurnsTransform('pan-left', 1.2, 300, 301)).toBe('scale(1.2) translateX(-8.3333%)');
    expect(kenBurnsTransform('pan-right', 1.2, 0, 301)).toBe('scale(1.2) translateX(-8.3333%)');
    expect(kenBurnsTransform('pan-right', 1.2, 300, 301)).toBe('scale(1.2) translateX(8.3333%)');
  });

  it('clamps outside the composition, holds still for one frame, and is nothing for none', () => {
    expect(kenBurnsTransform('slow-zoom', 1.2, -5, 301)).toBe('scale(1)');
    expect(kenBurnsTransform('slow-zoom', 1.2, 400, 301)).toBe('scale(1.2)');
    expect(kenBurnsTransform('slow-zoom', 1.2, 0, 1)).toBe('scale(1)');
    expect(kenBurnsTransform('pan-left', 1, 150, 301)).toBe('scale(1) translateX(0%)');
    expect(kenBurnsTransform('none', 1.2, 150, 301)).toBeUndefined();
  });

  it('goes into the media box', () => {
    expect(mediaBoxStyle(background({kenBurns: 'slow-zoom', kenBurnsScale: 1.3}), 300, 301).transform).toBe(
      'scale(1.3)',
    );
  });
});

describe('glowOpacity / glowStyle', () => {
  it('rises from the resting share of the strength at silence to the strength at the loudest', () => {
    expect(glowOpacity(0, 0.8)).toBe(0.28); // GLOW_REST × 0.8
    expect(glowOpacity(0.5, 0.8)).toBe(0.54);
    expect(glowOpacity(1, 0.8)).toBe(0.8);
  });

  it('clamps the level and the strength, and reads a non-number as silence', () => {
    expect(glowOpacity(2, 0.8)).toBe(0.8);
    expect(glowOpacity(-1, 0.8)).toBe(glowOpacity(0, 0.8));
    expect(glowOpacity(Number.NaN, 1)).toBe(GLOW_REST);
    expect(glowOpacity(1, 0)).toBe(0);
  });

  it('centres the ellipse where the lines are and swells with the level', () => {
    const style = glowStyle({color: '#c8a45c', strength: 1}, 1, 0.3);
    expect(style.backgroundImage).toBe('radial-gradient(ellipse 60% 40% at 50% 30%, #c8a45c, transparent 70%)');
    expect(style.opacity).toBe(1);
    expect(style.transform).toBe('scale(1.08)');
    expect(glowStyle({color: '#c8a45c', strength: 1}, 0).transform).toBe('scale(1)');
  });
});

describe('<MushafBackground>', () => {
  it('paints only the colour for kind color', () => {
    const c = at(0, {background: background({color: '#101010'})});
    const root = c.querySelector<HTMLElement>('[data-mushaf-background]')!;
    expect(root.dataset.mushafBackground).toBe('color');
    expect(root.style.backgroundColor).toBe('rgb(16, 16, 16)');
    expect(c.querySelector('[data-media]')).toBeNull();
    expect(part(c, 'dim')).toBeNull();
    expect(part(c, 'glow')).toBeNull();
  });

  it('shows an image from public/ or a URL, fitted', () => {
    let c = at(0, {background: background({kind: 'image', src: 'bg/sky.jpg', fit: 'contain'})});
    const img = c.querySelector<HTMLElement>('[data-media="img"]')!;
    expect(img.dataset.src).toBe('/static/bg/sky.jpg');
    expect(img.style.objectFit).toBe('contain');
    cleanup();
    c = at(0, {background: background({kind: 'image', src: 'https://example.test/sky.jpg'})});
    expect(c.querySelector<HTMLElement>('[data-media="img"]')!.dataset.src).toBe('https://example.test/sky.jpg');
  });

  it('shows nothing but the colour for an image without a src', () => {
    expect(at(0, {background: background({kind: 'image', src: ''})}).querySelector('[data-media]')).toBeNull();
  });

  it('loops a muted <OffthreadVideo> over videoSeconds', () => {
    const c = at(0, {background: background({kind: 'video', src: 'bg/waves.mp4', videoSeconds: 4.5})});
    expect(c.querySelector<HTMLElement>('[data-loop-frames]')!.dataset.loopFrames).toBe('135');
    const video = c.querySelector<HTMLElement>('[data-media="offthread"]')!;
    expect(video.dataset).toMatchObject({src: '/static/bg/waves.mp4', muted: 'true'});
    expect(video.style.objectFit).toBe('cover');
  });

  it('falls back to a muted, looping <Html5Video> without videoSeconds', () => {
    const c = at(0, {background: background({kind: 'video', src: 'bg/waves.mp4'})});
    expect(c.querySelector('[data-loop-frames]')).toBeNull();
    expect(c.querySelector<HTMLElement>('[data-media="html5"]')!.dataset).toMatchObject({muted: 'true', loop: 'true'});
  });

  it('moves the media box with the frame', () => {
    const changes = background({kind: 'image', src: 'a.jpg', kenBurns: 'slow-zoom', kenBurnsScale: 1.2});
    remotion.state.durationInFrames = 301;
    expect(part(at(0, {background: changes}), 'media')!.style.transform).toBe('scale(1)');
    cleanup();
    expect(part(at(150, {background: changes}), 'media')!.style.transform).toBe('scale(1.1)');
    cleanup();
    expect(part(at(300, {background: changes}), 'media')!.style.transform).toBe('scale(1.2)');
  });

  it('dims with a black layer at the dim opacity, over any kind', () => {
    const c = at(0, {background: background({kind: 'gradient', dim: 0.4})});
    expect(part(c, 'dim')!.style.opacity).toBe('0.4');
    expect(part(c, 'dim')!.style.backgroundColor).toBe('rgb(0, 0, 0)');
  });

  it('shows the glow when enabled, its opacity from the audio level', () => {
    const glow = {enabled: true, color: '#c8a45c', strength: 0.8};
    expect(part(at(0, {background: background({glow})}), 'glow')!.style.opacity).toBe('0.28');
    cleanup();
    expect(part(at(0, {background: background({glow}), audioLevel: 1}), 'glow')!.style.opacity).toBe('0.8');
    cleanup();
    expect(part(at(0, {background: background({glow: {...glow, strength: 0}})}), 'glow')).toBeNull();
  });
});
