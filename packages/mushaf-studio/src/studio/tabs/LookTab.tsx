import type * as React from 'react';
import {
  applyLook,
  formatOf,
  formatPatchFor,
  lookInBox,
  lookMatches,
  lookPatchFor,
  lookRevertPatch,
  looksFor,
  lookUndoPatch,
  MUSHAF_FORMATS,
  MUSHAF_LOOKS,
  type MushafFormat,
  type MushafLook,
} from '../../presets';
import type {MessageKey} from '../i18n';
import {pageColourInactive} from '../inactive';
import {type LookSummaryProps, lookChips, markSummary} from '../look-summary';
import {
  getStudioState,
  LOOK_UNDO_DEPTH,
  runStudioTask,
  setStudioState,
  targetKeyOf,
  t as tNow,
  useStudioState,
  useT,
  withEntry,
} from '../store';
import {patchProps} from '../studio-api';
import {colors, styles} from '../styles';
import {compositionKindOf, type StudioCompositionProps, type TabProps} from '../tab-props';
import {Button, Note, Section} from '../ui';

type Chip = {readonly label: MessageKey; readonly color: string; readonly inactive: boolean};

/** The Arabic names are set in Amiri, as on the video's labels. */
const ARABIC_NAME_STYLE: React.CSSProperties = {fontFamily: '"Amiri", "Noto Naskh Arabic", serif', fontWeight: 400};

/**
 * The four colours the composition would have with the look (`lookChips()`): page (greyed out where
 * an image, a video or a gradient covers it), ink, metal and the mark as drawn.
 */
const chipsOf = (props: StudioCompositionProps, look: MushafLook): readonly Chip[] => {
  const next = applyLook(props, look);
  const colours = lookChips(next as LookSummaryProps);
  return [
    {label: 'look.chip.page', color: colours.page, inactive: pageColourInactive(next) !== null},
    {label: 'look.chip.ink', color: colours.ink, inactive: false},
    {label: 'look.chip.metal', color: colours.metal, inactive: false},
    {label: 'look.chip.mark', color: colours.mark, inactive: false},
  ];
};

/** A frame shape as a small outlined box of its aspect, 14 px on its long side. */
const FormatGlyph: React.FC<{readonly format: MushafFormat}> = ({format}) => {
  const [w, h] = format.aspect.split(':').map(Number) as [number, number];
  const scale = 14 / Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: Math.round(w * scale),
        height: Math.round(h * scale),
        border: `1.5px solid currentColor`,
        borderRadius: 2,
        boxSizing: 'border-box',
      }}
    />
  );
};

/** The looks the dictionary has `look.name.<id>` and `look.description.<id>` for. */
const SHIPPED = new Set(MUSHAF_LOOKS.map((look) => look.id));

/** A look's name or description in the panel's language: the dictionary's for a look the package ships, else the look's own. */
const lookText = (
  t: (key: MessageKey) => string,
  look: MushafLook,
  part: 'name' | 'description',
  arabic: boolean,
): string => {
  if (SHIPPED.has(look.id)) return t(`look.${part}.${look.id}` as MessageKey);
  if (part === 'name') return arabic ? look.nameAr : look.name;
  return arabic ? look.descriptionAr : look.description;
};

/**
 * Look: the Format row (the frame shape, hidden in a slot), the looks as cards, and the mark in one
 * line. A format sets the aspect, and the margins and vertical place only while they hold the
 * previous format's (`formatPatchFor()`). A card sets the style props its look names (through the
 * same `patchProps()` every tab uses) and never the content; Undo goes back through the looks
 * applied to this target, last first, and puts back only the fields that still hold the look's
 * values (`lookRevertPatch()`). Needs nothing resolved: it works before a recitation is chosen. In a
 * slot (`target.propsKey`) a look leaves `layout.aspect` alone (`lookInBox()`): the box decides the
 * size. Under an image, a video or a gradient the page colour a look sets barely shows: its chip is
 * greyed out and a note says where it still does (`pageColourInactive()`).
 */
export const LookTab: React.FC<TabProps> = ({target, props}) => {
  const {busy, lookUndo, language} = useStudioState();
  const t = useT();
  const arabic = language === 'ar';
  const working = busy !== null;
  const inSlot = target.propsKey !== undefined;
  const kind = compositionKindOf(props);
  const looks = looksFor(kind).map((look) => (inSlot ? lookInBox(look) : look));
  const key = targetKeyOf(target);
  const undo = lookUndo[key]?.at(-1) ?? null;
  const covered = pageColourInactive(props);
  const current = formatOf(props);
  const summary = markSummary(props as LookSummaryProps);
  const animation = (props as {readonly animation?: {readonly lines: string; readonly tempo: string}}).animation;

  const choose = (look: MushafLook) => {
    const before = lookUndoPatch(props, look);
    const applied = lookPatchFor(props, look);
    const name = lookText(tNow, look, 'name', false);
    void runStudioTask(tNow('look.busy.applying', {name}), async () => {
      await patchProps(target, applied);
      const stack = [...(getStudioState().lookUndo[key] ?? []), {name, patch: before, applied}];
      setStudioState({lookUndo: withEntry(getStudioState().lookUndo, key, stack.slice(-LOOK_UNDO_DEPTH))});
    });
  };

  const reshape = (format: MushafFormat) => {
    const patch = formatPatchFor(props, format.id);
    void runStudioTask(tNow('look.format.busy', {name: tNow(`look.format.${format.id}`)}), () =>
      patchProps(target, patch),
    );
  };

  const revert = () => {
    if (!undo) return;
    const forget = () => {
      const stack = (getStudioState().lookUndo[key] ?? []).filter((entry) => entry !== undo);
      setStudioState({lookUndo: withEntry(getStudioState().lookUndo, key, stack.length > 0 ? stack : undefined)});
    };
    // Only the fields that still hold the look: one changed since (the sidebar, another look) is the user's.
    const patch = lookRevertPatch(props, undo.applied, undo.patch);
    if (patch === null) {
      forget();
      setStudioState({notice: tNow('look.notice.nothingToUndo', {name: undo.name})});
      return;
    }
    const partial = JSON.stringify(patch) !== JSON.stringify(undo.patch);
    void runStudioTask(tNow('look.busy.undoing', {name: undo.name}), async () => {
      await patchProps(target, patch);
      forget();
      if (partial) setStudioState({notice: tNow('look.notice.keptChanged', {name: undo.name})});
    });
  };

  return (
    <div>
      <Note>{t('look.note')}</Note>
      {inSlot ? <Note>{t('look.slotNote')}</Note> : null}
      {inSlot ? null : (
        <Section title={t('look.format')}>
          <fieldset
            aria-label={t('look.format')}
            data-mushaf-control="format"
            style={{...styles.row, gap: 0, border: 'none', margin: 0, padding: 0}}
          >
            {MUSHAF_FORMATS.map((format) => {
              const selected = current?.id === format.id;
              return (
                <button
                  key={format.id}
                  type="button"
                  data-format={format.id}
                  aria-pressed={selected}
                  disabled={working}
                  onClick={() => reshape(format)}
                  style={{
                    ...styles.button(selected ? 'primary' : 'default', working),
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    borderRadius: 0,
                  }}
                >
                  <FormatGlyph format={format} />
                  <span>{t(`look.format.${format.id}`)}</span>
                </button>
              );
            })}
          </fieldset>
          {current?.id === 'vertical' && kind !== 'ayah-text' ? (
            <p style={styles.inactiveNote} data-mushaf-hint="vertical">
              {t('look.format.verticalHint')}
            </p>
          ) : null}
        </Section>
      )}
      {covered ? (
        <p style={styles.inactiveNote} data-mushaf-inactive="">
          {t(covered.key, covered.params)}
        </p>
      ) : null}
      {undo ? (
        <div style={{...styles.row, marginBottom: 10}}>
          <Button onClick={revert} disabled={working} title={t('look.undoTitle', {name: undo.name})}>
            {t('look.undo', {name: undo.name})}
          </Button>
        </div>
      ) : null}
      <Section title={t('look.looks')}>
        <div style={styles.lookGrid}>
          {looks.map((look) => {
            const active = lookMatches(props, look);
            return (
              <button
                key={look.id}
                type="button"
                data-look={look.id}
                aria-pressed={active}
                style={styles.lookCard(active, working)}
                disabled={working}
                onClick={() => choose(look)}
              >
                <span style={styles.lookName}>
                  <span>
                    <span lang="en">{look.name}</span>
                    {' · '}
                    <span lang="ar" dir="rtl" style={ARABIC_NAME_STYLE}>
                      {look.nameAr}
                    </span>
                  </span>
                  {active ? <span title={t('look.active')}>✓</span> : null}
                </span>
                <span style={styles.row} aria-hidden="true">
                  {chipsOf(props, look).map((chip) => (
                    <span
                      key={chip.label}
                      data-chip={chip.label.slice('look.chip.'.length)}
                      title={`${t(chip.label)}: ${chip.color}`}
                      data-inactive={chip.inactive ? '' : undefined}
                      style={
                        chip.inactive ? {...styles.swatch(chip.color), ...styles.inactive} : styles.swatch(chip.color)
                      }
                    />
                  ))}
                </span>
                <span style={styles.lookDescription}>{lookText(t, look, 'description', arabic)}</span>
              </button>
            );
          })}
        </div>
      </Section>
      {summary !== null ? (
        <Section title={t('look.mark.title')}>
          <p style={{margin: 0}} data-mushaf-mark-summary="">
            {summary.follows === 'none'
              ? t('look.mark.follows.none')
              : t('look.mark.summary', {
                  follows: t(`look.mark.follows.${summary.follows}`),
                  style: t(`highlight.style.${summary.style}`),
                })}
          </p>
          {summary.note?.kind === 'adjusted' ? (
            <p style={{...styles.label, margin: '4px 0 0'}} data-mushaf-mark-note="adjusted">
              {t('look.mark.adjusted', {color: summary.note.color})}
            </p>
          ) : null}
          {summary.note?.kind === 'washOnTajweed' ? (
            <p style={{...styles.label, margin: '4px 0 0'}} data-mushaf-mark-note="washOnTajweed">
              {t('look.mark.washOnTajweed')}
            </p>
          ) : null}
          {animation !== undefined ? (
            <p style={{...styles.label, margin: '6px 0 0', color: colors.muted}} data-mushaf-motion-summary="">
              {t('look.mark.motion', {
                group: t('group.motion'),
                lines: t(`animation.lines.${animation.lines}` as MessageKey),
                tempo: t(`animation.tempo.${animation.tempo}` as MessageKey),
              })}
            </p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
};
