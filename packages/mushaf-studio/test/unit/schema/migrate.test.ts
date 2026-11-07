// The migration of saved props (render-design.md, section 7): the old Root defaults of every
// composition and every old look, as the Studio saved them before the render design, come out in
// the current shape; a still-valid value is never replaced; the migration is idempotent; a group
// sent in part is filled; props in the current shape pass through as they are.
import {describe, expect, it, vi} from 'vitest';
import {defaultMushafPassageProps, mushafPassageSchema} from '../../../src/compositions/passage';
import {defaultMushafRecitationProps, mushafRecitationSchema} from '../../../src/compositions/recitation';
import {defaultMushafThumbnailProps, mushafThumbnailSchema} from '../../../src/export';
import {defaultMushafPageProps, mushafPageSchema} from '../../../src/page/schema';
import {applyLook, LEGACY_LOOK_IDS, lookById} from '../../../src/presets';
import {
  defaultAnimation,
  defaultHighlight,
  defaultLayout,
  describeMushafMigration,
  MIGRATION_REASONS,
  migrateMushafProps,
  migrationReasonText,
  mushafPropsNeedMigration,
} from '../../../src/schema';
import {
  defaultMushafAyahTextSlotProps,
  defaultMushafPageSlotProps,
  defaultMushafRecitationSlotProps,
  mushafRecitationSlotSchema,
} from '../../../src/slots';
import {defaultMushafAyahTextProps, mushafAyahTextSchema} from '../../../src/unicode';
import migratedRoot from '../../fixtures/migrate/migrated-root-defaults.json';
import oldLooks from '../../fixtures/migrate/old-looks.json';
import oldRoot from '../../fixtures/migrate/old-root-defaults.json';

type Plain = Record<string, unknown>;

const COMPOSITIONS = {
  MushafRecitation: {defaults: defaultMushafRecitationProps, schema: mushafRecitationSchema},
  MushafPassage: {defaults: defaultMushafPassageProps, schema: mushafPassageSchema},
  MushafAyahText: {defaults: defaultMushafAyahTextProps, schema: mushafAyahTextSchema},
  MushafPage: {defaults: defaultMushafPageProps, schema: mushafPageSchema},
  MushafThumbnail: {defaults: defaultMushafThumbnailProps, schema: mushafThumbnailSchema},
} as const;

const migrate = (props: unknown, defaults?: Plain): Plain =>
  migrateMushafProps<Plain>(props, defaults === undefined ? {} : {defaults});

/** The template's own props as they are, its slot (`mushaf`) migrated as its resolver migrates it. */
const migrateTemplate = (props: Plain): Plain => ({
  ...props,
  mushaf: migrate(props.mushaf, defaultMushafRecitationSlotProps),
});

const old = oldRoot as unknown as Readonly<Record<string, Plain>>;

/** `patch` merged into `props` group by group, as `applyLook()` merges a look. */
const merged = (props: Plain, patch: Plain): Plain => {
  const out: Plain = {...props};
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] =
      typeof current === 'object' && current !== null && typeof value === 'object' && value !== null
        ? merged(current as Plain, value as Plain)
        : value;
  }
  return out;
};

describe('migrateMushafProps: the old Root defaults', () => {
  it.each(Object.keys(COMPOSITIONS) as (keyof typeof COMPOSITIONS)[])(
    'turns the old %s into the golden fixture, which its schema accepts as it is',
    (id) => {
      const {defaults, schema} = COMPOSITIONS[id];
      const migrated = migrate(old[id], defaults as unknown as Plain);
      expect(migrated).toEqual((migratedRoot as Record<string, unknown>)[id]);
      expect(schema.parse(migrated)).toEqual(migrated);
    },
  );

  it('turns the old template’s slot into the golden fixture, the template’s own props untouched', () => {
    const migrated = migrateTemplate(old.MushafInTemplate!);
    expect(migrated).toEqual(migratedRoot.MushafInTemplate);
    expect(mushafRecitationSlotSchema.parse(migrated.mushaf)).toEqual(migrated.mushaf);
    const {mushaf: _mushaf, ...own} = migrated;
    const {mushaf: _old, ...before} = old.MushafInTemplate!;
    expect(own).toEqual(before);
  });

  it('maps every removed option to its nearest equivalent and keeps every value still valid', () => {
    const recitation = migrate(old.MushafRecitation, defaultMushafRecitationProps as unknown as Plain);
    expect(recitation.highlight).toEqual({
      mode: 'word',
      style: 'tint',
      color: '#c8a45c',
      occurrence: 'first',
      restOpacity: 0.6,
    });
    expect(recitation.animation).toEqual({leadInSeconds: 0.4, lines: 'rise', tempo: 'calm'});
    // Still valid, so still theirs: the old theme, page, margins and neighbours.
    expect(recitation.theme).toBe('plain');
    expect(recitation.layout).toMatchObject({
      marginX: 120,
      neighbourOpacity: 0.45,
      background: '#fbf7ee',
      frame: 'none',
    });
    expect(recitation.background).not.toHaveProperty('glow');
    expect(recitation.background).toMatchObject({vignette: 0, kenBurnsScale: 1.05});
    expect(recitation.text).toMatchObject({translationFont: 'auto', glossFont: 'auto', translationSize: 40});
    expect(recitation.overlay).toMatchObject({font: 'auto', introSeconds: 3, cornerSize: 28});
    const page = migrate(old.MushafPage, defaultMushafPageProps as unknown as Plain);
    expect(page.pageView).toEqual({
      lineHighlight: 'band',
      lineHighlightColor: 'rgba(200,164,92,0.18)',
      dimOtherLines: 1,
      frame: 'simple',
      pageNumber: true,
      turn: 'fade',
      turnSeconds: 0.6,
    });
    // The thumbnail's background is its page colour, not the group: left as it is.
    expect(migrate(old.MushafThumbnail, defaultMushafThumbnailProps as unknown as Plain)).toBe(old.MushafThumbnail);
  });

  it('is idempotent on every fixture', () => {
    for (const [id, props] of Object.entries(old)) {
      const once = id === 'MushafInTemplate' ? migrateTemplate(props) : migrate(props);
      const twice = id === 'MushafInTemplate' ? migrateTemplate(once) : migrate(once);
      expect([id, twice]).toEqual([id, once]);
      expect(mushafPropsNeedMigration(id === 'MushafInTemplate' ? once.mushaf : once)).toBe(false);
    }
  });
});

describe('migrateMushafProps: the old looks', () => {
  // What each old look's mark and motion become (render-design.md 7.2).
  const expected: Readonly<
    Record<string, {readonly highlight?: Plain; readonly animation?: Plain; readonly layout?: Plain}>
  > = {
    classic: {highlight: {style: 'tint', color: '#c8a45c', restOpacity: 0.6}, animation: {lines: 'rise'}},
    'tajweed-light': {highlight: {style: 'ink', restOpacity: 0.5}, layout: {background: '#ffffff'}},
    night: {highlight: {style: 'tint', color: '#f2c66d', restOpacity: 0.6}},
    'black-gold': {highlight: {style: 'tint', color: '#d4af37'}},
    sepia: {highlight: {style: 'wash', color: '#c8964a'}},
    reel: {animation: {lines: 'fade'}, layout: {aspect: '9:16', visibleLines: 0}},
    square: {layout: {aspect: '1:1', neighbourOpacity: 0.35}},
    karaoke: {highlight: {style: 'wash', color: '#b8913a', restOpacity: 0.6}, animation: {lines: 'fade'}},
    study: {highlight: {style: 'tint', color: '#1f7a8c'}, layout: {neighbourOpacity: 0.5}},
  };

  it('has a fixture and an expectation for every old look', () => {
    expect(Object.keys(oldLooks).sort()).toEqual(Object.keys(expected).sort());
  });

  it.each(Object.keys(expected))('maps %s applied to the old Root as the design says', (id) => {
    const patch = (oldLooks as Record<string, Plain>)[id]!;
    const applied = merged(old.MushafRecitation!, patch);
    const migrated = migrate(applied, defaultMushafRecitationProps as unknown as Plain);
    const want = expected[id]!;
    if (want.highlight) expect(migrated.highlight).toMatchObject(want.highlight);
    if (want.animation) expect(migrated.animation).toMatchObject(want.animation);
    if (want.layout) expect(migrated.layout).toMatchObject(want.layout);
    expect(mushafRecitationSchema.parse(migrated)).toEqual(migrated);
    expect(migrate(migrated)).toEqual(migrated);
  });

  it.each(Object.keys(expected))(
    'names %s by the look (or format) that replaced it, which applies to the migrated Root',
    (id) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const look = lookById(id)!;
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
      expect(look.id).toBe(LEGACY_LOOK_IDS[id]);
      const fromNew = applyLook(migrate(old.MushafRecitation), look);
      expect(mushafRecitationSchema.parse(fromNew)).toEqual(fromNew);
      expect(migrate(fromNew)).toEqual(fromNew);
    },
  );
});

describe('migrateMushafProps: the rules', () => {
  const highlight = (group: Plain) => migrate({highlight: group}).highlight as Plain;
  const animation = (group: Plain) => migrate({animation: group}).animation as Plain;

  it('turns dimming into the ink mark, the colours into a tint, the marker into a wash, none into no mode', () => {
    expect(highlight({mode: 'word', style: 'color', dimOthers: 0.33, dimUpcomingOnly: true})).toMatchObject({
      style: 'ink',
      restOpacity: 0.5,
    });
    expect(highlight({style: 'none', dimOthers: 0.72})).toMatchObject({mode: 'word', style: 'ink', restOpacity: 0.7});
    expect(highlight({style: 'none', dimOthers: 0.95})).toMatchObject({style: 'ink', restOpacity: 0.85});
    expect(highlight({style: 'none', dimOthers: 1})).toMatchObject({mode: 'none', style: 'ink', restOpacity: 0.6});
    expect(highlight({style: 'glow', dimOthers: 0.4})).toMatchObject({style: 'tint', restOpacity: 0.6});
    expect(highlight({style: 'marker', color: '#FFD166', dimOthers: 0.35})).toMatchObject({
      style: 'wash',
      color: '#b8913a',
      restOpacity: 0.6,
    });
    for (const style of ['color', 'glow', 'marker', 'none'])
      expect(highlight({style, dimOthers: 0.5, dimUpcomingOnly: false})).not.toHaveProperty('dimOthers');
  });

  it('keeps a colour that is not the Karaoke yellow, and a #ffd166 chosen in the new shape', () => {
    expect(highlight({style: 'color', color: '#123456'}).color).toBe('#123456');
    expect(highlight({...defaultHighlight, style: 'tint', color: '#ffd166'}).color).toBe('#ffd166');
  });

  it('turns enter (or exit when enter is none) into lines, and drops the scroll curve', () => {
    expect(animation({enter: 'slide-fade', exit: 'none', leadInSeconds: 0.4, scroll: 'spring'})).toEqual({
      lines: 'rise',
      tempo: 'calm',
      leadInSeconds: 0.4,
    });
    expect(animation({enter: 'fade', exit: 'slide-fade'}).lines).toBe('fade');
    expect(animation({enter: 'reveal-rtl', exit: 'fade'}).lines).toBe('fade');
    expect(animation({enter: 'none', exit: 'slide-fade'}).lines).toBe('rise');
    expect(animation({enter: 'none', exit: 'none'}).lines).toBe('cut');
    expect(animation({enter: 'fade', exit: 'fade', leadInSeconds: 3}).leadInSeconds).toBe(2);
  });

  it('clamps the numbers into their new ranges', () => {
    expect((migrate({layout: {...defaultLayout, neighbourOpacity: 0.8}}).layout as Plain).neighbourOpacity).toBe(0.5);
    expect((migrate({layout: {...defaultLayout, neighbourOpacity: 0}}).layout as Plain).neighbourOpacity).toBe(0.15);
    expect((migrate({overlay: {introSeconds: 8}}).overlay as Plain).introSeconds).toBe(6);
    expect((migrate({overlay: {introSeconds: 1}}).overlay as Plain).introSeconds).toBe(2);
    expect((migrate({background: {kenBurnsScale: 1.3}}).background as Plain).kenBurnsScale).toBe(1.05);
    const view = migrate({pageView: {turnSeconds: 2, dimOtherLines: 0.2}}).pageView as Plain;
    expect(view).toMatchObject({turnSeconds: 1.5, dimOtherLines: 0.5});
  });

  it('turns the pans into the slow zoom and an enabled glow into a vignette', () => {
    const background = (group: Plain) => migrate({background: group}).background as Plain;
    expect(background({kenBurns: 'pan-left'}).kenBurns).toBe('slow-zoom');
    expect(background({kenBurns: 'pan-right'}).kenBurns).toBe('slow-zoom');
    expect(background({glow: {enabled: true, color: '#fff', strength: 0.5}})).toMatchObject({vignette: 0.15});
    expect(background({vignette: 0.3, glow: {enabled: true, color: '#fff', strength: 0.5}}).vignette).toBe(0.3);
    expect(background({glow: {enabled: false, color: '#fff', strength: 0.5}})).toMatchObject({vignette: 0});
    // A gradient the old kind never painted becomes the new default; a painted one is kept.
    const teal = {from: '#0f2027', to: '#2c5364', angle: 180};
    expect(background({kind: 'color', gradient: teal, glow: {enabled: false}}).gradient).toEqual({
      from: '#14191d',
      to: '#0b0e10',
      angle: 180,
    });
    expect(background({kind: 'gradient', gradient: teal, glow: {enabled: false}}).gradient).toEqual(teal);
  });

  it('maps the removed page options, and the old default font stacks only when exact', () => {
    expect(migrate({pageView: {lineHighlight: 'underline', frame: 'ornate', turn: 'slide'}}).pageView).toMatchObject({
      lineHighlight: 'band',
      frame: 'simple',
      turn: 'fade',
    });
    expect((migrate({text: {translationFont: 'Georgia, serif'}}).text as Plain).translationFont).toBe('Georgia, serif');
    expect((migrate({overlay: {font: 'Lora'}}).overlay as Plain).font).toBe('Lora');
  });

  it('fills a group sent in part from the composition’s defaults, else the shared ones', () => {
    expect(migrate({layout: {aspect: '1:1'}}).layout).toEqual({...defaultLayout, aspect: '1:1'});
    expect(migrate({layout: {aspect: '9:16'}}, defaultMushafAyahTextProps as unknown as Plain).layout).toEqual({
      ...defaultMushafAyahTextProps.layout,
    });
    expect(migrate({animation: {}}).animation).toEqual(defaultAnimation);
    expect(migrate({highlight: {style: 'marker'}}).highlight).toEqual({...defaultHighlight, style: 'wash'});
    // A composition without a group does not gain one.
    expect(migrate({theme: 'light'})).toEqual({theme: 'light'});
  });

  it('passes props in the current shape through as the same object, and anything that is not props', () => {
    for (const props of [
      defaultMushafRecitationProps,
      defaultMushafPassageProps,
      defaultMushafAyahTextProps,
      defaultMushafPageProps,
      defaultMushafThumbnailProps,
      defaultMushafRecitationSlotProps,
      defaultMushafAyahTextSlotProps,
      defaultMushafPageSlotProps,
    ]) {
      expect(migrateMushafProps(props)).toBe(props);
      expect(mushafPropsNeedMigration(props)).toBe(false);
      expect(describeMushafMigration(props)).toEqual([]);
    }
    expect(migrateMushafProps(null)).toBeNull();
    expect(migrateMushafProps('props')).toBe('props');
    expect(migrateMushafProps([1, 2])).toEqual([1, 2]);
  });
});

describe('describeMushafMigration / mushafPropsNeedMigration', () => {
  it('lists every change of the old Root with its path, its values and why', () => {
    const notes = describeMushafMigration(old.MushafRecitation, {defaults: defaultMushafRecitationProps});
    const at = (path: string) => notes.find((note) => note.path === path);
    expect(at('highlight.style')).toEqual({
      path: 'highlight.style',
      from: 'color',
      to: 'tint',
      reason: 'renamed: a tint',
      code: 'colorTint',
      params: {},
    });
    expect(at('highlight.dimOthers')).toMatchObject({from: 1, to: undefined, code: 'dimOthersRemoved'});
    expect(at('animation.lines')).toMatchObject({
      from: undefined,
      to: 'rise',
      reason: 'from enter "slide-fade"',
      code: 'linesFrom',
      params: {field: 'enter', value: '"slide-fade"'},
    });
    expect(at('animation.scroll')).toMatchObject({from: 'ease', to: undefined});
    expect(at('background.glow')?.reason).toMatch(/nothing follows the audio level/);
    expect(at('background.kenBurnsScale')).toMatchObject({
      from: 1.1,
      to: 1.05,
      reason: 'outside the new range 1–1.05: clamped',
      code: 'clamped',
      params: {min: 1, max: 1.05},
    });
    expect(at('layout.frame')).toMatchObject({from: undefined, to: 'none'});
    expect(at('text.translationFont')?.reason).toMatch(/never loaded/);
    // Nothing still valid is listed.
    expect(at('layout.marginX')).toBeUndefined();
    expect(at('theme')).toBeUndefined();
    for (const note of notes) {
      expect(note.reason.length).toBeGreaterThan(0);
      // The English reason is the code's text, filled in: a host can word the code in its own language.
      expect(note.reason).toBe(migrationReasonText(note.code, note.params));
    }
    expect(mushafPropsNeedMigration(old.MushafRecitation)).toBe(true);
  });

  it('words a reason from its code, its values filled in', () => {
    expect(migrationReasonText('clamped', {min: 0.5, max: 0.85})).toBe('outside the new range 0.5–0.85: clamped');
    expect(migrationReasonText('frameNew')).toBe(MIGRATION_REASONS.frameNew);
    expect(migrationReasonText('linesFrom', {field: 'exit'})).toBe('from exit {value}');
  });

  it('is empty for props that need nothing, and true once a field is missing', () => {
    expect(describeMushafMigration({})).toEqual([]);
    const {frame: _frame, ...withoutFrame} = defaultLayout;
    expect(mushafPropsNeedMigration({...defaultMushafRecitationProps, layout: withoutFrame})).toBe(true);
  });
});
