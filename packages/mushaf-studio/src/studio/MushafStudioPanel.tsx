import type * as React from 'react';
import {memo, useState} from 'react';
import {createPortal} from 'react-dom';
import {useVideoConfig} from 'remotion';
import type {MushafRecitationProps} from '../compositions/recitation/schema';
import {isInStudio} from './environment';
import type {MushafStudioPanelProps} from './index';
import {STUDIO_TABS, type StudioTab, setStudioState, useStudioState} from './store';
import {styles} from './styles';
import {resolvedOf, type TabProps} from './tab-props';
import {AlignTab} from './tabs/AlignTab';
import {LinesTab} from './tabs/LinesTab';
import {ReviewTab} from './tabs/ReviewTab';
import {SourceTab} from './tabs/SourceTab';
import {TextTab} from './tabs/TextTab';
import {Spinner} from './ui';

const TABS: Readonly<Record<StudioTab, React.FC<TabProps>>> = {
  source: SourceTab,
  align: AlignTab,
  review: ReviewTab,
  lines: LinesTab,
  text: TextTab,
};

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

const StatusLine: React.FC = () => {
  const {busy, error, notice, progress} = useStudioState();
  const idle = !busy && !error && !notice;
  return (
    <div style={styles.status} role="status" aria-live="polite">
      {busy ? (
        <div style={styles.statusLine('busy')}>
          <Spinner />
          <span>
            {busy}
            {progress ? ` (${progress.step}/${progress.steps})` : ''}
          </span>
        </div>
      ) : null}
      {error ? (
        <div style={styles.statusLine('error')}>
          <span style={{flex: '1 1 auto'}}>{error}</span>
          <button
            type="button"
            style={styles.button('ghost', false)}
            onClick={() => setStudioState({error: null})}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}
      {notice ? (
        <div style={styles.statusLine('notice')}>
          <span style={{flex: '1 1 auto'}}>{notice}</span>
          <button
            type="button"
            style={styles.button('ghost', false)}
            onClick={() => setStudioState({notice: null})}
            title="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}
      {idle ? <div style={styles.statusLine('idle')}>Ready.</div> : null}
    </div>
  );
};

/** The dock itself: Studio only, so `useVideoConfig()` and `document` are safe here. */
const StudioDock: React.FC<MushafStudioPanelProps> = ({compositionId, props, project, initialTab}) => {
  const state = useStudioState();
  const {fps} = useVideoConfig();
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.body));
  if (!host) return null;
  const tab = state.tab ?? initialTab ?? 'source';
  const Tab = TABS[tab];
  const dock = (
    <aside
      data-mushaf-studio="panel"
      data-collapsed={state.collapsed ? 'true' : 'false'}
      aria-label="Mushaf Studio"
      style={styles.dock(state.collapsed)}
      onKeyDown={stop}
      onKeyUp={stop}
      onKeyPress={stop}
    >
      {state.collapsed ? (
        <button
          type="button"
          style={{...styles.collapsedTitle, background: 'transparent', border: 'none'}}
          onClick={() => setStudioState({collapsed: false})}
          title="Open the Mushaf panel"
        >
          Mushaf Studio
        </button>
      ) : (
        <>
          <header style={styles.header}>
            <span style={styles.title}>Mushaf Studio</span>
            <button
              type="button"
              style={styles.button('ghost', false)}
              onClick={() => setStudioState({collapsed: true})}
              title="Collapse the panel"
            >
              »
            </button>
          </header>
          <div style={styles.tabs} role="tablist" aria-label="Mushaf Studio tabs">
            {STUDIO_TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === tab}
                style={styles.tab(entry.id === tab)}
                onClick={() => setStudioState({tab: entry.id})}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div style={styles.content} role="tabpanel">
            <Tab compositionId={compositionId} props={props} project={project} fps={fps} />
          </div>
          <StatusLine />
        </>
      )}
    </aside>
  );
  return createPortal(dock, host);
};

const Panel: React.FC<MushafStudioPanelProps> = (panelProps) => {
  // No hook above this line: outside the Studio nothing of the dock (and nothing of `document`) is touched.
  const inStudio = isInStudio();
  if (!inStudio) return null;
  return <StudioDock {...panelProps} />;
};

/** A cheap fingerprint of `resolved`: enough to notice a new resolution without comparing the data. */
const resolvedSignature = (props: MushafRecitationProps): string => {
  const resolved = resolvedOf(props);
  if (!resolved) return 'none';
  const {timings, lines, schedule} = resolved;
  const last = schedule[schedule.length - 1];
  const sidecar = timings.alignment;
  return [
    lines.length,
    schedule.length,
    last ? `${last.start}-${last.end}` : '',
    timings.surah,
    timings.ayat.length,
    sidecar?.segments.length ?? -1,
    sidecar?.words.length ?? -1,
    sidecar?.edits.length ?? -1,
  ].join(':');
};

/**
 * The composition re-renders on every frame; the panel must not. Content props are compared by
 * value (the style props do not concern the panel), `resolved` by a fingerprint rather than by
 * identity, so a parent that rebuilds the props object each frame still leaves the dock alone.
 */
const propsEqual = (a: MushafStudioPanelProps, b: MushafStudioPanelProps): boolean => {
  if (a.compositionId !== b.compositionId || a.project !== b.project || a.initialTab !== b.initialTab) return false;
  const x = a.props;
  const y = b.props;
  return (
    x.audioFile === y.audioFile &&
    x.timingsFile === y.timingsFile &&
    x.fromAyah === y.fromAyah &&
    x.toAyah === y.toAyah &&
    x.slice === y.slice &&
    x.text.translationFile === y.text.translationFile &&
    x.text.glossFile === y.text.glossFile &&
    x.text.transliterationFile === y.text.transliterationFile &&
    x.review.confidenceThreshold === y.review.confidenceThreshold &&
    JSON.stringify(x.splits) === JSON.stringify(y.splits) &&
    resolvedSignature(x) === resolvedSignature(y)
  );
};

/**
 * The Mushaf panel: rendered inside a composition, it renders nothing outside the Studio (in a
 * render, a `<Player>`, on the server). In the Studio it portals a dock into `document.body`, with
 * the tabs Source, Align, Review, Lines and Text. Every change it makes goes through the same path:
 * write the file(s) into `public/`, `saveDefaultProps()` on the composition, then
 * `reevaluateComposition()`. It never calls `delayRender()` and does not re-render with the frame.
 */
export const MushafStudioPanel: React.FC<MushafStudioPanelProps> = memo(Panel, propsEqual);
