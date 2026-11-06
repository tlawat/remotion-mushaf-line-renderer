// @vitest-environment jsdom
// The slot components: the box's <Sequence>, the composition inside it with its own panel off, and
// the panel beside it with the slot's key, kind and start. `remotion`, the compositions and the
// panel are mocked to record what they are given.
import {cleanup, render} from '@testing-library/react';
import type * as React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const env = vi.hoisted(() => ({
  isStudio: true,
  isRendering: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
}));
const seen = vi.hoisted(() => ({
  sequences: [] as Record<string, unknown>[],
  compositions: [] as {kind: string; props: Record<string, unknown>}[],
  panels: [] as Record<string, unknown>[],
  start: 0,
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  getRemotionEnvironment: () => env,
  useRemotionEnvironment: () => env,
  useVideoConfig: () => ({width: 1080, height: 1920, fps: 30, durationInFrames: 900, id: 'MyTemplate'}),
  Sequence: ({children, ...props}: {children?: React.ReactNode}) => {
    seen.sequences.push(props);
    return <div data-sequence={(props as {name?: string}).name}>{children}</div>;
  },
}));
vi.mock('../../../src/studio/remotion-internals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/studio/remotion-internals')>()),
  useOwnSequenceStart: () => seen.start,
}));
const composition = (kind: string) => (props: Record<string, unknown>) => {
  seen.compositions.push({kind, props});
  return <div data-composition={kind} />;
};
vi.mock('../../../src/compositions/recitation/MushafRecitation', () => ({MushafRecitation: composition('recitation')}));
vi.mock('../../../src/unicode/MushafAyahText', () => ({MushafAyahText: composition('ayah-text')}));
vi.mock('../../../src/page/MushafPage', () => ({MushafPage: composition('page')}));
vi.mock('../../../src/studio', () => ({
  MushafStudioPanel: (props: Record<string, unknown>) => {
    seen.panels.push(props);
    return <div data-panel={String(props.propsKey)} />;
  },
  isInStudio: () => env.isStudio,
}));

const {MushafAyahTextSlot, MushafPageSlot, MushafRecitationSlot, defaultMushafRecitationSlotProps} = await import(
  '../../../src/slots'
);
const {defaultMushafAyahTextSlotProps, defaultMushafPageSlotProps} = await import('../../../src/slots/schema');
type MushafRecitationProps = import('../../../src/compositions/recitation').MushafRecitationProps;

const resolvedProps = (durationInFrames: number): MushafRecitationProps => ({
  ...defaultMushafRecitationSlotProps,
  resolved: {timings: {version: 1, surah: 1, ayat: []}, durationInFrames},
});

beforeEach(() => {
  env.isStudio = true;
  seen.sequences = [];
  seen.compositions = [];
  seen.panels = [];
  seen.start = 0;
});
afterEach(cleanup);

describe('<MushafRecitationSlot>', () => {
  it('renders the composition in a box Sequence sized by its resolver, its own panel off', () => {
    const props = resolvedProps(240);
    render(
      <MushafRecitationSlot
        props={props}
        propsKey="mushaf"
        from={45}
        left={60}
        top={640}
        width={960}
        height={640}
        premountFor={30}
        style={{borderRadius: 32}}
      />,
    );
    expect(seen.sequences).toHaveLength(1);
    expect(seen.sequences[0]).toMatchObject({
      from: 45,
      durationInFrames: 240,
      width: 960,
      height: 640,
      premountFor: 30,
      name: 'Mushaf recitation',
      style: {borderRadius: 32, left: 60, top: 640},
    });
    expect(seen.compositions).toHaveLength(1);
    expect(seen.compositions[0]!.kind).toBe('recitation');
    expect(seen.compositions[0]!.props).toMatchObject({panel: false, audioFile: props.audioFile});
  });

  it('docks the panel beside the Sequence with the key, the kind and the slot’s start in the Studio', () => {
    seen.start = 100;
    const {container} = render(<MushafRecitationSlot props={resolvedProps(240)} propsKey="mushaf" from={45} />);
    // Beside, not inside: the panel is not a child of the box.
    expect(container.querySelector('[data-sequence] [data-panel]')).toBeNull();
    expect(container.querySelector('[data-panel="mushaf"]')).not.toBeNull();
    expect(seen.panels[0]).toMatchObject({
      compositionId: 'MyTemplate',
      propsKey: 'mushaf',
      kind: 'recitation',
      frameOffset: 145,
    });
    // An explicit length wins over the resolver's, and the box is the template's without a size.
    seen.sequences = [];
    render(<MushafRecitationSlot props={resolvedProps(240)} propsKey="mushaf" durationInFrames={90} />);
    expect(seen.sequences[0]).toMatchObject({from: 0, durationInFrames: 90, width: 1080, height: 1920});
  });

  it('shows nothing in the box for null props, and the panel with null props and the kind', () => {
    render(<MushafRecitationSlot props={null} propsKey="mushaf" from={45} />);
    expect(seen.sequences).toHaveLength(0);
    expect(seen.compositions).toHaveLength(0);
    expect(seen.panels[0]).toMatchObject({props: null, kind: 'recitation', propsKey: 'mushaf'});
  });

  it('shows nothing in the box for props with nothing resolved (0 frames)', () => {
    render(<MushafRecitationSlot props={{...defaultMushafRecitationSlotProps, resolved: null}} propsKey="mushaf" />);
    expect(seen.sequences).toHaveLength(0);
    render(<MushafRecitationSlot props={resolvedProps(0)} propsKey="mushaf" />);
    expect(seen.sequences).toHaveLength(0);
  });

  it('renders no panel outside the Studio, or with panel={false}', () => {
    render(<MushafRecitationSlot props={resolvedProps(240)} propsKey="mushaf" panel={false} />);
    expect(seen.panels).toHaveLength(0);
    env.isStudio = false;
    render(<MushafRecitationSlot props={resolvedProps(240)} propsKey="mushaf" />);
    expect(seen.panels).toHaveLength(0);
    expect(seen.compositions).toHaveLength(2);
  });

  it('keeps an unresolved slot quiet in the Studio and refuses it anywhere else', () => {
    const failed = {
      ...defaultMushafRecitationSlotProps,
      resolved: {error: 'timingsFile is missing', durationInFrames: 0},
    };
    render(<MushafRecitationSlot props={failed} propsKey="mushaf" />);
    expect(seen.sequences).toHaveLength(0);
    expect(seen.panels).toHaveLength(1);
    env.isStudio = false;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<MushafRecitationSlot props={failed} propsKey="mushaf" />)).toThrow(
        /mushaf: timingsFile is missing/,
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe('<MushafAyahTextSlot> and <MushafPageSlot>', () => {
  it('render their own composition and tell the panel their kind', () => {
    const timings = {version: 1, surah: 1, ayat: []};
    render(
      <MushafAyahTextSlot
        props={{...defaultMushafAyahTextSlotProps, resolved: {timings, durationInFrames: 60}}}
        propsKey="ayah"
      />,
    );
    render(
      <MushafPageSlot
        props={{...defaultMushafPageSlotProps, resolved: {timings, durationInFrames: 60}}}
        propsKey="page"
      />,
    );
    expect(seen.compositions.map((c) => [c.kind, c.props.panel])).toEqual([
      ['ayah-text', false],
      ['page', false],
    ]);
    expect(seen.sequences.map((s) => s.name)).toEqual(['Mushaf ayah text', 'Mushaf page']);
    expect(seen.panels.map((p) => p.kind)).toEqual(['ayah-text', 'page']);
  });
});
