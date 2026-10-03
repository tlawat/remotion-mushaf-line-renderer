// The few controls the tabs share. Function components, inline styles, nothing clever.
import type * as React from 'react';
import {Component, useEffect, useId, useState} from 'react';
import {colors, styles} from './styles';

export const Section: React.FC<{readonly title: string; readonly children: React.ReactNode}> = ({title, children}) => (
  <section style={styles.section}>
    <h3 style={styles.sectionTitle}>{title}</h3>
    {children}
  </section>
);

/** A section the user opens; closed by default so the advanced parts stay out of the way. */
export const Disclosure: React.FC<{
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}> = ({title, open, onToggle, children}) => (
  <section style={styles.section}>
    <button
      type="button"
      style={{...styles.button('ghost', false), padding: 0, color: colors.muted}}
      onClick={onToggle}
    >
      {open ? '▾' : '▸'} {title}
    </button>
    {open ? <div style={{marginTop: 6}}>{children}</div> : null}
  </section>
);

/** A labelled control: the child receives the id the label points to. */
export const Field: React.FC<{readonly label: string; readonly children: (id: string) => React.ReactNode}> = ({
  label,
  children,
}) => {
  const id = useId();
  return (
    <div style={styles.field}>
      <label style={styles.label} htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
};

export const Button: React.FC<{
  readonly onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  readonly children: React.ReactNode;
  readonly variant?: 'primary' | 'default' | 'ghost' | undefined;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
}> = ({onClick, children, variant = 'default', disabled = false, title}) => (
  <button type="button" style={styles.button(variant, disabled)} onClick={onClick} disabled={disabled} title={title}>
    {children}
  </button>
);

export const Note: React.FC<{readonly children: React.ReactNode}> = ({children}) => (
  <p style={styles.note}>{children}</p>
);

/** A number input bounded to `[min, max]`; what it reports is always a number inside the bounds. */
export const NumberInput: React.FC<{
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly width?: number | undefined;
  readonly label?: string | undefined;
}> = ({value, onChange, min, max, step, width, label}) => (
  <input
    type="number"
    aria-label={label}
    style={width === undefined ? styles.numberInput : {...styles.numberInput, width}}
    value={value}
    min={min}
    max={max}
    step={step}
    onChange={(event) => {
      const next = Number(event.target.value);
      if (!Number.isFinite(next)) return;
      onChange(Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next)));
    }}
  />
);

export const ProgressBar: React.FC<{readonly ratio: number; readonly color?: string | undefined}> = ({
  ratio,
  color,
}) => (
  <div style={styles.bar}>
    <div style={styles.barFill(ratio, color ?? colors.accent)} />
  </div>
);

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** A text spinner for the status line; its tick is local state, nothing in the video sees it. */
export const Spinner: React.FC = () => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 90);
    return () => clearInterval(timer);
  }, []);
  return <span aria-hidden="true">{FRAMES[frame]}</span>;
};

type BoundaryProps = {
  /** Receives the error a tab threw while rendering (the panel puts it in the status line). */
  readonly onError: (error: unknown) => void;
  readonly children: React.ReactNode;
};

type BoundaryState = {readonly failed: boolean};

/**
 * Keeps a tab's crash inside the tab: the error goes to `onError`, the tab is replaced by a Reload
 * button that mounts it again, and the dock around it stays. A class, the one exception to the
 * function components here, because React has no hook for `componentDidCatch`.
 */
export class TabErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = {failed: false};

  static getDerivedStateFromError(): BoundaryState {
    return {failed: true};
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  override render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div>
        <Note>This tab stopped on an error (see the status line). Reload it; if it stops again, check the props.</Note>
        <Button onClick={() => this.setState({failed: false})}>Reload</Button>
      </div>
    );
  }
}

/** `12.345` seconds as `12.35`. */
export const seconds = (value: number): string => value.toFixed(2);

export const range = (from: number, to: number): string => `${seconds(from)}–${seconds(to)} s`;
