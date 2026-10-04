// Step 4: the video rendered in this browser (WebCodecs), or the command that renders it on a
// machine; the captions; and what may be published.
import * as React from 'react';
import {saveFile} from '../download';
import {captionFiles} from '../export';
import {buildProps, fileStem, makeCommand, STYLE_FILE, styleProps, type WebProject} from '../project';
import type {FormatCheck} from '../render';
import type {ResolvedVideo} from '../resolve';
import {errorMessage, Step} from '../ui';

// The web renderer and its encoders are most of the page's weight: loaded once the Export step has a video.
const loadRenderer = () => import('../render');

export const LICENSING_URL =
  'https://github.com/tlawat/remotion-mushaf-line-renderer/blob/main/docs/mushaf-studio/licensing.md';

export type ExportStepProps = {
  readonly project: WebProject;
  /** The resolved video, `null` while there is none. */
  readonly video: ResolvedVideo | null;
};

type RenderState =
  | {readonly kind: 'idle'}
  | {readonly kind: 'rendering'; readonly progress: number}
  | {
      readonly kind: 'done';
      readonly url: string;
      readonly name: string;
      readonly size: number;
      /** The video it was rendered from: a file of other props is not offered. */
      readonly from: ResolvedVideo;
    }
  | {readonly kind: 'failed'; readonly message: string};

const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;

const duration = (video: ResolvedVideo): string => {
  const seconds = Math.round(video.spec.durationInFrames / video.spec.fps);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const ExportStep: React.FC<ExportStepProps> = ({project, video}) => {
  const [check, setCheck] = React.useState<FormatCheck | null>(null);
  const [rendered, setState] = React.useState<RenderState>({kind: 'idle'});
  const state: RenderState = rendered.kind === 'done' && rendered.from !== video ? {kind: 'idle'} : rendered;
  const abort = React.useRef<AbortController | null>(null);
  const width = video?.spec.width ?? 0;
  const height = video?.spec.height ?? 0;

  React.useEffect(() => {
    if (width === 0) return;
    let live = true;
    loadRenderer()
      .then((renderer) => renderer.pickWebFormat({width, height}))
      .then(
        (result) => live && setCheck(result),
        (cause: unknown) => live && setCheck({format: null, issues: [errorMessage(cause)]}),
      );
    return () => {
      live = false;
    };
  }, [width, height]);

  // A finished file's object URL lives until the next render replaces it, or the page closes the step.
  React.useEffect(() => {
    if (rendered.kind !== 'done') return;
    const url = rendered.url;
    return () => URL.revokeObjectURL(url);
  }, [rendered]);

  React.useEffect(() => () => abort.current?.abort(), []);

  const stem = fileStem(project);
  const format = check?.format ?? null;

  const render = () => {
    if (!video || !format) return;
    const controller = new AbortController();
    abort.current = controller;
    setState({kind: 'rendering', progress: 0});
    loadRenderer()
      .then((renderer) =>
        renderer.renderInBrowser(video, format, {
          signal: controller.signal,
          onProgress: (progress) => setState({kind: 'rendering', progress}),
        }),
      )
      .then(
        (blob) => {
          if (controller.signal.aborted) return;
          const name = `${stem}.${format.extension}`;
          setState({kind: 'done', url: URL.createObjectURL(blob), name, size: blob.size, from: video});
        },
        (cause: unknown) =>
          setState(controller.signal.aborted ? {kind: 'idle'} : {kind: 'failed', message: errorMessage(cause)}),
      );
  };

  const cancel = () => {
    abort.current?.abort();
    setState({kind: 'idle'});
  };

  const saveStyle = () => {
    const props = buildProps(project).props;
    saveFile(STYLE_FILE, `${JSON.stringify(styleProps(props), null, 2)}\n`, 'application/json');
  };

  const captions = React.useMemo(() => (video ? captionFiles(video.props.resolved.timings, stem) : []), [video, stem]);
  const fromQud = project.recitation !== null;
  return (
    <Step number={4} title="Export" id="step-export">
      {!video && <p className="hint">The export is ready once the preview shows the video.</p>}
      {video && (
        <>
          <p className="hint">
            {video.spec.width}×{video.spec.height}, {video.spec.fps} fps, {duration(video)}.
          </p>
          {check === null && (
            <p className="status" role="status">
              Checking what this browser can encode…
            </p>
          )}
          {format && (
            <div className="render">
              {state.kind !== 'rendering' && (
                <button type="button" className="primary" onClick={render}>
                  Render {format.extension.toUpperCase()} in this browser
                </button>
              )}
              {state.kind === 'rendering' && (
                <>
                  <label className="field">
                    <span>Rendering… {Math.round(state.progress * 100)}%</span>
                    <progress value={state.progress} max={1} />
                  </label>
                  <button type="button" onClick={cancel}>
                    Cancel
                  </button>
                </>
              )}
              {state.kind === 'done' && (
                <p>
                  <a className="download" href={state.url} download={state.name}>
                    Download {state.name}
                  </a>{' '}
                  <span className="muted">({megabytes(state.size)})</span>
                </p>
              )}
              {state.kind === 'failed' && (
                <p className="error" role="alert">
                  The render failed: {state.message}
                </p>
              )}
              <p className="hint">
                The render runs on this device, frame by frame: keep the tab in front. A minute of video takes a few
                minutes.
              </p>
            </div>
          )}
          {check !== null && (
            <details className="machine" open={format === null}>
              <summary>{format ? 'Or render on your machine' : 'Render on your machine'}</summary>
              {!format && (
                <p className="hint">
                  This browser cannot encode video here
                  {check.issues.length > 0 ? `: ${check.issues.join(' ')}` : '.'}
                </p>
              )}
              <ol>
                <li>
                  Clone the repository and set up the Mushaf Studio app (its README: <code>bun install</code>,{' '}
                  <code>bun run build</code>, <code>bun run fonts-packages:fill</code>).
                </li>
                <li>
                  <button type="button" onClick={saveStyle}>
                    Download {STYLE_FILE}
                  </button>{' '}
                  into <code>apps/mushaf-studio</code>.
                </li>
                <li>
                  In <code>apps/mushaf-studio</code>, run:
                  <pre>
                    <code>{makeCommand(project)}</code>
                  </pre>
                </li>
              </ol>
              {project.glossUrl !== '' && (
                <p className="hint">The word gloss is not part of the command: add it in the Studio’s Text tab.</p>
              )}
            </details>
          )}
          <h3>Captions</h3>
          <div className="captions">
            {captions.map((file) => (
              <button key={file.name} type="button" onClick={() => saveFile(file.name, file.text, file.type)}>
                {file.label}
              </button>
            ))}
          </div>
          <p className="hint">SRT word by word, WebVTT ayah by ayah, and Remotion’s caption JSON.</p>
        </>
      )}
      <h3>What you may publish</h3>
      <p className="notice">
        The KFGQPC page fonts that draw the text are © King Fahd Glorious Qur’an Printing Complex, published by QUL, and
        carry a notice reserving printing and publishing to the Complex’s permission and to charitable (sadaqa) use: a
        free video shared as sadaqa is the use it describes; a monetised channel, a paid course or a client project
        needs the Complex’s permission. The recitation belongs to its reciter or publisher
        {fromQud
          ? '; the timings are CC-BY-4.0, credit “Timings: QUD Universal Aligner (aligner.qud.dev), CC-BY-4.0”'
          : ''}
        ; name the translation you show.{' '}
        <a href={LICENSING_URL} target="_blank" rel="noreferrer">
          What you may publish, in full
        </a>
        .
      </p>
    </Step>
  );
};
