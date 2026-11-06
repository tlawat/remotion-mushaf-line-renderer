import type * as React from 'react';
import {
  applyLook,
  lookMatches,
  lookPatchFor,
  lookRevertPatch,
  looksFor,
  lookUndoPatch,
  type MushafLook,
} from '../../presets';
import type {MessageKey} from '../i18n';
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
import {styles} from '../styles';
import {compositionKindOf, type StudioCompositionProps, type TabProps} from '../tab-props';
import {Button, Note, Section} from '../ui';

type Chip = {readonly label: MessageKey; readonly color: string};

/**
 * The colours the composition would have with the look: page, ink, the current word's mark (unless
 * the look marks nothing), and the rosette's accent of a custom theme or else the translation.
 */
const swatchOf = (props: StudioCompositionProps, look: MushafLook): readonly Chip[] => {
  const next = applyLook(props, look);
  const chips: Chip[] = [
    {label: 'look.chip.page', color: next.layout.background},
    {label: 'look.chip.ink', color: next.layout.color},
  ];
  if (next.highlight.mode !== 'none' && next.highlight.style !== 'none')
    chips.push({label: 'look.chip.currentWord', color: next.highlight.color});
  if ('theme' in next && next.theme === 'custom' && next.customTheme.override.accent)
    chips.push({label: 'look.chip.rosette', color: next.customTheme.accent});
  else chips.push({label: 'look.chip.translation', color: next.text.translationColor});
  return chips;
};

/**
 * Look: one-click style presets. A card sets the style props its look names (through the same
 * `patchProps()` every tab uses) and never the content; Undo goes back through the looks applied to
 * this target, last first, and puts back only the fields that still hold the look's values
 * (`lookRevertPatch()`). Needs nothing resolved: it works before a recitation is chosen.
 */
export const LookTab: React.FC<TabProps> = ({target, props}) => {
  const {busy, lookUndo} = useStudioState();
  const t = useT();
  const working = busy !== null;
  const looks = looksFor(compositionKindOf(props));
  const key = targetKeyOf(target);
  const undo = lookUndo[key]?.at(-1) ?? null;

  const choose = (look: MushafLook) => {
    const before = lookUndoPatch(props, look);
    const applied = lookPatchFor(props, look);
    void runStudioTask(tNow('look.busy.applying', {name: look.name}), async () => {
      await patchProps(target, applied);
      const stack = [...(getStudioState().lookUndo[key] ?? []), {name: look.name, patch: before, applied}];
      setStudioState({lookUndo: withEntry(getStudioState().lookUndo, key, stack.slice(-LOOK_UNDO_DEPTH))});
    });
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
                  <span>{look.name}</span>
                  {active ? <span title={t('look.active')}>✓</span> : null}
                </span>
                <span style={styles.row} aria-hidden="true">
                  {swatchOf(props, look).map((chip) => (
                    <span
                      key={chip.label}
                      title={`${t(chip.label)}: ${chip.color}`}
                      style={styles.swatch(chip.color)}
                    />
                  ))}
                </span>
                <span style={styles.lookDescription}>{look.description}</span>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
};
