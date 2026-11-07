// @vitest-environment jsdom
// The background under jsdom with `remotion` mocked: the style of each kind and fit, the slow zoom
// over the composition, the dim layer, no glow (nothing follows the audio), and the video's loop.
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
  dimLayer,
  Jadwal,
  jadwalOpacity,
  jadwalRules,
  kenBurnsTransform,
  MushafBackground,
  mediaBoxStyle,
  mediaStyle,
  NOISE_OPACITY,
  showsMedia,
  vignetteRgb,
  vignetteStyle,
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
    expect(backgroundSchema.safeParse(background({kenBurnsScale: 1.06})).success).toBe(false);
    expect(backgroundSchema.safeParse(background({kenBurnsScale: 0.9})).success).toBe(false);
    expect(backgroundSchema.safeParse(background({vignette: 0.42})).success).toBe(false);
    // The removed values are refused: migrateMushafProps() maps them.
    expect(backgroundSchema.safeParse({...defaultBackground, kenBurns: 'pan-left'}).success).toBe(false);
    expect('glow' in backgroundSchema.shape).toBe(false);
  });
});

describe('backgroundBaseStyle / showsMedia / mediaStyle', () => {
  it('paints the colour, and the gradient over it', () => {
    expect(backgroundBaseStyle(background({color: '#123456'}))).toEqual({backgroundColor: '#123456'});
    expect(backgroundBaseStyle(background({kind: 'image', color: '#123456'}))).toEqual({backgroundColor: '#123456'});
    expect(
      backgroundBaseStyle(background({kind: 'gradient', gradient: {from: '#000000', to: '#ffffff', angle: 135}})),
    ).toEqual({backgroundColor: '#f8f3e6', backgroundImage: 'linear-gradient(135deg, #000000, #ffffff)'});
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

  it('eases the zoom on SINE: slow at the start and the end, never past the scale', () => {
    // A quarter of the way in, the eased zoom is behind a linear one; three quarters in, ahead of it.
    const quarter = Number(/scale\(([\d.]+)\)/.exec(kenBurnsTransform('slow-zoom', 1.04, 75, 301)!)![1]);
    const threeQuarters = Number(/scale\(([\d.]+)\)/.exec(kenBurnsTransform('slow-zoom', 1.04, 225, 301)!)![1]);
    expect(quarter).toBeLessThan(1.01);
    expect(quarter).toBeGreaterThan(1);
    expect(threeQuarters).toBeGreaterThan(1.03);
    expect(threeQuarters).toBeLessThan(1.04);
    for (let f = 0; f <= 300; f += 10) {
      const scale = Number(/scale\(([\d.]+)\)/.exec(kenBurnsTransform('slow-zoom', 1.05, f, 301)!)![1]);
      expect(scale).toBeLessThanOrEqual(1.05);
    }
  });

  it('clamps outside the composition, holds still for one frame, and is nothing for none', () => {
    expect(kenBurnsTransform('slow-zoom', 1.2, -5, 301)).toBe('scale(1)');
    expect(kenBurnsTransform('slow-zoom', 1.2, 400, 301)).toBe('scale(1.2)');
    expect(kenBurnsTransform('slow-zoom', 1.2, 0, 1)).toBe('scale(1)');
    expect(kenBurnsTransform('none', 1.2, 150, 301)).toBeUndefined();
  });

  it('goes into the media box', () => {
    expect(mediaBoxStyle(background({kenBurns: 'slow-zoom', kenBurnsScale: 1.3}), 300, 301).transform).toBe(
      'scale(1.3)',
    );
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

  it('keeps an image or a video dimmed to its floor: black under light ink, a page veil under dark ink', () => {
    const image = background({kind: 'image', src: 'sky.jpg'});
    expect(dimLayer(image, {background: '#121416', color: '#f1eadb'})).toEqual({color: '#000', opacity: 0.45});
    expect(dimLayer({...image, dim: 0.6}, {background: '#121416', color: '#f1eadb'})).toEqual({
      color: '#000',
      opacity: 0.6,
    });
    expect(dimLayer(image, {background: '#f8f3e6', color: '#1c1a16'})).toEqual({color: '#f8f3e6', opacity: 0.55});
    // A colour or a gradient takes dim as set; without layout, so does an image.
    expect(dimLayer(background({kind: 'gradient'}), {background: '#121416', color: '#f1eadb'})).toBeNull();
    expect(dimLayer(background({kind: 'gradient', dim: 0.2}), {background: '#121416', color: '#f1eadb'})).toEqual({
      color: '#000',
      opacity: 0.2,
    });
    expect(dimLayer(image)).toBeNull();
    // An image without a src shows none: the colour is the page, dimmed as set.
    expect(dimLayer(background({kind: 'image', src: ''}), {background: '#121416', color: '#f1eadb'})).toBeNull();
  });

  it('draws the floor over a media background when the layout is given', () => {
    const c = at(0, {
      background: background({kind: 'video', src: 'bg/waves.mp4'}),
      layout: {background: '#f8f3e6', color: '#1c1a16'},
    });
    expect(part(c, 'dim')!.style.opacity).toBe('0.55');
    expect(part(c, 'dim')!.style.backgroundColor).toBe('rgb(248, 243, 230)');
  });

  it('dims with a black layer at the dim opacity, over any kind', () => {
    const c = at(0, {background: background({kind: 'gradient', dim: 0.4})});
    expect(part(c, 'dim')!.style.opacity).toBe('0.4');
    expect(part(c, 'dim')!.style.backgroundColor).toBe('rgb(0, 0, 0)');
  });

  it('draws no glow, even for props that still carry one', () => {
    const legacy = {...background(), glow: {enabled: true, color: '#c8a45c', strength: 0.8}} as Background;
    expect(part(at(0, {background: legacy}), 'glow')).toBeNull();
  });
});

describe('vignette', () => {
  it('darkens toward black on a dark ground and toward a deeper shade of the page on a light one', () => {
    expect(vignetteRgb('#121416')).toBe('0, 0, 0');
    const [r, g, b] = vignetteRgb('#f8f3e6').split(', ').map(Number) as [number, number, number];
    // Warm: red over blue, as the ivory is, and clearly darker than it.
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
    expect(r).toBeLessThan(0xf8 - 20);
    expect(r).toBeGreaterThan(0xf8 - 60);
  });

  it('is a radial gradient clear over the middle, nothing at 0', () => {
    expect(vignetteStyle(0.22, '#121416')).toEqual({
      backgroundImage: 'radial-gradient(ellipse 120% 100% at 50% 48%, transparent 55%, rgba(0, 0, 0, 0.22) 100%)',
    });
    expect(vignetteStyle(0, '#121416')).toBeNull();
  });

  it('draws the vignette and its fixed noise over the background, and neither without a vignette', () => {
    const layout = {background: '#121416', color: '#f1eadb'};
    let c = at(0, {background: background({vignette: 0.2}), layout});
    expect(part(c, 'vignette')!.style.backgroundImage).toContain('rgba(0, 0, 0, 0.2)');
    const noise = part(c, 'noise')!;
    expect(noise.style.opacity).toBe(String(NOISE_OPACITY));
    const turbulence = noise.querySelector('feTurbulence')!;
    expect([
      turbulence.getAttribute('baseFrequency'),
      turbulence.getAttribute('numOctaves'),
      turbulence.getAttribute('seed'),
    ]).toEqual(['0.9', '1', '7']);
    // The rect points at its own filter.
    const id = noise.querySelector('filter')!.id;
    expect(noise.querySelector('rect')!.getAttribute('filter')).toBe(`url(#${id})`);
    expect(id).toMatch(/^[\w-]+$/);
    cleanup();
    c = at(0, {background: background(), layout});
    expect(part(c, 'vignette')).toBeNull();
    expect(part(c, 'noise')).toBeNull();
  });
});

describe('jadwal', () => {
  it('puts the outer rule at the safe area, 2 u thick, and the inner one 6 u inside it, 1 u thick', () => {
    expect(jadwalRules(1920, 1080)).toEqual({outer: {inset: 54, width: 2}, inner: {inset: 62, width: 1}});
    expect(jadwalRules(1080, 1920)).toEqual({outer: {inset: 54, width: 2}, inner: {inset: 62, width: 1}});
    expect(jadwalRules(3840, 2160)).toEqual({outer: {inset: 108, width: 4}, inner: {inset: 124, width: 2}});
  });

  it('is 0.55 on a light ground and 0.45 on a dark one, in the metal', () => {
    expect(jadwalOpacity('#f8f3e6')).toBe(0.55);
    expect(jadwalOpacity('#10241b')).toBe(0.45);
    remotion.state.width = 1920;
    remotion.state.height = 1080;
    const c = render(<Jadwal metal="#cfae63" ground="#10241b" />).container;
    const root = c.querySelector<HTMLElement>('[data-mushaf-jadwal]')!;
    expect(root.style.opacity).toBe('0.45');
    const outer = c.querySelector<HTMLElement>('[data-mushaf-jadwal-rule="outer"]')!;
    const inner = c.querySelector<HTMLElement>('[data-mushaf-jadwal-rule="inner"]')!;
    expect([outer.style.left, outer.style.top, outer.style.border]).toEqual([
      '54px',
      '54px',
      '2px solid rgb(207, 174, 99)',
    ]);
    expect([inner.style.right, inner.style.bottom, inner.style.border]).toEqual([
      '62px',
      '62px',
      '1px solid rgb(207, 174, 99)',
    ]);
  });
});
