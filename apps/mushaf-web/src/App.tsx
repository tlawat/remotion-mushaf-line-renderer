// Mushaf Studio Web: the steps on the left, the preview on the right. The page holds one project
// (plain data, see project.ts), builds the composition's props from it, resolves them with the
// package's resolvers against the memory files, and hands the result to the `<Player>` and to the
// in-browser render.
import * as React from 'react';
import {memoryFiles} from './memory-files';
import {Preview} from './Preview';
import {buildProps, initialProject, missingInput, setComposition, setText, type WebProject} from './project';
import {type ResolvedVideo, resolveVideo} from './resolve';
import {loadQuranTextFile} from './sources';
import {ExportStep} from './steps/ExportStep';
import {LookStep} from './steps/LookStep';
import {RecitationStep} from './steps/RecitationStep';
import {TextStep} from './steps/TextStep';
import {errorMessage, type ProjectUpdate} from './ui';

export type AppProps = {
  /** The project to open on; tests start from a loaded one. */
  readonly initial?: WebProject | undefined;
};

export const App: React.FC<AppProps> = ({initial = initialProject}) => {
  const [project, setProject] = React.useState<WebProject>(initial);
  const [video, setVideo] = React.useState<ResolvedVideo | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const update: ProjectUpdate = React.useCallback((change) => setProject(change), []);

  // `<MushafAyahText>` reads the Quran text from a file: fetch the surah's once it is shown.
  const surah = project.recitation?.surah ?? 0;
  const needsText = project.composition === 'ayah-text' && surah !== 0 && project.textUrl === '';
  React.useEffect(() => {
    if (!needsText) return;
    let live = true;
    loadQuranTextFile({surah}, memoryFiles).then(
      (url) => live && update((p) => (p.recitation?.surah === surah ? setText(p, url) : p)),
      (cause: unknown) => live && setError(errorMessage(cause)),
    );
    return () => {
      live = false;
    };
  }, [needsText, surah, update]);

  const waiting = missingInput(project);
  const built = React.useMemo(() => buildProps(project), [project]);
  React.useEffect(() => {
    if (waiting !== null) return;
    const controller = new AbortController();
    setError(null);
    resolveVideo(built, {signal: controller.signal}).then(
      (resolved) => !controller.signal.aborted && setVideo(resolved),
      (cause: unknown) => !controller.signal.aborted && setError(errorMessage(cause)),
    );
    return () => controller.abort();
  }, [built, waiting]);

  return (
    <div className="page">
      <header className="masthead">
        <h1>Mushaf Studio</h1>
        <p>A word-synced recitation video of the printed mushaf, made in your browser. Nothing to install.</p>
      </header>
      <main className="layout">
        <div className="steps">
          <RecitationStep project={project} update={update} />
          <LookStep project={project} update={update} />
          <TextStep project={project} update={update} />
          <ExportStep project={project} video={video && video.composition === project.composition ? video : null} />
        </div>
        <div className="aside">
          <Preview
            composition={project.composition}
            onComposition={(composition) => update((p) => setComposition(p, composition))}
            video={video}
            waiting={waiting}
            error={error}
          />
        </div>
      </main>
      <footer className="footer">
        <p>
          Built on{' '}
          <a href="https://github.com/tlawat/remotion-mushaf-line-renderer" target="_blank" rel="noreferrer">
            @tlawat/mushaf-studio
          </a>{' '}
          and <a href="https://www.remotion.dev">Remotion</a>. Mushaf data and fonts from{' '}
          <a href="https://qul.tarteel.ai">QUL</a>, recitations and timings from{' '}
          <a href="https://aligner.qud.dev">QUD</a>, translations from <a href="https://quran.com">quran.com</a>.
        </p>
      </footer>
    </div>
  );
};
