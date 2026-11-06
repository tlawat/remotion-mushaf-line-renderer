import type * as React from 'react';
import {useEffect, useMemo, useRef} from 'react';
import {followsHostAudio, hostAudioOf} from '../../audio/host';
import {getChapterSegments, listRecitations, timingsFromCatalogue} from '../../qud';
import {isHafsRecitation} from '../../qud/riwayah';
import type {QudChapterSegments, QudRecitation} from '../../qud/types';
import {defaultSourceMode, hostOf, nowSourceOf, type SourceMode, VIDEO_EXTENSIONS} from '../audio-source';
import {followedTrack, type HostAudioTrack, studioTrackFile, useHostAudioTracks} from '../host-tracks';
import type {MessageKey} from '../i18n';
import {saveRecording} from '../recording';
import {
  describeError,
  getStudioState,
  loadOnce,
  runStudioTask,
  type StagedOrigin,
  setStudioState,
  targetKeyOf,
  t as tNow,
  useStudioDraft,
  useStudioState,
  useT,
  withEntry,
} from '../store';
import {
  AUDIO_EXTENSIONS,
  baseName,
  fileNameFor,
  freePublicPath,
  isUrl,
  patchProps,
  projectDir,
  projectPath,
  reevaluate,
  rememberTrackCopy,
  slugify,
  writeFile,
} from '../studio-api';
import {colors, styles} from '../styles';
import {ayahCount, surahLabel} from '../surahs';
import type {StudioCompositionProps, TabProps} from '../tab-props';
import {Button, Field, Note, NumberInput} from '../ui';
import {usePublicFiles} from '../use-public-files';

const groupByReciter = (catalogue: readonly QudRecitation[]): readonly [string, readonly QudRecitation[]][] => {
  const groups = new Map<string, QudRecitation[]>();
  for (const recitation of catalogue) {
    const list = groups.get(recitation.reciter.name_en) ?? [];
    list.push(recitation);
    groups.set(recitation.reciter.name_en, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

/** The files of `public/` Source offers: audio, and video whose sound Align decodes. */
const MEDIA_EXTENSIONS: readonly string[] = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

const MODES: readonly {readonly id: SourceMode; readonly label: MessageKey}[] = [
  {id: 'catalogue', label: 'source.mode.catalogue'},
  {id: 'upload', label: 'source.mode.upload'},
  {id: 'public', label: 'source.mode.public'},
  {id: 'track', label: 'source.mode.track'},
];

/** Keeps (or with `null` forgets) the one recording this target's Align works on next, and where it came from. */
const stage = (key: string, path: string | null, origin: StagedOrigin = 'upload') => {
  const state = getStudioState();
  setStudioState({
    uploadedAudio: withEntry(state.uploadedAudio, key, path ?? undefined),
    stagedFrom: withEntry(state.stagedFrom, key, path === null ? undefined : origin),
  });
};

/** `hostAudio` off, as a whole group, when the composition followed the template's track; nothing otherwise. */
const ownAudioAgain = (props: StudioCompositionProps) =>
  followsHostAudio(props) ? {hostAudio: {...hostAudioOf(props), enabled: false}} : {};

/** The file name at the end of a URL's path, decoded (`Take%201.mp3` is `Take 1.mp3`). */
const decodedName = (path: string): string => {
  try {
    return decodeURIComponent(baseName(path));
  } catch {
    return baseName(path);
  }
};

/** The line that says what the composition plays now, with the one action that fixes a stream. */
const NowLine: React.FC<TabProps> = ({target, props, project}) => {
  const t = useT();
  const {busy} = useStudioState();
  const now = nowSourceOf(props);
  // A stream, or a missing file the catalogue clip stands in for: one click puts the file into public/.
  const download = (url: string, host: string, path: string | null) =>
    void runStudioTask(tNow('source.busy.downloadNow', {host}), async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (path !== null) {
        // The file audioFile names: the timings were made of this very clip.
        await writeFile(path, bytes);
        reevaluate();
        setStudioState({notice: tNow('source.notice.downloaded', {path, host})});
        return;
      }
      const name = fileNameFor(decodedName(new URL(url).pathname) || 'audio.mp3');
      const written = await writeFile(freePublicPath(projectPath(project, name)), bytes);
      await patchProps(target, {audioFile: written});
      setStudioState({notice: tNow('source.notice.downloaded', {path: written, host})});
    });
  const line = (() => {
    switch (now.kind) {
      case 'none':
        return t('source.now.none');
      case 'track':
        return t('source.now.track', {
          track: now.track || baseName(now.file),
          file: isUrl(now.file) ? now.file : `public/${now.file}`,
          offset: now.offsetSeconds,
        });
      case 'missing':
        return t('source.now.missing', {path: now.path, host: now.host});
      case 'streaming':
        return t('source.now.streaming', {url: now.url, host: now.host});
      case 'catalogue':
        return now.host === null
          ? t('source.now.catalogueNoHost', {path: now.path})
          : t('source.now.catalogue', {path: now.path, host: now.host});
      case 'aligned':
        return t('source.now.aligned', {path: now.path});
      default:
        return t('source.now.file', {path: now.path});
    }
  })();
  const fix =
    now.kind === 'missing'
      ? () => download(now.url, now.host, now.path)
      : now.kind === 'streaming'
        ? () => download(now.url, now.host, null)
        : null;
  return (
    <div
      data-mushaf-control="source-now"
      data-now={now.kind}
      style={{
        ...styles.note,
        color: now.kind === 'missing' || now.kind === 'streaming' ? colors.warning : colors.text,
        marginTop: 0,
      }}
    >
      <span>{line}</span>
      {fix ? (
        <div style={{marginTop: 4}}>
          <Button onClick={fix} disabled={busy !== null}>
            {t('source.now.download')}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

/** One line, right above a choice's button: what pressing it replaces. */
const Replaces: React.FC<{readonly children: React.ReactNode}> = ({children}) => (
  <p style={styles.replaces} data-mushaf-control="source-replaces">
    {children}
  </p>
);

/** A failed clip download: nothing was saved; Retry, or stream from the clip's host on purpose. */
type FailedDownload = {readonly query: string; readonly host: string; readonly error: string};

/** Download from the catalogue: the reviewed timings from aligner.qud.dev, the clip from the host its answer names. */
const CatalogueSource: React.FC<TabProps> = ({target, props, project}) => {
  const {catalogue, busy, language} = useStudioState();
  const key = targetKeyOf(target);
  const t = useT();
  useEffect(() => {
    void loadOnce('catalogue', () => listRecitations());
  }, []);
  // The pickers in the store by target: a tab switch keeps what the user picked.
  const [slug, setSlug] = useStudioDraft(key, 'source.slug', '');
  const [chapterChoice, setChapterChoice] = useStudioDraft(key, 'source.chapter', 0);
  const [verses, setVerses] = useStudioDraft<{readonly from: number; readonly to: number} | null>(
    key,
    'source.verses',
    null,
  );
  /** The slug of the recitation in another riwayah the user confirmed using on the Hafs mushaf; another one asks again. */
  const [confirmedSlug, setConfirmedSlug] = useStudioDraft<string | null>(key, 'source.consent', null);
  /** The clip host the last answer named: the note names it from then on. */
  const [seenHost, setSeenHost] = useStudioDraft<string | null>(key, 'source.clipHost', null);
  const [failed, setFailed] = useStudioDraft<FailedDownload | null>(key, 'source.failed', null);
  const groups = useMemo(() => groupByReciter(catalogue ?? []), [catalogue]);

  const recitation = catalogue?.find((entry) => entry.slug === slug) ?? catalogue?.[0];
  const chapter = recitation?.chapters.includes(chapterChoice) ? chapterChoice : (recitation?.chapters[0] ?? 1);
  const count = ayahCount(chapter);
  const from = Math.max(1, Math.min(verses?.from ?? 1, count));
  const to = Math.max(from, Math.min(verses?.to ?? count, count));
  const working = busy !== null;
  // The page is the Hafs print: a recitation in another riwayah is used only once the user has said it may not match.
  const otherRiwayah = recitation !== undefined && !isHafsRecitation(recitation);
  const confirmed = !otherRiwayah || confirmedSlug === recitation.slug;
  const query = recitation ? {slug: recitation.slug, chapter, verseFrom: from, verseTo: to} : null;
  const querySignature = query ? JSON.stringify(query) : '';
  // The host is the answer's: until one came, the one these props were downloaded from, else unnamed.
  const now = nowSourceOf(props);
  const knownHost = seenHost ?? (now.kind === 'catalogue' ? now.host : null);

  const saveFrom = async (
    segments: QudChapterSegments,
    base: string,
    audio: string,
    notices: readonly string[],
  ): Promise<void> => {
    const timings = timingsFromCatalogue(segments, {audio});
    const saved = await saveRecording({
      target,
      props,
      project,
      audioFile: audio,
      timings,
      timingsName: `${base}.timings.json`,
    });
    const all = [...notices, ...saved.notices];
    setStudioState({notice: all.length > 0 ? all.join(' ') : null});
    // The clip is what Align would work on now, not an earlier upload.
    stage(key, null);
  };

  const run = (mode: 'download' | 'stream') => {
    if (!query || !recitation || !confirmed) return;
    void runStudioTask(tNow('source.busy.segments'), async () => {
      const segments = await getChapterSegments(query);
      const host = hostOf(segments.audio_url) ?? segments.audio_url;
      setSeenHost(host);
      const base = slugify(`${recitation.slug}-${chapter}-${from}-${to}`);
      if (mode === 'stream') {
        setFailed(null);
        await saveFrom(segments, base, segments.audio_url, [tNow('source.notice.streaming', {host})]);
        return;
      }
      setStudioState({busy: tNow('source.busy.clipFrom', {host}), notice: null});
      let audio: string;
      try {
        const response = await fetch(segments.audio_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        audio = await writeFile(projectPath(project, `${base}.mp3`), await response.arrayBuffer());
      } catch (error) {
        // Nothing is saved: a remote URL in audioFile is the user's choice (Stream), never a fallback.
        setFailed({query: JSON.stringify(query), host, error: describeError(error)});
        return;
      }
      setFailed(null);
      await saveFrom(segments, base, audio, []);
    });
  };

  if (catalogue === null) return <Note>{t('source.loadingCatalogue')}</Note>;
  const shownFailure = failed !== null && failed.query === querySignature ? failed : null;
  return (
    <>
      <Field label={t('source.reciter')}>
        {(id) => (
          <select id={id} style={styles.input} value={recitation?.slug ?? ''} onChange={(e) => setSlug(e.target.value)}>
            {groups.map(([name, entries]) => (
              <optgroup key={name} label={name}>
                {entries.map((entry) => (
                  <option key={entry.slug} value={entry.slug}>
                    {entry.riwayah} · {entry.style} · {entry.channel} · {entry.slug}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('source.surah')}>
        {(id) => (
          <select
            id={id}
            style={styles.input}
            value={chapter}
            onChange={(e) => {
              setChapterChoice(Number(e.target.value));
              setVerses(null);
            }}
          >
            {(recitation?.chapters ?? []).map((number) => (
              <option key={number} value={number}>
                {surahLabel(number, language)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div style={styles.row}>
        <span style={styles.label}>{t('source.ayahs')}</span>
        <NumberInput
          label={t('source.fromAyah')}
          value={from}
          min={1}
          max={count}
          onChange={(value) => setVerses({from: value, to: Math.max(value, to)})}
        />
        <span style={styles.label}>{t('source.to')}</span>
        <NumberInput
          label={t('source.toAyah')}
          value={to}
          min={from}
          max={count}
          onChange={(value) => setVerses({from, to: value})}
        />
        <span style={styles.label}>{t('source.of', {count})}</span>
      </div>
      <Note>
        {t('source.catalogue.does', {
          from,
          to,
          host: knownHost ?? t('source.catalogue.hostUnknown'),
          dir: projectDir(project),
        })}
      </Note>
      {otherRiwayah ? (
        <div data-mushaf-control="riwayah-warning">
          <p role="alert" style={{...styles.note, color: colors.warning}}>
            {t('source.riwayahWarning', {riwayah: recitation.riwayah})}
          </p>
          <label style={styles.row}>
            <input
              type="checkbox"
              data-mushaf-control="riwayah-confirm"
              checked={confirmedSlug === recitation.slug}
              onChange={(e) => setConfirmedSlug(e.target.checked ? recitation.slug : null)}
            />
            <span style={styles.label}>{t('source.riwayahConfirm', {riwayah: recitation.riwayah})}</span>
          </label>
        </div>
      ) : null}
      <Replaces>{t('source.replaces.recording')}</Replaces>
      <Button
        variant="primary"
        onClick={() => run('download')}
        disabled={working || !recitation || !confirmed}
        title={confirmed ? undefined : t('source.riwayahConfirmFirst', {riwayah: recitation?.riwayah ?? ''})}
      >
        {t('source.download')}
      </Button>
      {shownFailure ? (
        <div data-mushaf-control="download-failed" style={{marginTop: 8}}>
          <p role="alert" style={{...styles.note, color: colors.danger}}>
            {t('source.failed', {host: shownFailure.host, error: shownFailure.error})}
          </p>
          <div style={styles.row}>
            <Button onClick={() => run('download')} disabled={working || !confirmed}>
              {t('source.retry')}
            </Button>
            <Button onClick={() => run('stream')} disabled={working || !confirmed}>
              {t('source.stream', {host: shownFailure.host})}
            </Button>
          </div>
          <Note>{t('source.streamNote', {host: shownFailure.host})}</Note>
        </div>
      ) : null}
    </>
  );
};

/** Upload my recording: copied into `public/` (local only) and staged for Align, which uploads it. */
const UploadSource: React.FC<TabProps> = ({target, props, project}) => {
  const {busy, uploadedAudio, stagedFrom} = useStudioState();
  const key = targetKeyOf(target);
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const staged = uploadedAudio[key];
  const ready = staged !== undefined && (stagedFrom[key] ?? 'upload') === 'upload' && staged !== props.audioFile;
  const upload = (file: File) => {
    void runStudioTask(tNow('source.busy.copying'), async () => {
      // A free name: a file already there may be the recording the current timings were made of.
      const path = await writeFile(
        freePublicPath(projectPath(project, fileNameFor(file.name))),
        await file.arrayBuffer(),
      );
      stage(key, path, 'upload');
      setStudioState({notice: tNow('source.notice.copied', {name: file.name, path})});
    });
  };
  return (
    <>
      <Note>{t('source.upload.does', {dir: projectDir(project)})}</Note>
      <input
        ref={input}
        type="file"
        accept="audio/*,video/*"
        aria-label={t('source.upload.input')}
        disabled={busy !== null}
        style={{display: 'none'}}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = '';
        }}
      />
      <Replaces>{t('source.replaces.nothingYet')}</Replaces>
      <Button variant="primary" onClick={() => input.current?.click()} disabled={busy !== null}>
        {t('source.upload.button')}
      </Button>
      {ready ? (
        <div style={{marginTop: 8}}>
          <Note>{t('source.ready', {path: staged})}</Note>
          <Button onClick={() => setStudioState({tab: 'align'})}>{t('source.goToAlign')}</Button>
        </div>
      ) : null}
    </>
  );
};

/** A file already in `public/`: staged for Align (the default), or put in as the audio alone. */
const PublicSource: React.FC<TabProps> = ({target, props}) => {
  const {busy} = useStudioState();
  const key = targetKeyOf(target);
  const t = useT();
  const files = usePublicFiles(MEDIA_EXTENSIONS);
  const [choice, setChoice] = useStudioDraft(key, 'source.public', '');
  const [use, setUse] = useStudioDraft<'align' | 'replace'>(key, 'source.publicUse', 'align');
  const picked = choice || (isUrl(props.audioFile) ? '' : props.audioFile);
  const working = busy !== null;
  const stageIt = () => {
    if (!picked) return;
    stage(key, picked, 'public');
    setStudioState({tab: 'align', notice: tNow('source.notice.staged', {path: picked})});
  };
  const replace = () => {
    if (!picked) return;
    void runStudioTask(tNow('busy.updating'), async () => {
      await patchProps(target, {audioFile: picked, ...ownAudioAgain(props)});
      stage(key, null);
    });
  };
  if (files.length === 0) return <Note>{t('source.noPublicAudio')}</Note>;
  return (
    <>
      <select
        style={{...styles.input, marginBottom: 8}}
        aria-label={t('source.publicSelect')}
        value={picked}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">{t('common.pickFile')}</option>
        {files.map((file) => (
          <option key={file.name} value={file.name}>
            {t('source.fileSize', {name: file.name, size: Math.round(file.sizeInBytes / 1024)})}
          </option>
        ))}
      </select>
      <div role="radiogroup" aria-label={t('source.public.use')} style={{marginBottom: 6}}>
        {(['align', 'replace'] as const).map((entry) => (
          <label key={entry} style={{...styles.row, marginBottom: 2}}>
            <input
              type="radio"
              name={`mushaf-public-use-${key}`}
              checked={use === entry}
              onChange={() => setUse(entry)}
            />
            <span>{entry === 'align' ? t('source.public.align') : t('source.public.replace')}</span>
          </label>
        ))}
      </div>
      {use === 'align' ? (
        <>
          <Note>{t('source.public.alignDoes')}</Note>
          <Replaces>{t('source.replaces.nothingYet')}</Replaces>
          <Button variant="primary" onClick={stageIt} disabled={working || !picked}>
            {t('source.public.stage')}
          </Button>
        </>
      ) : (
        <>
          <p role="alert" style={{...styles.note, color: colors.warning}}>
            {t('source.public.replaceWarning', {timings: props.timingsFile ? `public/${props.timingsFile}` : '-'})}
          </p>
          <Replaces>{t('source.replaces.audioOnly')}</Replaces>
          <Button variant="primary" onClick={replace} disabled={working || !picked}>
            {t('source.public.replaceButton')}
          </Button>
        </>
      )}
    </>
  );
};

/** The track picker's key for a track: ids change on every mount, the file and the name do not. */
const trackKeyOf = (track: HostAudioTrack): string => `${track.src}\n${track.label}`;

/** The extension for the bytes of a `blob:` track, from their type. */
const extensionFor = (type: string): string => {
  const sub = type.split('/')[1]?.split(';')[0] ?? '';
  return sub === 'mpeg' ? 'mp3' : sub === 'mp4' && type.startsWith('audio') ? 'm4a' : slugify(sub) || 'bin';
};

/** A track in this video: the composition stops playing its own audio and follows the template's. */
const TrackSource: React.FC<TabProps & {readonly tracks: readonly HostAudioTrack[]}> = ({
  target,
  props,
  project,
  tracks,
}) => {
  const {busy} = useStudioState();
  const key = targetKeyOf(target);
  const t = useT();
  const [choice, setChoice] = useStudioDraft(key, 'source.track', '');
  const usable = tracks.filter((track) => track.limit === null);
  const picked = usable.find((track) => trackKeyOf(track) === choice) ?? usable[0] ?? null;
  const following = followsHostAudio(props);
  // The track followed now keeps its file: a blob: track's bytes are already in audioFile.
  const followed = following ? followedTrack(tracks, props.audioFile, hostAudioOf(props).track, studioTrackFile) : null;
  const isFollowed = picked !== null && picked.id === followed?.id;
  const pickedFile = picked ? studioTrackFile(picked) : null;
  const pickedName = isFollowed
    ? props.audioFile
    : pickedFile === null || pickedFile.kind === 'bytes'
      ? null
      : pickedFile.kind === 'public'
        ? pickedFile.path
        : pickedFile.url;
  const working = busy !== null;
  const use = () => {
    if (!picked) return;
    void runStudioTask(tNow('source.busy.track'), async () => {
      const file = studioTrackFile(picked);
      let audioFile: string;
      if (isFollowed) {
        audioFile = props.audioFile;
      } else if (file === null || file.kind === 'bytes') {
        // A blob: or data: URL is gone after a reload, and a render never sees it: its bytes go into
        // public/, once (rememberTrackCopy()): using the track again maps back to that file.
        const response = await fetch(file?.url ?? picked.src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        audioFile = await writeFile(
          freePublicPath(projectPath(project, `track.${extensionFor(blob.type)}`)),
          await blob.arrayBuffer(),
        );
        rememberTrackCopy(picked.src, audioFile);
      } else {
        audioFile = file.kind === 'public' ? file.path : file.url;
      }
      const same = audioFile === props.audioFile;
      await patchProps(target, {
        audioFile,
        hostAudio: {enabled: true, offsetSeconds: picked.offsetSeconds, track: picked.label},
      });
      stage(key, null);
      setStudioState({
        notice: tNow(same ? 'source.notice.trackedSame' : 'source.notice.tracked', {track: picked.label}),
      });
    });
  };
  const stop = () =>
    void runStudioTask(tNow('busy.updating'), async () => {
      await patchProps(target, ownAudioAgain(props));
      setStudioState({notice: tNow('source.notice.untracked', {file: props.audioFile})});
    });
  const optionLabel = (track: HostAudioTrack): string =>
    [
      t('source.track.option', {
        label: track.label,
        kind: t(track.kind === 'video' ? 'source.track.kind.video' : 'source.track.kind.audio'),
        offset: track.offsetSeconds,
      }),
      track.limit === 'rate'
        ? t('source.track.limit.rate')
        : track.limit === 'loop'
          ? t('source.track.limit.loop')
          : '',
    ]
      .filter(Boolean)
      .join(' ');
  return (
    <>
      {tracks.length === 0 ? (
        <Note>{t('source.track.none')}</Note>
      ) : (
        <>
          <Field label={t('source.track.select')}>
            {(id) => (
              <select
                id={id}
                style={styles.input}
                value={picked ? trackKeyOf(picked) : ''}
                onChange={(e) => setChoice(e.target.value)}
              >
                {tracks.map((track) => (
                  <option key={track.id} value={trackKeyOf(track)} disabled={track.limit !== null}>
                    {optionLabel(track)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {picked ? (
            <>
              <Note>
                {t('source.track.does', {
                  file: pickedName === null ? t('source.track.toPublic') : pickedName,
                  offset: picked.offsetSeconds,
                })}
              </Note>
              <Replaces>
                {pickedName === props.audioFile ? t('source.replaces.trackSame') : t('source.replaces.track')}
              </Replaces>
              <Button variant="primary" onClick={use} disabled={working}>
                {t('source.track.use')}
              </Button>
            </>
          ) : (
            <Note>{t('source.track.noneUsable')}</Note>
          )}
        </>
      )}
      {following ? (
        <div style={{marginTop: 8}}>
          <Button variant="ghost" onClick={stop} disabled={working}>
            {t('source.track.stop')}
          </Button>
        </div>
      ) : null}
    </>
  );
};

/**
 * Source: where the composition's audio comes from, as one explicit choice (the catalogue, an own
 * recording, a file already in `public/`, a track the template plays), each with one button and
 * a line that says what it replaces, under a "Now:" line that says what plays now.
 */
export const SourceTab: React.FC<TabProps> = (tabProps) => {
  const {target, props, frameOffset} = tabProps;
  const {uploadedAudio, stagedFrom} = useStudioState();
  const key = targetKeyOf(target);
  const t = useT();
  const tracks = useHostAudioTracks(frameOffset);
  const [choice, setChoice] = useStudioDraft<SourceMode | null>(key, 'source.mode', null);
  const staged = {path: uploadedAudio[key] ?? null, origin: stagedFrom[key] ?? ('upload' as const)};
  // The template's tracks are offered once it has one (or the composition already follows one).
  const withTracks = tracks.length > 0 || followsHostAudio(props);
  const modes = MODES.filter((mode) => mode.id !== 'track' || withTracks);
  const wanted = choice ?? defaultSourceMode(props, staged);
  const mode = modes.some((entry) => entry.id === wanted) ? wanted : 'catalogue';
  return (
    <div>
      <NowLine {...tabProps} />
      <div role="radiogroup" aria-label={t('source.modes')} style={styles.segments} data-mushaf-control="source-mode">
        {modes.map((entry) => (
          <label key={entry.id} data-mode={entry.id} style={styles.segment(entry.id === mode)}>
            {/* A real radio, drawn as the segment around it: the keyboard and screen readers know it. */}
            <input
              type="radio"
              name={`mushaf-source-mode-${key}`}
              checked={entry.id === mode}
              onChange={() => setChoice(entry.id)}
              style={styles.hiddenRadio}
            />
            {t(entry.label)}
          </label>
        ))}
      </div>
      {mode === 'catalogue' ? <CatalogueSource {...tabProps} /> : null}
      {mode === 'upload' ? <UploadSource {...tabProps} /> : null}
      {mode === 'public' ? <PublicSource {...tabProps} /> : null}
      {mode === 'track' ? <TrackSource {...tabProps} tracks={tracks} /> : null}
    </div>
  );
};
