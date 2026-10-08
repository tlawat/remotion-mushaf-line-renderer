// What the steps share: the section frame, the project update callback and error messages.
import {isMushafStudioError} from '@tlawat/mushaf-studio';
import type * as React from 'react';
import type {WebProject} from './project';

/** A functional update of the page's project: steps never overwrite each other's changes. */
export type ProjectUpdate = (change: (project: WebProject) => WebProject) => void;

/** The message to show for a failure: the package's errors already say what to do. */
export const errorMessage = (cause: unknown): string => {
  if (isMushafStudioError(cause)) return cause.message;
  if (cause instanceof Error) return cause.message;
  return String(cause);
};

export type StepProps = {
  readonly number: number;
  readonly title: string;
  readonly id: string;
  readonly children: React.ReactNode;
};

/** One numbered step: a section labelled by its heading. */
export const Step: React.FC<StepProps> = ({number, title, id, children}) => (
  <section className="step" aria-labelledby={id}>
    <h2 id={id}>
      <span className="step-number" aria-hidden="true">
        {number}
      </span>
      {title}
    </h2>
    {children}
  </section>
);
