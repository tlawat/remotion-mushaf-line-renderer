import type * as React from 'react';
import {applyLook, lookMatches, lookPatchFor, looksFor, lookUndoPatch, type MushafLook} from '../../presets';
import type {MessageKey} from '../i18n';
import {runStudioTask, setStudioState, t as tNow, useStudioState, useT} from '../store';
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
 * `patchProps()` every tab uses) and never the content; Undo puts back what the last look changed.
 * Needs nothing resolved: it works before a recitation is chosen.
 */
export const LookTab: React.FC<TabProps> = ({compositionId, props}) => {
  const {busy, lookUndo} = useStudioState();
  const t = useT();
  const working = busy !== null;
  const looks = looksFor(compositionKindOf(props));
  const undo = lookUndo !== null && lookUndo.compositionId === compositionId ? lookUndo : null;

  const choose = (look: MushafLook) => {
    const before = lookUndoPatch(props, look);
    void runStudioTask(tNow('look.busy.applying', {name: look.name}), async () => {
      await patchProps(compositionId, lookPatchFor(props, look));
      setStudioState({lookUndo: {compositionId, name: look.name, patch: before}});
    });
  };

  const revert = () => {
    if (!undo) return;
    void runStudioTask(tNow('look.busy.undoing', {name: undo.name}), async () => {
      await patchProps(compositionId, undo.patch);
      setStudioState({lookUndo: null});
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
