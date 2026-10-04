// Step 2: the package's looks as cards; one click applies a look over the composition's defaults.
import type {MushafLook} from '@tlawat/mushaf-studio';
import type * as React from 'react';
import {
  activeLook,
  baseAyahTextProps,
  baseRecitationProps,
  looksForProject,
  setLook,
  type WebProject,
} from '../project';
import {type ProjectUpdate, Step} from '../ui';

export type LookStepProps = {
  readonly project: WebProject;
  readonly update: ProjectUpdate;
};

type Swatch = {readonly background: string; readonly color: string; readonly mark: string};

/** The colours a card shows: the look's page, ink and mark where it sets them, the composition's own elsewhere. */
const swatch = (look: MushafLook | null, base: Swatch): Swatch => ({
  background: look?.patch.layout?.background ?? base.background,
  color: look?.patch.layout?.color ?? base.color,
  mark: look?.patch.highlight?.color ?? base.mark,
});

const Card: React.FC<{
  readonly look: MushafLook | null;
  readonly base: Swatch;
  readonly active: boolean;
  readonly onPick: () => void;
}> = ({look, base, active, onPick}) => {
  const colors = swatch(look, base);
  return (
    <button
      type="button"
      className="look-card"
      aria-pressed={active}
      data-look={look?.id ?? 'default'}
      onClick={onPick}
    >
      <span className="look-swatch" style={{background: colors.background, color: colors.color}} aria-hidden="true">
        <span>بِسْمِ</span> <span style={{color: colors.mark}}>ٱللَّهِ</span>
      </span>
      <span className="look-name">{look?.name ?? 'Default'}</span>
      <span className="look-description">
        {look?.description ?? 'The composition’s own style, as the Studio opens it.'}
      </span>
    </button>
  );
};

export const LookStep: React.FC<LookStepProps> = ({project, update}) => {
  const current = activeLook(project);
  const props = project.composition === 'recitation' ? baseRecitationProps : baseAyahTextProps;
  const base: Swatch = {background: props.layout.background, color: props.layout.color, mark: props.highlight.color};
  return (
    <Step number={2} title="Look" id="step-look">
      <div className="look-grid">
        <Card look={null} base={base} active={current === null} onPick={() => update((p) => setLook(p, null))} />
        {looksForProject(project).map((look) => (
          <Card
            key={look.id}
            look={look}
            base={base}
            active={current?.id === look.id}
            onPick={() => update((p) => setLook(p, look.id))}
          />
        ))}
      </div>
    </Step>
  );
};
