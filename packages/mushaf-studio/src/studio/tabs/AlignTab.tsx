import type * as React from 'react';
import {useState} from 'react';
import {hostAudioOf} from '../../audio/host';
import {audioToWav} from '../../audio/wav';
import {alignUrl, sessionTimestamps, timingsFromQud} from '../../qud';
import type {QudAlignOptions, QudClientOptions, QudDevice, QudModel, QudRiwayah, QudStage} from '../../qud/types';
import {alignWithCache} from '../align-cache';
import {type AlignSource, alignSourceOf, hostOf, isVideoFile} from '../audio-source';
import type {MessageKey} from '../i18n';
import {saveRecording} from '../recording';
import {
  forgetHfToken,
  getHfToken,
  isHfTokenRemembered,
  rememberHfToken,
  runStudioTask,
  setHfToken,
  setStudioState,
  targetKeyOf,
  t as tNow,
  useStudioDraft,
  useStudioState,
  useT,
} from '../store';
import {baseName, readPublicFile, slugify, stemOf} from '../studio-api';
import {colors, styles} from '../styles';
import type {TabProps} from '../tab-props';
import {Button, Field, Note, ProgressBar, Section} from '../ui';

const STAGES: Readonly<Record<QudStage, MessageKey>> = {
  queued_gpu: 'align.stage.queuedGpu',
  queued_cpu: 'align.stage.queuedCpu',
  segmenting: 'align.stage.segmenting',
  transcribing: 'align.stage.transcribing',
  matching: 'align.stage.matching',
  recovering: 'align.stage.recovering',
  building: 'align.stage.building',
};

const MODELS: readonly QudModel[] = ['Base', 'Large'];
const DEVICES: readonly QudDevice[] = ['GPU', 'CPU'];
const RIWAYAT: readonly QudRiwayah[] = ['hafs', 'warsh', 'qalun', 'shuba'];

/** `HH:MM` of a `Date.now()`, for "aligned at". */
const clock = (at: number): string => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** The recording Align sends, as the tab names it: a path of `public/`, or the URL. */
const audioOf = (source: AlignSource): string | null =>
  source.kind === 'file' ? source.path : source.kind === 'url' ? source.url : null;

/** Where the recording came from, in the words of the tab. */
const OriginLine: React.FC<{readonly source: AlignSource; readonly track: string}> = ({source, track}) => {
  const t = useT();
  if (source.kind === 'none') return <Note>{t('align.noAudio')}</Note>;
  if (source.kind === 'catalogue') return <Note>{t('align.catalogue')}</Note>;
  const audio = source.kind === 'file' ? `public/${source.path}` : source.url;
  const line =
    source.origin === 'track'
      ? t('align.from.track', {track: track || baseName(audio)})
      : source.kind === 'url'
        ? t('align.from.url', {host: hostOf(source.url) ?? source.url})
        : t(
            source.origin === 'upload'
              ? 'align.from.upload'
              : source.origin === 'public'
                ? 'align.from.public'
                : 'align.from.current',
          );
  return (
    <div data-mushaf-control="align-source" data-origin={source.origin}>
      <p style={{margin: '0 0 8px'}}>
        <span style={styles.code}>{audio}</span>
      </p>
      <Note>{line}</Note>
      {isVideoFile(audio) ? <Note>{t('align.video')}</Note> : null}
    </div>
  );
};

/**
 * What the aligner answers for `source`: a file of `public/` read through the dev server (a
 * video's sound decoded into a WAV first, `audioToWav()`), or a URL fetched by the browser, both
 * through `alignWithCache()`; a URL the browser may not fetch (CORS) is downloaded by the aligner
 * itself (`alignUrl()`), with no cache.
 */
const alignSource = async (
  source: Extract<AlignSource, {kind: 'file' | 'url'}>,
  align: QudAlignOptions,
  client: QudClientOptions,
) => {
  let blob: Blob | null = null;
  let name = baseName(source.kind === 'file' ? source.path : new URL(source.url).pathname) || 'audio';
  if (source.kind === 'file') {
    blob = await readPublicFile(source.path);
  } else {
    blob = await fetch(source.url)
      .then((response) => (response.ok ? response.blob() : null))
      .catch(() => null);
  }
  if (blob === null && source.kind === 'url') {
    setStudioState({busy: tNow('align.busy.byUrl', {host: hostOf(source.url) ?? source.url})});
    const response = await alignUrl(source.url, align, client);
    setStudioState({busy: tNow('align.busy.wordTimes'), progress: null});
    const timestamps = await sessionTimestamps(response.audio_id, {}, client);
    return {align: response, timestamps, reused: false, alignedAt: null, name};
  }
  if (blob !== null && isVideoFile(name)) {
    setStudioState({busy: tNow('align.busy.decoding')});
    blob = await audioToWav(blob, name);
    name = `${stemOf(name)}.wav`;
  }
  setStudioState({busy: tNow('align.busy.checking')});
  const result = await alignWithCache({
    audio: blob!,
    fileName: name,
    align,
    client,
    now: () => Date.now(),
    onUpload: () => setStudioState({busy: tNow('align.busy.aligning')}),
    onAligned: () => setStudioState({busy: tNow('align.busy.wordTimes'), progress: null}),
  });
  return {...result, name};
};

/**
 * Align: sends the one recording Source staged for this target (or, when none is, what the
 * composition plays) to the QUD Universal Aligner, says where it came from and where it goes
 * before it sends anything, and writes the timings it returns. A recording the catalogue already
 * timed is not sent.
 */
export const AlignTab: React.FC<TabProps> = ({target, props, project}) => {
  const {busy, progress, session, uploadedAudio: uploads, stagedFrom} = useStudioState();
  const key = targetKeyOf(target);
  const t = useT();
  // The options in the store by target: a tab switch keeps what the user chose.
  const [model, setModel] = useStudioDraft<QudModel>(key, 'align.model', session?.model ?? 'Base');
  const [device, setDevice] = useStudioDraft<QudDevice>(key, 'align.device', session?.device ?? 'GPU');
  const [riwayah, setRiwayah] = useStudioDraft<QudRiwayah>(key, 'align.riwayah', session?.riwayah ?? 'hafs');
  /** The riwayah the user confirmed aligning against the Hafs mushaf; another one asks again. */
  const [confirmedRiwayah, setConfirmedRiwayah] = useStudioDraft<QudRiwayah | null>(key, 'align.consent', null);
  const [token, setToken] = useState(() => getHfToken());
  const [remembered, setRemembered] = useState(() => isHfTokenRemembered());
  // The one recording Source chose: staged there, else what the composition plays.
  const source = alignSourceOf(props, {path: uploads[key] ?? null, origin: stagedFrom[key] ?? 'upload'});
  const audio = audioOf(source);
  const track = hostAudioOf(props).track;
  const working = busy !== null;
  // The page is the Hafs print: another riwayah aligns only once the user has said it may not match.
  const otherRiwayah = riwayah !== 'hafs';
  const confirmed = !otherRiwayah || confirmedRiwayah === riwayah;

  const align = () => {
    if (audio === null || (source.kind !== 'file' && source.kind !== 'url') || !confirmed) return;
    const client = {token: token || null};
    void runStudioTask(tNow('align.busy.reading'), async () => {
      const result = await alignSource(
        source,
        {model, device, riwayah, onProgress: (step) => setStudioState({progress: step})},
        client,
      );
      const {name} = result;
      const response = result.align;
      const notices: string[] = [];
      if (result.reused && result.alignedAt !== null)
        notices.push(tNow('align.notice.reused', {time: clock(result.alignedAt)}));
      if (response.device && response.device !== device)
        notices.push(tNow('align.notice.device', {used: response.device, asked: device}));
      if (response.warning) notices.push(response.warning);
      const timings = timingsFromQud(
        {align: response, timestamps: result.timestamps},
        {audio, model, device: response.device ?? device, riwayah},
      );
      const stem = slugify(stemOf(name)) || 'audio';
      // The session first: split and re-align work on it even when the text below cannot be fetched.
      setStudioState({
        session: {audioId: response.audio_id, align: response, audio, model, device, riwayah},
        notice: notices.length > 0 ? notices.join(' ') : null,
      });
      const saved = await saveRecording({
        target,
        props,
        project,
        audioFile: audio,
        timings,
        timingsName: `${stem}.timings.json`,
        // The template's track stays the one played; any other recording is the composition's own.
        keepHostAudio: source.origin === 'track',
      });
      const all = [...notices, ...saved.notices];
      setStudioState({notice: all.length > 0 ? all.join(' ') : null});
    });
  };

  return (
    <div>
      <Section title={t('align.audioTitle')}>
        <OriginLine source={source} track={track} />
      </Section>
      <Section title={t('align.options')}>
        <div style={styles.row}>
          <Field label={t('align.model')}>
            {(id) => (
              <select id={id} style={styles.input} value={model} onChange={(e) => setModel(e.target.value as QudModel)}>
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('align.device')}>
            {(id) => (
              <select
                id={id}
                style={styles.input}
                value={device}
                onChange={(e) => setDevice(e.target.value as QudDevice)}
              >
                {DEVICES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('align.riwayah')}>
            {(id) => (
              <select
                id={id}
                style={styles.input}
                value={riwayah}
                onChange={(e) => setRiwayah(e.target.value as QudRiwayah)}
              >
                {RIWAYAT.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {otherRiwayah ? (
          <div data-mushaf-control="riwayah-warning">
            <p role="alert" style={{...styles.note, color: colors.warning}}>
              {t('align.riwayahWarning', {riwayah})}
            </p>
            <label style={styles.row}>
              <input
                type="checkbox"
                data-mushaf-control="riwayah-confirm"
                checked={confirmedRiwayah === riwayah}
                onChange={(e) => setConfirmedRiwayah(e.target.checked ? riwayah : null)}
              />
              <span style={styles.label}>{t('align.riwayahConfirm', {riwayah})}</span>
            </label>
          </div>
        ) : null}
        <Field label={t('align.token')}>
          {(id) => (
            <input
              id={id}
              type="password"
              style={styles.input}
              value={token}
              autoComplete="off"
              onChange={(e) => {
                setToken(e.target.value);
                setHfToken(e.target.value);
              }}
            />
          )}
        </Field>
        <div style={styles.row}>
          <label style={styles.row}>
            <input
              type="checkbox"
              data-mushaf-control="remember-token"
              checked={remembered}
              onChange={(e) => {
                rememberHfToken(e.target.checked);
                setRemembered(e.target.checked);
              }}
            />
            <span style={styles.label}>{t('align.remember')}</span>
          </label>
          <Button
            variant="ghost"
            disabled={!token && !remembered}
            onClick={() => {
              forgetHfToken();
              setToken('');
              setRemembered(false);
            }}
          >
            {t('align.forget')}
          </Button>
        </div>
        <Note>{remembered ? t('align.tokenRemembered') : t('align.tokenSession')}</Note>
      </Section>
      <Section title={t('align.title')}>
        <Note>{t('align.consent')}</Note>
        <Button
          variant="primary"
          onClick={align}
          disabled={working || audio === null || !confirmed}
          title={
            source.kind === 'catalogue' ? t('align.catalogue') : confirmed ? undefined : t('align.riwayahConfirmFirst')
          }
        >
          {t('align.button')}
        </Button>
        {progress ? (
          <div style={{marginTop: 8}}>
            <div style={styles.row}>
              <span>{STAGES[progress.stage as QudStage] ? t(STAGES[progress.stage as QudStage]) : progress.stage}</span>
              <span style={{color: colors.muted}}>
                {progress.step}/{progress.steps}
              </span>
            </div>
            <ProgressBar ratio={progress.steps > 0 ? progress.step / progress.steps : 0} />
          </div>
        ) : null}
        {session ? (
          <Note>
            {t('align.lastSession', {
              audio: session.audio,
              model: session.model,
              device: session.device,
              riwayah: session.riwayah,
              id: session.audioId.slice(0, 8),
            })}
          </Note>
        ) : null}
      </Section>
    </div>
  );
};
