// Step 3: an ayah translation from quran.com under the lines, and optionally its word-by-word
// gloss along the bottom. Both are fetched for the whole surah into the memory store, again when
// the surah changes, so the ayah range can change without a request.
import {listQuranComTranslations, type QuranComResource} from '@tlawat/mushaf-studio';
import * as React from 'react';
import {memoryFiles} from '../memory-files';
import {setGloss, setTranslation, type WebProject} from '../project';
import {loadGlossFile, loadTranslationFile, translationLanguages, translationsIn} from '../sources';
import {errorMessage, type ProjectUpdate, Step} from '../ui';

export type TextStepProps = {
  readonly project: WebProject;
  readonly update: ProjectUpdate;
};

export const TextStep: React.FC<TextStepProps> = ({project, update}) => {
  const [resources, setResources] = React.useState<readonly QuranComResource[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [language, setLanguage] = React.useState('en');
  const [glossOn, setGlossOn] = React.useState(false);
  const [translationState, setTranslationState] = React.useState<{loading: boolean; error: string | null}>({
    loading: false,
    error: null,
  });
  const [glossState, setGlossState] = React.useState<{loading: boolean; error: string | null}>({
    loading: false,
    error: null,
  });

  const live = React.useRef(true);
  // Set on mount too: StrictMode mounts, unmounts and mounts again.
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // On mount, and again from the error's Try again.
  const loadList = React.useCallback(() => {
    setListError(null);
    listQuranComTranslations().then(
      (list) => live.current && setResources(list),
      (cause: unknown) => live.current && setListError(errorMessage(cause)),
    );
  }, []);
  React.useEffect(loadList, [loadList]);

  const languages = React.useMemo(() => translationLanguages(resources ?? []), [resources]);
  const inLanguage = React.useMemo(() => translationsIn(resources ?? [], language), [resources, language]);
  const surah = project.recitation?.surah ?? 0;
  const {translationId, translationUrl, glossUrl} = project;

  // The translation of the current surah, fetched when it is missing.
  React.useEffect(() => {
    if (translationId === null || surah === 0 || translationUrl !== '') return;
    let live = true;
    setTranslationState({loading: true, error: null});
    loadTranslationFile({resourceId: translationId, surah}, memoryFiles).then(
      (url) => {
        if (!live) return;
        setTranslationState({loading: false, error: null});
        update((p) =>
          p.translationId === translationId && p.recitation?.surah === surah
            ? setTranslation(p, translationId, url)
            : p,
        );
      },
      (cause: unknown) => live && setTranslationState({loading: false, error: errorMessage(cause)}),
    );
    return () => {
      live = false;
    };
  }, [translationId, surah, translationUrl, update]);

  // The gloss of the current surah, in the translation's language.
  React.useEffect(() => {
    if (!glossOn || surah === 0 || glossUrl !== '') return;
    let live = true;
    setGlossState({loading: true, error: null});
    loadGlossFile({language, surah}, memoryFiles).then(
      (url) => {
        if (!live) return;
        setGlossState({loading: false, error: null});
        update((p) => (p.recitation?.surah === surah ? setGloss(p, url) : p));
      },
      (cause: unknown) => live && setGlossState({loading: false, error: errorMessage(cause)}),
    );
    return () => {
      live = false;
    };
  }, [glossOn, language, surah, glossUrl, update]);

  const onLanguage = (next: string) => {
    setLanguage(next);
    update((p) => setGloss(setTranslation(p, null), ''));
  };

  const onTranslation = (value: string) => {
    const id = value === '' ? null : Number(value);
    setTranslationState({loading: false, error: null});
    update((p) => setTranslation(p, id));
  };

  const onGloss = (on: boolean) => {
    setGlossOn(on);
    setGlossState({loading: false, error: null});
    if (!on) update((p) => setGloss(p, ''));
  };

  const ayahText = project.composition === 'ayah-text';
  return (
    <Step number={3} title="Text" id="step-text">
      <p className="hint">
        A translation from{' '}
        <a href="https://quran.com" target="_blank" rel="noreferrer">
          quran.com
        </a>{' '}
        under the lines.
      </p>
      {listError && (
        <p className="error" role="alert">
          The translations could not be listed: {listError}{' '}
          <button type="button" onClick={loadList}>
            Try again
          </button>
        </p>
      )}
      <label className="field">
        <span>Language</span>
        <select value={language} onChange={(event) => onLanguage(event.target.value)} disabled={!resources}>
          {!resources && <option value="en">Loading…</option>}
          {languages.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.name} ({entry.count})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Translation</span>
        <select
          value={translationId === null ? '' : String(translationId)}
          onChange={(event) => onTranslation(event.target.value)}
          disabled={!resources}
        >
          <option value="">None</option>
          {inLanguage.map((resource) => (
            <option key={resource.id} value={resource.id}>
              {resource.name}
              {resource.authorName && resource.authorName !== resource.name ? ` (${resource.authorName})` : ''}
            </option>
          ))}
        </select>
      </label>
      {translationState.loading && (
        <p className="status" role="status">
          Loading the translation…
        </p>
      )}
      {translationState.error && (
        <p className="error" role="alert">
          {translationState.error}
        </p>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={glossOn}
          disabled={ayahText}
          onChange={(event) => onGloss(event.target.checked)}
        />
        <span>
          Word-by-word gloss along the bottom
          {ayahText && <span className="muted"> (the mushaf lines only)</span>}
        </span>
      </label>
      {glossState.loading && (
        <p className="status" role="status">
          Loading the gloss…
        </p>
      )}
      {glossState.error && (
        <p className="error" role="alert">
          {glossState.error}
        </p>
      )}
    </Step>
  );
};
