import {applyLook, defaultMushafRecitationProps, lookById} from '@tlawat/mushaf-studio';
import {describe, expect, it} from 'vitest';
import {
  ASSET_PATHS,
  bundleArgs,
  caseById,
  casePropsFor,
  DESIGN_CASES,
  DesignUsageError,
  deepMerge,
  durationFrom,
  needsDuration,
  parseDesignArgs,
  pausedTimings,
  referenceFor,
  SAMPLE_PAUSE,
  STYLE_GROUPS,
  selectCases,
  stillArgs,
  stillFile,
  stripArgs,
  stripDir,
} from './design-cases';

describe('the cases of 12.2', () => {
  it('covers V1 to V20, each id once', () => {
    const ids = DESIGN_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let n = 1; n <= 20; n++) expect(ids.some((id) => id === `V${n}` || id.startsWith(`V${n}-`))).toBe(true);
    // The slow re-runs of 12.2 (V10's look, Haram night, is slow already).
    expect(ids).toEqual(expect.arrayContaining(['V3-slow', 'V4-slow']));
    expect(lookById('haram-night')?.patch.animation?.tempo).toBe('slow');
  });

  it('names every look it renders, and every reference serves a case', () => {
    for (const c of DESIGN_CASES) {
      expect(lookById(c.look), c.id).not.toBeNull();
      if (c.referenceOf !== undefined) expect(caseById(c.referenceOf), c.id).not.toBeNull();
    }
    expect(referenceFor(caseById('V10') as never)?.id).toBe('V10-ref');
    expect(referenceFor(caseById('V1') as never)).toBeNull();
  });

  it('writes whole style groups only: the look, the format, then the overrides', () => {
    const v1 = casePropsFor(caseById('V1') as never);
    expect(Object.keys(v1).every((k) => (STYLE_GROUPS as readonly string[]).includes(k))).toBe(true);
    expect(v1).not.toHaveProperty('audioFile');
    const mushaf = applyLook(defaultMushafRecitationProps, lookById('mushaf') as never);
    expect(v1.layout).toEqual(mushaf.layout);
    expect(v1.highlight).toEqual(defaultMushafRecitationProps.highlight);

    const v4 = casePropsFor(caseById('V4-slow') as never) as {
      layout: {visibleLines: number};
      animation: {tempo: string};
    };
    expect(v4.layout.visibleLines).toBe(0);
    expect(v4.animation.tempo).toBe('slow');

    const vertical = casePropsFor(caseById('V10-vertical') as never) as {layout: {aspect: string; marginX: number}};
    expect(vertical.layout).toMatchObject({aspect: '9:16', marginX: 90});

    const v14 = casePropsFor(caseById('V14') as never) as {text: {translationFile: string; translationSize: number}};
    expect(v14.text.translationFile).toBe(ASSET_PATHS.translation);
    expect(v14.text.translationSize).toBe(36);
  });

  it('writes only the groups a composition has', () => {
    const page = casePropsFor(caseById('V18') as never);
    expect(page).toHaveProperty('pageView');
    expect(page).not.toHaveProperty('animation');
    const ayah = casePropsFor(caseById('V20') as never);
    expect(ayah).not.toHaveProperty('theme');
    expect(ayah).toHaveProperty('highlight', expect.objectContaining({mode: 'word', style: 'wash'}));
  });

  it('writes the content a case sets beside its style groups, and only the groups its composition has', () => {
    const slow = casePropsFor(caseById('V4-slow') as never);
    expect(slow).toMatchObject({timingsFile: ASSET_PATHS.paused});
    expect(caseById('V4-slow')?.assets).toContain('paused');
    expect(casePropsFor(caseById('V4') as never)).not.toHaveProperty('timingsFile');
    const header = casePropsFor(caseById('V6-header-haram-night') as never);
    expect(header).toMatchObject({surah: 1, fromAyah: 1, header: 'name', layout: {background: '#121416'}});
    expect(header).not.toHaveProperty('highlight');
    expect(caseById('V6-header-mushaf')?.composition).toBe('MushafPassage');
  });

  it('renders the black palette on a dark ground (V9), and measures V14 against a 26 px ruler at 16:9', () => {
    for (const id of ['V9', 'V9-ref']) {
      const props = casePropsFor(caseById(id) as never) as {theme: string; layout: {background: string}};
      expect([props.theme, props.layout.background], id).toEqual(['black', '#121416']);
    }
    expect(casePropsFor(caseById('V9') as never)).toMatchObject({highlight: {mode: 'word', style: 'tint'}});
    for (const id of ['V14', 'V14-vertical']) {
      const ruler = caseById(`${id}-ref`);
      expect(ruler?.referenceOf).toBe(id);
      expect(ruler?.format).toBe('landscape');
      expect(casePropsFor(ruler as never)).toMatchObject({text: {translationSize: 26}});
    }
  });

  it('puts a pause after an ayah, moving every later ayah and its words and nothing before', () => {
    const timings = {
      version: 1,
      durationSeconds: 10,
      ayat: [
        {ayah: 2, start: 0.3, end: 3.5, words: [{id: '1:2:1', start: 0.3, end: 3.5}]},
        {ayah: 3, start: 3.5, end: 6, complete: true, words: [{id: '1:3:1', start: 3.5, end: 6}]},
      ],
    };
    const paused = pausedTimings(timings, SAMPLE_PAUSE);
    expect(paused.version).toBe(1);
    expect(paused.durationSeconds).toBe(11);
    expect(paused.ayat[0]).toEqual(timings.ayat[0]);
    expect(paused.ayat[1]).toEqual({
      ayah: 3,
      start: 4.5,
      end: 7,
      complete: true,
      words: [{id: '1:3:1', start: 4.5, end: 7}],
    });
    expect(timings.ayat[1]?.start).toBe(3.5);
  });

  it('refuses a look that does not exist', () => {
    const bad = {...(caseById('V1') as never as object), look: 'karaoke-neon'};
    expect(() => casePropsFor(bad as never)).toThrow(/no look/);
  });

  it('merges objects key by key and replaces the rest', () => {
    expect(deepMerge({a: {b: 1, c: 2}, d: [1]}, {a: {c: 3}, d: [2]})).toEqual({a: {b: 1, c: 3}, d: [2]});
  });
});

describe('the command line', () => {
  it('has defaults, and passes what follows -- to remotion', () => {
    expect(parseDesignArgs([])).toEqual({
      out: 'out/design',
      round: 'round-1',
      only: [],
      translation: null,
      reuseBundle: false,
      check: true,
      jobs: 2,
      extra: [],
    });
    const options = parseDesignArgs([
      '--round',
      'r4',
      '--only',
      'V1,V10',
      '--jobs',
      '3',
      '--',
      '--browser-executable=/c',
    ]);
    expect(options).toMatchObject({round: 'r4', only: ['V1', 'V10'], jobs: 3, extra: ['--browser-executable=/c']});
    expect(parseDesignArgs(['-h'])).toBe('help');
  });

  it('refuses an unknown option, a missing value, a bad round, an unknown case', () => {
    expect(() => parseDesignArgs(['--frames'])).toThrow(DesignUsageError);
    expect(() => parseDesignArgs(['--round'])).toThrow(/needs a value/);
    expect(() => parseDesignArgs(['--round', '../x'])).toThrow(DesignUsageError);
    expect(() => parseDesignArgs(['--jobs', '0'])).toThrow(DesignUsageError);
    expect(() => parseDesignArgs(['--only', 'V99'])).toThrow(/no such case: V99/);
  });

  it('selects the cases asked for with their references', () => {
    expect(selectCases(['V10']).map((c) => c.id)).toEqual(['V10', 'V10-ref']);
    expect(selectCases([])).toHaveLength(DESIGN_CASES.length);
  });

  it('builds the remotion commands of 12.2', () => {
    const v1 = caseById('V1') as never;
    expect(stillArgs('b', v1, 'out/V1-f060.png', 60, 'V1.json', ['--x'])).toEqual([
      'remotion',
      'still',
      'b',
      'MushafRecitation',
      'out/V1-f060.png',
      '--frame=60',
      '--props=V1.json',
      '--scale=0.5',
      '--log=error',
      '--x',
    ]);
    expect(stripArgs('b', v1, 'd', 96, 140, 'p.json', [])).toEqual(
      expect.arrayContaining(['render', '--sequence', '--image-format=png', '--frames=96-140']),
    );
    // The bundle takes no browser.
    expect(bundleArgs('src/index.ts', 'b', 'p', ['--browser-executable=/c'])).not.toContain('--browser-executable=/c');
    expect(stillFile('V1', 6)).toBe('V1-f006.png');
    expect(stripDir('V3')).toBe('V3-strip');
  });

  it('reads the duration remotion compositions prints', () => {
    const output = `The following compositions are available:

MushafRecitation    30      1920x1080      1018 (33.93 sec)
MushafPage          30      1920x1080      881 (29.37 sec)
MushafThumbnail             1280x720       Still`;
    expect(durationFrom(output, 'MushafRecitation')).toBe(1018);
    expect(durationFrom(output, 'MushafPage')).toBe(881);
    expect(durationFrom(output, 'MushafAyahText')).toBeNull();
    expect(needsDuration(caseById('V19') as never)).toBe(true);
    expect(needsDuration(caseById('V2') as never)).toBe(false);
  });
});
