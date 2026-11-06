import type * as React from 'react';
import {memo, useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {useVideoConfig} from 'remotion';
import {hostAudioOf} from '../audio/host';
import {slotDurationOf, slotErrorOf, unresolvedSlotErrorOf} from '../slots/resolve';
import {emptySlotPropsFor} from '../slots/schema';
import {reserveDockSpace} from './dock-space';
import {DoubtMarkers} from './doubts';
import {useInStudio} from './environment';
import {hostTrackMoved, studioTrackFile, useFollowedTrack} from './host-tracks';
import {directionOf, STUDIO_LANGUAGES} from './i18n';
import type {MushafStudioPanelKind, MushafStudioPanelProps} from './index';
import {ProjectMenu} from './ProjectMenu';
import {useLiveEditorProps, useOwnSequenceStart} from './remotion-internals';
import {
  describeError,
  getStudioState,
  LOADING_LABELS,
  mountedPanelsOf,
  registerPanel,
  runStudioTask,
  STUDIO_TABS,
  type StudioTab,
  type StudioTarget,
  setStudioState,
  targetKeyOf,
  t as tNow,
  useDockOwner,
  useStudioState,
  useT,
  withEntry,
} from './store';
import {
  applyPatch,
  baseName,
  dismissRolledBack,
  isUrl,
  observeLiveProps,
  type PropsPatch,
  patchApplied,
  patchPaths,
  patchProps,
  rememberLiveProps,
  rememberPanelProps,
  restoreRolledBack,
} from './studio-api';
import {colors, styles} from './styles';
import {
  hasLines,
  isAyahTextProps,
  isPageProps,
  isPageResolved,
  resolvedOf,
  type StudioCompositionProps,
  type TabProps,
} from './tab-props';
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

/**
 * Under `hostAudio`, the live template track the composition follows (`useFollowedTrack()`): when it
 * has moved since its offset was saved (`hostTrackMoved()`), the timings would run early or late,
 * and "Update timing" saves the live offset; when no track plays `audioFile` any more (removed, or
 * playing another file), the recitation is not heard, and the panel says so and offers to follow
 * the track of that name now playing, or to play `audioFile` in the composition again. Nothing is
 * written until a button is pressed.
 */
const HostTrackTiming: React.FC<{
  readonly target: StudioTarget;
  readonly props: StudioCompositionProps;
  readonly frameOffset: number;
  readonly fps: number;
}> = ({target, props, frameOffset, fps}) => {
  const state = useFollowedTrack(props, frameOffset);
  const {busy} = useStudioState();
  const t = useT();
  const host = hostAudioOf(props);
  const working = busy !== null;
  if (state.kind === 'gone') {
    const named = state.named;
    const file = named === null ? null : studioTrackFile(named);
    const playing = file === null || file.kind === 'bytes' ? null : file.kind === 'public' ? file.path : file.url;
    const follow = () =>
      void runStudioTask(tNow('source.busy.track'), async () => {
        if (named === null || playing === null) return;
        await patchProps(target, {
          audioFile: playing,
          hostAudio: {enabled: true, offsetSeconds: named.offsetSeconds, track: named.label},
        });
        setStudioState({notice: tNow('source.notice.tracked', {track: named.label})});
      });
    const own = () =>
      void runStudioTask(tNow('busy.updating'), async () => {
        await patchProps(target, {hostAudio: {...host, enabled: false}});
        setStudioState({notice: tNow('source.notice.untracked', {file: props.audioFile})});
      });
    return (
      <div style={{...styles.status, ...styles.statusLine('error')}} role="alert" data-mushaf-control="host-gone">
        <span style={{flex: '1 1 auto'}}>
          {t('panel.hostGone', {
            track: host.track || baseName(props.audioFile),
            file: isUrl(props.audioFile) ? props.audioFile : `public/${props.audioFile}`,
          })}
        </span>
        {playing !== null ? (
          <button type="button" style={styles.button('default', working)} disabled={working} onClick={follow}>
            {t('panel.followNow')}
          </button>
        ) : null}
        <button type="button" style={styles.button('ghost', working)} disabled={working} onClick={own}>
          {t('source.track.stop')}
        </button>
      </div>
    );
  }
  if (state.kind !== 'found') return null;
  const live = state.track;
  if (live.limit !== null || !hostTrackMoved(host.offsetSeconds, live.offsetSeconds, fps)) return null;
  const update = () =>
    void runStudioTask(tNow('panel.busy.timing'), async () => {
      await patchProps(target, {hostAudio: {...host, offsetSeconds: live.offsetSeconds, track: live.label}});
      setStudioState({notice: tNow('panel.notice.timing', {track: live.label, offset: live.offsetSeconds})});
    });
  return (
    <div style={{...styles.status, ...styles.statusLine('notice')}} role="alert" data-mushaf-control="host-moved">
      <span style={{flex: '1 1 auto'}}>
        {t('panel.hostMoved', {track: live.label, live: live.offsetSeconds, saved: host.offsetSeconds})}
      </span>
      <button type="button" style={styles.button('default', working)} disabled={working} onClick={update}>
        {t('panel.updateTiming')}
      </button>
    </div>
  );
};

/** What the dock renders from the panel's props: its target, the props the tabs see, its kind. */
type PanelView = {
  readonly target: StudioTarget;
  readonly key: string;
  readonly kind: MushafStudioPanelKind;
  /** The props the tabs see: the panel's, or the kind's empty props while a slot holds `null`. */
  readonly base: StudioCompositionProps;
};

/** The kind of a panel's props: `kind` when given, else told from the props. */
const kindOf = (panelProps: MushafStudioPanelProps): MushafStudioPanelKind => {
  if (panelProps.kind !== undefined) return panelProps.kind;
  const {props} = panelProps;
  return props === null
    ? 'recitation'
    : isPageProps(props)
      ? 'page'
      : isAyahTextProps(props)
        ? 'ayah-text'
        : 'recitation';
};

/** The target a panel saves to and files its state under, and what its tabs see. */
const usePanelView = (panelProps: MushafStudioPanelProps): PanelView => {
  const {compositionId, propsKey, props} = panelProps;
  const kind = kindOf(panelProps);
  const target = useMemo<StudioTarget>(
    () => (propsKey ? {compositionId, propsKey, emptyProps: emptySlotPropsFor(kind)} : {compositionId}),
    [compositionId, propsKey, kind],
  );
  const empty = useMemo(() => emptySlotPropsFor(kind), [kind]);
  return {target, key: targetKeyOf(target), kind, base: props ?? empty};
};

/** The dock itself: Studio only, so `useVideoConfig()` and `document` are safe here. */
const StudioDock: React.FC<{
  readonly panelProps: MushafStudioPanelProps;
  readonly view: PanelView;
  readonly frameOffset: number;
}> = ({panelProps, view, frameOffset}) => {
  const {compositionId, props, project, initialTab, propsKey} = panelProps;
  const {target, key, base} = view;
  const state = useStudioState();
  const t = useT();
  const {fps} = useVideoConfig();
  const [host] = useState(() => (typeof document === 'undefined' ? null : document.body));
  // The Root as the Studio has it now: every save starts from it, whoever wrote it last.
  const live = useLiveEditorProps();
  rememberLiveProps(live);
  useEffect(() => observeLiveProps(live), [live]);
  const pendingPatch = state.pendingPatches[key];
  // The composition has come back with what was saved: the tabs read the props themselves again.
  useEffect(() => {
    if (pendingPatch !== undefined && patchApplied(base, pendingPatch as Readonly<Record<string, unknown>>))
      setStudioState({pendingPatches: withEntry(getStudioState().pendingPatches, key, undefined)});
  }, [base, pendingPatch, key]);
  // A slot with no recitation yet opens on Source: that is where its props begin.
  const empty = props === null;
  useEffect(() => {
    if (empty) setStudioState({tab: 'source'});
  }, [empty]);
  // The dock is an overlay; the Studio is told to leave it room, so the preview is never under it.
  useEffect(() => reserveDockSpace(state.collapsed, state.side), [state.collapsed, state.side]);
  if (!host) return null;
  const tab = state.tab ?? initialTab ?? 'source';
  const Tab = TABS[tab];
  const shown = applyPatch(base, pendingPatch);
  const lost = state.rolledBack[key];
  // A slot's own folder, so two slots of a template never share one.
  const folder = project ?? (propsKey ? `${compositionId}-${propsKey}` : undefined);
  const slotError = slotErrorOf(props) ?? (propsKey ? unresolvedSlotErrorOf(view.kind, props, propsKey) : null);
  const mounted = mountedPanelsOf(state, compositionId);
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
              <ProjectMenu target={target} props={shown} project={folder} />
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
          {mounted.length > 1 ? (
            <label style={{...styles.row, padding: '6px 12px'}} data-mushaf-control="slot-picker">
              <span style={styles.label}>{t('panel.slot')}</span>
              <select
                aria-label={t('panel.slotPicker')}
                value={key}
                onChange={(event) =>
                  setStudioState({
                    activePanels: withEntry(getStudioState().activePanels, compositionId, event.target.value),
                  })
                }
              >
                {mounted.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
                project={folder ?? compositionId}
                fps={fps}
                frameOffset={frameOffset}
              />
            </TabErrorBoundary>
          </div>
          {empty && propsKey ? (
            <div style={{...styles.status, ...styles.statusLine('notice')}} data-mushaf-control="slot-empty">
              {t('panel.slotEmpty', {key: propsKey})}
            </div>
          ) : null}
          {slotError !== null ? (
            <div
              style={{...styles.status, ...styles.statusLine('error')}}
              role="alert"
              data-mushaf-control="slot-error"
            >
              {t('panel.slotError', {key: propsKey ?? compositionId, message: slotError})}
            </div>
          ) : null}
          <HostTrackTiming target={target} props={shown} frameOffset={frameOffset} fps={fps} />
          {lost ? <RolledBack target={target} lost={lost} /> : null}
          <StatusLine />
        </>
      )}
    </aside>
  );
  return createPortal(dock, host);
};

/**
 * The Studio part of the panel: the doubt markers and, when it is the composition's dock owner
 * (`dockOwnerOf()`: several slots of a template, or two with one key, show one dock), the dock.
 * Re-rendered only when `propsEqual()` says so, or when the dock owner changes.
 */
const Panel: React.FC<MushafStudioPanelProps> = (panelProps) => {
  const view = usePanelView(panelProps);
  const {compositionId, propsKey} = panelProps;
  const label = propsKey ?? compositionId;
  // This mount's own entry: two panels with one key are told apart by it, and only one docks.
  const mount = useMemo(() => ({key: view.key, label}), [view.key, label]);
  useEffect(() => registerPanel(compositionId, mount), [compositionId, mount]);
  const owner = useDockOwner(compositionId, mount);
  // Where the panel is rendered, and where the recitation starts: the same unless the panel sits
  // beside the recitation's <Sequence> (a slot).
  const ownStart = useOwnSequenceStart();
  const frameOffset = panelProps.frameOffset ?? ownStart;
  // As long as the recitation is shown: the slot's box when it says (its `durationInFrames` wins
  // over the resolver's), so no marker lands past the box's end.
  const frames = panelProps.durationInFrames ?? slotDurationOf(panelProps.props);
  return (
    // The timeline markers are rendered where the panel is (Sequences register where they are
    // rendered), in a Sequence of their own at the recitation's start in a slot; the dock is
    // portaled out of it.
    <>
      <DoubtMarkers
        props={view.base}
        {...(panelProps.frameOffset === undefined ? {} : {from: frameOffset - ownStart, durationInFrames: frames})}
      />
      {owner ? <StudioDock panelProps={panelProps} view={view} frameOffset={frameOffset} /> : null}
    </>
  );
};

/**
 * A cheap fingerprint of `resolved`: enough to notice a new resolution without comparing the data.
 * The counts alone miss a re-alignment that keeps them, so the session, the last edit and the sum
 * of the word starts are in it too. An ayah text has its ayahs, a page its pages, where a
 * recitation has its lines.
 */
const resolvedSignature = (props: StudioCompositionProps | null): string => {
  if (props === null) return 'null';
  const resolved = resolvedOf(props);
  if (!resolved) return `none:${slotErrorOf(props) ?? ''}`;
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
    resolved.durationInFrames ?? '',
  ].join(':');
};

/**
 * The composition re-renders on every frame; the panel must not. Every top-level prop is compared
 * by identity (Remotion hands the composition the same group objects frame after frame, and a new
 * one when anything in it changed), `resolved` by a fingerprint, so a `calculateMetadata()` that
 * rebuilt the same data leaves the dock alone.
 */
const propsEqual = (a: MushafStudioPanelProps, b: MushafStudioPanelProps): boolean => {
  if (
    a.compositionId !== b.compositionId ||
    a.project !== b.project ||
    a.initialTab !== b.initialTab ||
    a.propsKey !== b.propsKey ||
    a.kind !== b.kind ||
    a.frameOffset !== b.frameOffset ||
    a.durationInFrames !== b.durationInFrames
  )
    return false;
  if (a.props === null || b.props === null) return a.props === b.props;
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
 *
 * In a template (a drop-in slot renders it beside its `<Sequence>`, so it stays on every frame),
 * `propsKey` puts every save under that key of the template's props, `frameOffset` says where the
 * recitation starts, and `props` may be `null` (no recitation yet: give `kind`; the panel opens on
 * Source). Several panels in one composition show one dock, with a picker between them.
 */
export const MushafStudioPanel: React.FC<MushafStudioPanelProps> = (panelProps) => {
  // Only the environment hook before this check: outside the Studio's preview nothing of the dock
  // (and nothing of `document`) is touched.
  const inStudio = useInStudio();
  if (!inStudio) return null;
  // Every frame, past the memo: what Export project, Copy description and Set thumbnail read when clicked.
  const {compositionId, propsKey, props} = panelProps;
  rememberPanelProps(
    propsKey ? {compositionId, propsKey} : compositionId,
    props ?? emptySlotPropsFor(kindOf(panelProps)),
  );
  return <StudioPanel {...panelProps} />;
};
