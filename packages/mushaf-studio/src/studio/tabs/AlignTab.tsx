import type * as React from 'react';
import {useState} from 'react';
import {alignAudio, sessionTimestamps, timingsFromQud} from '../../qud';
import type {QudDevice, QudModel, QudRiwayah, QudStage} from '../../qud/types';
import {getHfToken, runStudioTask, setHfToken, setStudioState, useStudioState} from '../store';
import {baseName, isUrl, patchProps, projectPath, readPublicFile, slugify, stemOf, writeJsonFile} from '../studio-api';
import {colors, styles} from '../styles';
import type {TabProps} from '../tab-props';
import {Button, Field, Note, ProgressBar, Section} from '../ui';

const STAGES: Readonly<Record<QudStage, string>> = {
  queued_gpu: 'Queued for the GPU',
  queued_cpu: 'Queued for the CPU',
  segmenting: 'Segmenting',
  transcribing: 'Transcribing',
  matching: 'Matching to the mushaf',
  recovering: 'Recovering missed words',
  building: 'Building the segments',
};

const MODELS: readonly QudModel[] = ['Base', 'Large'];
const DEVICES: readonly QudDevice[] = ['GPU', 'CPU'];
const RIWAYAT: readonly QudRiwayah[] = ['hafs', 'warsh', 'qalun', 'shuba'];

/** Align: sends a recording of `public/` to the QUD Universal Aligner and writes the timings it returns. */
export const AlignTab: React.FC<TabProps> = ({compositionId, props, project}) => {
  const {uploadedAudio, busy, progress, session} = useStudioState();
  const [model, setModel] = useState<QudModel>(session?.model ?? 'Base');
  const [device, setDevice] = useState<QudDevice>(session?.device ?? 'GPU');
  const [riwayah, setRiwayah] = useState<QudRiwayah>(session?.riwayah ?? 'hafs');
  const [token, setToken] = useState(() => getHfToken());
  // The recording the user just put into public/ wins over whatever the composition plays, a downloaded clip included.
  const audio = uploadedAudio ?? (isUrl(props.audioFile) || !props.audioFile ? null : props.audioFile);
  const working = busy !== null;

  const align = () => {
    if (!audio) return;
    const options = {token: token || null};
    void runStudioTask('Reading the audio...', async () => {
      const blob = await readPublicFile(audio);
      const name = baseName(audio);
      setStudioState({busy: 'Aligning...'});
      const response = await alignAudio(
        blob,
        name,
        {model, device, riwayah, onProgress: (step) => setStudioState({progress: step})},
        options,
      );
      const notices: string[] = [];
      if (response.device && response.device !== device)
        notices.push(`The aligner ran on the ${response.device}, the ${device} was not available.`);
      if (response.warning) notices.push(response.warning);
      setStudioState({busy: 'Fetching the word times...', progress: null});
      const timestamps = await sessionTimestamps(response.audio_id, {}, options);
      const timings = timingsFromQud(
        {align: response, timestamps},
        {audio, model, device: response.device ?? device, riwayah},
      );
      const stem = slugify(stemOf(name)) || 'audio';
      const timingsFile = await writeJsonFile(projectPath(project, `${stem}.timings.json`), timings);
      setStudioState({
        session: {audioId: response.audio_id, align: response, audio, model, device, riwayah},
        notice: notices.length > 0 ? notices.join(' ') : null,
      });
      setStudioState({busy: 'Updating the composition...'});
      await patchProps(compositionId, {audioFile: audio, timingsFile, fromAyah: 0, toAyah: 0, splits: []});
    });
  };

  return (
    <div>
      <Section title="Audio to align">
        {audio ? (
          <p style={{margin: '0 0 8px'}}>
            <span style={styles.code}>public/{audio}</span>
          </p>
        ) : (
          <Note>
            The composition plays a URL or nothing yet. Put a recording into public/ in the Source tab (own recording,
            or a file already there) to align it.
          </Note>
        )}
      </Section>
      <Section title="Options">
        <div style={styles.row}>
          <Field label="Model">
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
          <Field label="Device">
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
          <Field label="Riwayah">
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
        <Field label="Hugging Face token (optional, for your own GPU quota)">
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
        <Note>
          The token is kept in this browser tab's sessionStorage only: never written to a file, to the props or to the
          Root file, and sent to the aligner alone.
        </Note>
      </Section>
      <Section title="Align">
        <Note>
          Your audio leaves this machine only when you press Align: it is uploaded to the QUD Universal Aligner
          (aligner.qud.dev), which keeps it for a few hours; the alignment it returns is CC-BY-4.0.
        </Note>
        <Button variant="primary" onClick={align} disabled={working || !audio}>
          Align
        </Button>
        {progress ? (
          <div style={{marginTop: 8}}>
            <div style={styles.row}>
              <span>{STAGES[progress.stage as QudStage] ?? progress.stage}</span>
              <span style={{color: colors.muted}}>
                {progress.step}/{progress.steps}
              </span>
            </div>
            <ProgressBar ratio={progress.steps > 0 ? progress.step / progress.steps : 0} />
          </div>
        ) : null}
        {session ? (
          <Note>
            Last alignment in this session: public/{session.audio} ({session.model}, {session.device}, {session.riwayah}
            ), session {session.audioId.slice(0, 8)}. Split and re-align in Review use it.
          </Note>
        ) : null}
      </Section>
    </div>
  );
};
