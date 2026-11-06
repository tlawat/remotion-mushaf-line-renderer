import type * as React from 'react';
import {memo, useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {useVideoConfig} from 'remotion';
import {reserveDockSpace} from './dock-space';
import {DoubtMarkers} from './doubts';
import {useInStudio} from './environment';
import {directionOf, STUDIO_LANGUAGES} from './i18n';
import type {MushafStudioPanelProps} from './index';
import {ProjectMenu} from './ProjectMenu';
import {useLiveEditorProps} from './remotion-internals';
import {
  describeError,
  getStudioState,
  LOADING_LABELS,
  runStudioTask,
  STUDIO_TABS,
  type StudioTab,
  type StudioTarget,
  setStudioState,
  targetKeyOf,
  t as tNow,
  useStudioState,
  useT,
  withEntry,
} from './store';
import {
  applyPatch,
  dismissRolledBack,
  observeLiveProps,
  type PropsPatch,
  patchApplied,
  patchPaths,
  rememberLiveProps,
  rememberPanelProps,
  restoreRolledBack,
} from './studio-api';
import {colors, styles} from './styles';
import {hasLines, isPageResolved, resolvedOf, type StudioCompositionProps, type TabProps} from './tab-props';
import {AlignTab} from './tabs/AlignTab';
import {LinesTab} from './tabs/LinesTab';
import {LookTab} from './tabs/LookTab';
import {ReviewTab} from './tabs/ReviewTab';
import {SourceTab} from './tabs/SourceTab';
import {TextTab} from './tabs/TextTab';
import {Spinner, TabErrorBoundary} from './ui';

const TABS: Readonly<Record<StudioTab, React.FC<TabProps>>> = {
  source: SourceTab,
  look: LookTab,
  align: AlignTab,
  review: ReviewTab,
  lines: LinesTab,
  text: TextTab,
};

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

const StatusLine: React.FC = () => {
  const {busy, loading, error, notice, progress} = useStudioState();
  const t = useT();
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
          <span>{loading.map((key) => t(LOADING_LABELS[key])).join(' ')}</span>
        </div>
      ) : null}
      {error ? (
        <div style={styles.statusLine('error')}>
          <span style={{flex: '1 1 auto'}}>{error}</span>
          <button
            type="button"
            style={styles.button('ghost', false)}
            onClick={() => setStudioState({error: null})}
            title={t('status.dismiss')}
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
            title={t('status.dismiss')}
          >
            ×
          </button>
        </div>
      ) : null}
      {idle ? <div style={styles.statusLine('idle')}>{t('status.ready')}</div> : null}
    </div>
  );
};

/** How many field names the rolled-back notice lists before it says how many more there are. */
const LISTED_FIELDS = 4;

/**
 * Offers to save again what the panel's saves wrote and the live props lost (the Props sidebar's
 * JSON Reset or the Studio's undo back to the page-load props, a sidebar save that raced the
 * panel's). Nothing is written unless the user presses Restore.
 */
const RolledBack: React.FC<{readonly target: StudioTarget; readonly lost: PropsPatch}> = ({target, lost}) => {
  const {busy} = useStudioState();
  const t = useT();
  const paths = patchPaths(lost as Readonly<Record<string, unknown>>);
  const listed = paths.slice(0, LISTED_FIELDS).join(', ');
  const fields =
    paths.length > LISTED_FIELDS
      ? t('panel.rolledBackMore', {fields: listed, count: paths.length - LISTED_FIELDS})
      : listed;
  const restore = () => void runStudioTask(tNow('panel.busy.restoring'), () => restoreRolledBack(target));
  return (
    <div style={{...styles.status, ...styles.statusLine('notice')}} role="alert" data-mushaf-control="rolled-back">
      <span style={{flex: '1 1 auto'}}>{t('panel.rolledBack', {fields})}</span>
      <button type="button" style={styles.button('default', busy !== null)} disabled={busy !== null} onClick={restore}>
        {t('panel.restore')}
      </button>
      <button
        type="button"
        style={styles.button('ghost', false)}
        onClick={() => dismissRolledBack(target)}
        title={t('panel.keepAsIs')}
      >
        ×
      </button>
    </div>
  );
};

/** The dock itself: Studio only, so `useVideoConfig()` and `document` are safe here. */
const StudioDock: React.FC<MushafStudioPanelProps> = ({compositionId, props, project, initialTab}) => {
  const state = useStudioState();
  const t = useT();
  const {fps} = useVideoConfig();
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.body));
  const target = useMemo<StudioTarget>(() => ({compositionId}), [compositionId]);
  const key = targetKeyOf(target);
  // The Root as the Studio has it now: every save starts from it, whoever wrote it last.
  const live = useLiveEditorProps();
  rememberLiveProps(live);
  useEffect(() => observeLiveProps(live), [live]);
  const pendingPatch = state.pendingPatches[key];
  // The composition has come back with what was saved: the tabs read the props themselves again.
  useEffect(() => {
    if (pendingPatch !== undefined && patchApplied(props, pendingPatch as Readonly<Record<string, unknown>>))
      setStudioState({pendingPatches: withEntry(getStudioState().pendingPatches, key, undefined)});
  }, [props, pendingPatch, key]);
  // The dock is an overlay; the Studio is told to leave it room, so the preview is never under it.
  useEffect(() => reserveDockSpace(state.collapsed, state.side), [state.collapsed, state.side]);
  if (!host) return null;
  const tab = state.tab ?? initialTab ?? 'source';
  const Tab = TABS[tab];
  const shown = applyPatch(props, pendingPatch);
  const lost = state.rolledBack[key];
  const other = state.side === 'left' ? 'right' : 'left';
  const dock = (
    <aside
      data-mushaf-studio="panel"
      data-collapsed={state.collapsed ? 'true' : 'false'}
      data-side={state.side}
      data-language={state.language}
      dir={directionOf(state.language)}
      lang={state.language}
      aria-label={t('panel.title')}
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
          title={t('panel.open')}
        >
          {t('panel.title')}
        </button>
      ) : (
        <>
          <header style={styles.header}>
            <span style={styles.title}>{t('panel.title')}</span>
            <span style={styles.row}>
              <fieldset
                aria-label={t('panel.language')}
                data-mushaf-control="language"
                style={{...styles.row, gap: 0, border: 'none', margin: 0, padding: 0}}
              >
                {STUDIO_LANGUAGES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    lang={entry.id}
                    data-language={entry.id}
                    aria-pressed={entry.id === state.language}
                    style={{
                      ...styles.button('ghost', false),
                      color: entry.id === state.language ? colors.text : colors.muted,
                      fontWeight: entry.id === state.language ? 600 : 400,
                    }}
                    onClick={() => setStudioState({language: entry.id})}
                  >
                    {entry.name}
                  </button>
                ))}
              </fieldset>
              <ProjectMenu target={target} props={shown} project={project} />
              <button
                type="button"
                style={styles.button('ghost', false)}
                onClick={() => setStudioState({side: other})}
                title={other === 'left' ? t('panel.moveLeft') : t('panel.moveRight')}
              >
                {other === 'left' ? '⇤' : '⇥'}
              </button>
              <button
                type="button"
                style={styles.button('ghost', false)}
                onClick={() => setStudioState({collapsed: true})}
                title={t('panel.collapse')}
              >
                {state.side === 'left' ? '«' : '»'}
              </button>
            </span>
          </header>
          <div style={styles.tabs} role="tablist" aria-label={t('panel.tabs')}>
            {STUDIO_TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === tab}
                style={styles.tab(entry.id === tab)}
                onClick={() => setStudioState({tab: entry.id})}
              >
                {t(entry.label)}
              </button>
            ))}
          </div>
          <div style={styles.content} role="tabpanel">
            <TabErrorBoundary
              key={tab}
              onError={(error) => setStudioState({error: describeError(error)})}
              message={t('panel.tabCrashed')}
              reload={t('panel.reload')}
            >
              <Tab
                compositionId={compositionId}
                target={target}
                props={shown}
                project={project ?? compositionId}
                fps={fps}
              />
            </TabErrorBoundary>
          </div>
          {lost ? <RolledBack target={target} lost={lost} /> : null}
          <StatusLine />
        </>
      )}
    </aside>
  );
  return createPortal(dock, host);
};

/** The Studio part of the panel: the doubt markers and the dock. Re-rendered only when `propsEqual()` says so. */
const Panel: React.FC<MushafStudioPanelProps> = (panelProps) => (
  // The timeline markers are the composition's own children (Sequences register where they are
  // rendered); the dock is portaled out of it.
  <>
    <DoubtMarkers props={panelProps.props} />
    <StudioDock {...panelProps} />
  </>
);

/**
 * A cheap fingerprint of `resolved`: enough to notice a new resolution without comparing the data.
 * The counts alone miss a re-alignment that keeps them, so the session, the last edit and the sum
 * of the word starts are in it too. An ayah text has its ayahs, a page its pages, where a
 * recitation has its lines.
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
    hasLines(resolved)
      ? resolved.lines.length
      : isPageResolved(resolved)
        ? `p${resolved.pages.map((page) => `${page.page}@${page.start}`).join(',')}`
        : `a${resolved.ayahs.length}`,
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
    hasLines(resolved) ? (resolved.droppedSplits ?? []).length : 0,
  ].join(':');
};

/**
 * The composition re-renders on every frame; the panel must not. Every top-level prop is compared
 * by identity (Remotion hands the composition the same group objects frame after frame, and a new
 * one when anything in it changed), `resolved` by a fingerprint, so a `calculateMetadata()` that
 * rebuilt the same data leaves the dock alone.
 */
const propsEqual = (a: MushafStudioPanelProps, b: MushafStudioPanelProps): boolean => {
  if (a.compositionId !== b.compositionId || a.project !== b.project || a.initialTab !== b.initialTab) return false;
  const x = a.props as Readonly<Record<string, unknown>>;
  const y = b.props as Readonly<Record<string, unknown>>;
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)]))
    if (key !== 'resolved' && !Object.is(x[key], y[key])) return false;
  return resolvedSignature(a.props) === resolvedSignature(b.props);
};

const StudioPanel = memo(Panel, propsEqual);

/**
 * The Mushaf panel: rendered inside a composition (`<MushafRecitation>`, `<MushafAyahText>` or `<MushafPage>`), it
 * renders nothing outside the Studio (in a render, a `<Player>`, on the server). In the Studio it
 * portals a dock into `document.body`, in English or Arabic, with the tabs Source, Look, Align,
 * Review, Lines and Text and a Project menu, and marks the doubtful segments on the Studio's
 * timeline with empty `<Sequence>`s rendered in the composition itself. Every change it makes goes
 * through the same path: write the file(s) into `public/`, `saveDefaultProps()` on the
 * composition from its live Root values, then `reevaluateComposition()`. It never calls
 * `delayRender()`, and only the waveform's playhead re-renders with the frame.
 */
export const MushafStudioPanel: React.FC<MushafStudioPanelProps> = (panelProps) => {
  // Only the environment hook before this check: outside the Studio's preview nothing of the dock
  // (and nothing of `document`) is touched.
  const inStudio = useInStudio();
  if (!inStudio) return null;
  // Every frame, past the memo: what Export project, Copy description and Set thumbnail read when clicked.
  rememberPanelProps(panelProps.compositionId, panelProps.props);
  return <StudioPanel {...panelProps} />;
};
