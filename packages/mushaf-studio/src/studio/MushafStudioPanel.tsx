import type * as React from 'react';
import {memo, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {useVideoConfig} from 'remotion';
import {useInStudio} from './environment';
import type {MushafStudioPanelProps} from './index';
import {describeError, LOADING_LABELS, STUDIO_TABS, type StudioTab, setStudioState, useStudioState} from './store';
import {applyPatch, patchApplied} from './studio-api';
import {styles} from './styles';
import {hasLines, isAyahTextProps, resolvedOf, type StudioCompositionProps, type TabProps} from './tab-props';
import {AlignTab} from './tabs/AlignTab';
import {LinesTab} from './tabs/LinesTab';
import {ReviewTab} from './tabs/ReviewTab';
import {SourceTab} from './tabs/SourceTab';
import {TextTab} from './tabs/TextTab';
import {Spinner, TabErrorBoundary} from './ui';

const TABS: Readonly<Record<StudioTab, React.FC<TabProps>>> = {
  source: SourceTab,
  align: AlignTab,
  review: ReviewTab,
  lines: LinesTab,
  text: TextTab,
};

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

const StatusLine: React.FC = () => {
  const {busy, loading, error, notice, progress} = useStudioState();
  const idle = !busy && loading.length === 0 && !error && !notice;
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
      {!busy && loading.length > 0 ? (
        <div style={styles.statusLine('busy')}>
          <Spinner />
          <span>{loading.map((key) => LOADING_LABELS[key]).join(' ')}</span>
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
  const {pendingPatch} = state;
  // The composition has come back with what was saved: the tabs read the props themselves again.
  useEffect(() => {
    if (pendingPatch !== null && patchApplied(props, pendingPatch as Readonly<Record<string, unknown>>))
      setStudioState({pendingPatch: null});
  }, [props, pendingPatch]);
  if (!host) return null;
  const tab = state.tab ?? initialTab ?? 'source';
  const Tab = TABS[tab];
  const shown = applyPatch(props, pendingPatch);
  const other = state.side === 'left' ? 'right' : 'left';
  const dock = (
    <aside
      data-mushaf-studio="panel"
      data-collapsed={state.collapsed ? 'true' : 'false'}
      data-side={state.side}
      aria-label="Mushaf Studio"
      style={styles.dock(state.collapsed, state.side)}
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
            <span style={styles.row}>
              <button
                type="button"
                style={styles.button('ghost', false)}
                onClick={() => setStudioState({side: other})}
                title={`Move the panel to the ${other} edge`}
              >
                {other === 'left' ? '⇤' : '⇥'}
              </button>
              <button
                type="button"
                style={styles.button('ghost', false)}
                onClick={() => setStudioState({collapsed: true})}
                title="Collapse the panel"
              >
                {state.side === 'left' ? '«' : '»'}
              </button>
            </span>
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
            <TabErrorBoundary key={tab} onError={(error) => setStudioState({error: describeError(error)})}>
              <Tab compositionId={compositionId} props={shown} project={project ?? compositionId} fps={fps} />
            </TabErrorBoundary>
          </div>
          <StatusLine />
        </>
      )}
    </aside>
  );
  return createPortal(dock, host);
};

const Panel: React.FC<MushafStudioPanelProps> = (panelProps) => {
  // Only the environment hook above this line: outside the Studio's preview nothing of the dock
  // (and nothing of `document`) is touched.
  const inStudio = useInStudio();
  if (!inStudio) return null;
  return <StudioDock {...panelProps} />;
};

/**
 * A cheap fingerprint of `resolved`: enough to notice a new resolution without comparing the data.
 * The counts alone miss a re-alignment that keeps them, so the session, the last edit and the sum
 * of the word starts are in it too. An ayah text has its ayahs where a recitation has its lines.
 */
const resolvedSignature = (props: StudioCompositionProps): string => {
  const resolved = resolvedOf(props);
  if (!resolved) return 'none';
  const {timings} = resolved;
  const schedule = hasLines(resolved) ? resolved.schedule : [];
  const last = schedule[schedule.length - 1];
  const sidecar = timings.alignment;
  const starts = timings.ayat.reduce((sum, ayah) => (ayah.words ?? []).reduce((n, word) => n + word.start, sum), 0);
  return [
    hasLines(resolved) ? resolved.lines.length : `a${resolved.ayahs.length}`,
    schedule.length,
    last ? `${last.start}-${last.end}` : '',
    timings.surah,
    timings.ayat.length,
    sidecar?.segments.length ?? -1,
    sidecar?.words.length ?? -1,
    sidecar?.edits.length ?? -1,
    sidecar?.audioId ?? '',
    sidecar?.edits[sidecar.edits.length - 1]?.at ?? '',
    starts,
  ].join(':');
};

/** What one composition has and the other does not: an ayah text's file and font (its script), a recitation's lines. */
const ownContent = (props: StudioCompositionProps): string =>
  isAyahTextProps(props)
    ? JSON.stringify(['ayah-text', props.textFile, props.font])
    : JSON.stringify(['recitation', props.slice, props.review.confidenceThreshold, props.splits]);

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
    x.text.translationFile === y.text.translationFile &&
    x.text.glossFile === y.text.glossFile &&
    x.text.transliterationFile === y.text.transliterationFile &&
    ownContent(x) === ownContent(y) &&
    resolvedSignature(x) === resolvedSignature(y)
  );
};

/**
 * The Mushaf panel: rendered inside a composition (`<MushafRecitation>` or `<MushafAyahText>`), it
 * renders nothing outside the Studio (in a render, a `<Player>`, on the server). In the Studio it
 * portals a dock into `document.body`, with the tabs Source, Align, Review, Lines and Text. Every change it makes goes through the same path:
 * write the file(s) into `public/`, `saveDefaultProps()` on the composition, then
 * `reevaluateComposition()`. It never calls `delayRender()` and does not re-render with the frame.
 */
export const MushafStudioPanel: React.FC<MushafStudioPanelProps> = memo(Panel, propsEqual);
