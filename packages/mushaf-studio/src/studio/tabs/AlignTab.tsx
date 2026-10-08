import type * as React from 'react';
import {useState} from 'react';
import {timingsFromQud} from '../../qud';
import type {QudDevice, QudModel, QudRiwayah, QudStage} from '../../qud/types';
import {alignWithCache} from '../align-cache';
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
  t as tNow,
  useStudioState,
  useT,
} from '../store';
import {baseName, isUrl, readPublicFile, slugify, stemOf} from '../studio-api';
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

/** Align: sends a recording of `public/` to the QUD Universal Aligner and writes the timings it returns. */
export const AlignTab: React.FC<TabProps> = ({compositionId, props, project}) => {
  const {uploadedAudio, busy, progress, session} = useStudioState();
  const t = useT();
  const [model, setModel] = useState<QudModel>(session?.model ?? 'Base');
  const [device, setDevice] = useState<QudDevice>(session?.device ?? 'GPU');
  const [riwayah, setRiwayah] = useState<QudRiwayah>(session?.riwayah ?? 'hafs');
  /** The riwayah the user confirmed aligning against the Hafs mushaf; another one asks again. */
  const [confirmedRiwayah, setConfirmedRiwayah] = useState<QudRiwayah | null>(null);
  const [token, setToken] = useState(() => getHfToken());
  const [remembered, setRemembered] = useState(() => isHfTokenRemembered());
  // The recording the user just put into public/ wins over whatever the composition plays, a downloaded clip included.
  const audio = uploadedAudio ?? (isUrl(props.audioFile) || !props.audioFile ? null : props.audioFile);
  const working = busy !== null;
  // The page is the Hafs print: another riwayah aligns only once the user has said it may not match.
  const otherRiwayah = riwayah !== 'hafs';
  const confirmed = !otherRiwayah || confirmedRiwayah === riwayah;

  const align = () => {
    if (!audio || !confirmed) return;
    const client = {token: token || null};
    void runStudioTask(tNow('align.busy.reading'), async () => {
      const blob = await readPublicFile(audio);
      const name = baseName(audio);
      setStudioState({busy: tNow('align.busy.checking')});
      const result = await alignWithCache({
        audio: blob,
        fileName: name,
        align: {model, device, riwayah, onProgress: (step) => setStudioState({progress: step})},
        client,
        now: () => Date.now(),
        onUpload: () => setStudioState({busy: tNow('align.busy.aligning')}),
        onAligned: () => setStudioState({busy: tNow('align.busy.wordTimes'), progress: null}),
      });
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
      await saveRecording({
        compositionId,
        props,
        project,
        audioFile: audio,
        timings,
        timingsName: `${stem}.timings.json`,
      });
    });
  };

  return (
    <div>
      <Section title={t('align.audioTitle')}>
        {audio ? (
          <p style={{margin: '0 0 8px'}}>
            <span style={styles.code}>public/{audio}</span>
          </p>
        ) : (
          <Note>{t('align.noAudio')}</Note>
        )}
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
          disabled={working || !audio || !confirmed}
          title={confirmed ? undefined : t('align.riwayahConfirmFirst')}
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
