// Step 1: a reviewed recitation from the QUD catalogue, a surah it covers and the ayahs to show.
// The chapter's timings go into the memory store; the audio streams from the catalogue's clip URL.
// The page is the Hafs print, so a recitation in another riwayah loads only once the user confirms.
import {isHafsRecitation, listRecitations, type QudRecitation, surahEnglishName} from '@tlawat/mushaf-studio';
import * as React from 'react';
import {memoryFiles} from '../memory-files';
import {pickRecitation, setRange, type WebProject} from '../project';
import {defaultRecitationSlug, groupByReciter, loadCatalogueChapter, recitationOptionLabel} from '../sources';
import {errorMessage, type ProjectUpdate, Step} from '../ui';

export type RecitationStepProps = {
  readonly project: WebProject;
  readonly update: ProjectUpdate;
};

export const RecitationStep: React.FC<RecitationStepProps> = ({project, update}) => {
  const [catalogue, setCatalogue] = React.useState<readonly QudRecitation[] | null>(null);
  const [catalogueError, setCatalogueError] = React.useState<string | null>(null);
  const [slug, setSlug] = React.useState('');
  const [surah, setSurah] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The slug of the recitation in another riwayah the user confirmed using on the Hafs mushaf. */
  const [confirmedSlug, setConfirmedSlug] = React.useState<string | null>(null);
  const request = React.useRef(0);
  const live = React.useRef(true);
  // Set on mount too: StrictMode mounts, unmounts and mounts again.
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // On mount, and again from the error's Try again.
  const loadCatalogue = React.useCallback(() => {
    setCatalogueError(null);
    listRecitations().then(
      (list) => {
        if (!live.current) return;
        setCatalogue(list);
        setSlug(defaultRecitationSlug(list));
      },
      (cause: unknown) => live.current && setCatalogueError(errorMessage(cause)),
    );
  }, []);
  React.useEffect(loadCatalogue, [loadCatalogue]);

  const groups = React.useMemo(() => groupByReciter(catalogue ?? []), [catalogue]);
  const recitation = catalogue?.find((entry) => entry.slug === slug);
  /** Whether `entry` may load: a Hafs recitation, or one the user confirmed. */
  const allowed = (entry: QudRecitation): boolean => isHafsRecitation(entry) || confirmedSlug === entry.slug;

  const load = (entry: QudRecitation, chapter: number) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    loadCatalogueChapter({recitation: entry, surah: chapter}, memoryFiles).then(
      (picked) => {
        if (id !== request.current) return;
        setLoading(false);
        update((p) => pickRecitation(p, picked));
      },
      (cause: unknown) => {
        if (id !== request.current) return;
        setLoading(false);
        setError(errorMessage(cause));
      },
    );
  };

  const onReciter = (next: string) => {
    setSlug(next);
    const entry = catalogue?.find((e) => e.slug === next);
    if (!entry) return;
    if (surah !== 0 && entry.chapters.includes(surah)) {
      if (allowed(entry)) load(entry, surah);
    } else setSurah(0);
  };

  const onSurah = (next: number) => {
    setSurah(next);
    if (recitation && next !== 0 && allowed(recitation)) load(recitation, next);
  };

  const onConfirm = (entry: QudRecitation, checked: boolean) => {
    setConfirmedSlug(checked ? entry.slug : null);
    if (checked && surah !== 0 && entry.chapters.includes(surah)) load(entry, surah);
  };

  const picked = project.recitation;
  return (
    <Step number={1} title="Recitation" id="step-recitation">
      <p className="hint">
        A reviewed, word-aligned recitation from the{' '}
        <a href="https://aligner.qud.dev" target="_blank" rel="noreferrer">
          QUD Universal Aligner
        </a>{' '}
        catalogue.
      </p>
      {catalogueError && (
        <p className="error" role="alert">
          The catalogue could not be loaded: {catalogueError}{' '}
          <button type="button" onClick={loadCatalogue}>
            Try again
          </button>
        </p>
      )}
      <label className="field">
        <span>Reciter</span>
        <select
          value={slug}
          onChange={(event) => onReciter(event.target.value)}
          disabled={!catalogue}
          aria-busy={!catalogue && !catalogueError}
        >
          {!catalogue && <option value="">Loading the catalogue…</option>}
          {groups.map((group) => (
            <optgroup key={group.reciter} label={group.reciter}>
              {group.recitations.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {group.reciter} · {recitationOptionLabel(entry)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {recitation && !isHafsRecitation(recitation) && (
        <div className="riwayah-warning">
          <p className="warning" role="alert">
            This recitation is in the {recitation.riwayah} riwayah, but the mushaf drawn here is the Hafs print (KFGQPC
            V4): its words and their spelling can differ, so the words highlighted may not be the words recited, and
            some may stay untimed.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmedSlug === recitation.slug}
              onChange={(event) => onConfirm(recitation, event.target.checked)}
            />
            <span>Use the {recitation.riwayah} recitation with the Hafs mushaf anyway</span>
          </label>
        </div>
      )}
      <label className="field">
        <span>Surah</span>
        <select value={surah} onChange={(event) => onSurah(Number(event.target.value))} disabled={!recitation}>
          <option value={0}>Choose a surah…</option>
          {recitation?.chapters.map((chapter) => (
            <option key={chapter} value={chapter}>
              {chapter}. {surahEnglishName(chapter)}
            </option>
          ))}
        </select>
      </label>
      {loading && (
        <p className="status" role="status">
          Loading the recitation…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {picked && (
        <fieldset className="range">
          <legend>
            Ayahs{' '}
            <span className="muted">
              (timed: {picked.first === picked.last ? picked.first : `${picked.first}–${picked.last}`})
            </span>
          </legend>
          <label className="field inline">
            <span>From</span>
            <input
              type="number"
              inputMode="numeric"
              min={picked.first}
              max={picked.last}
              value={project.fromAyah}
              onChange={(event) => {
                const from = Number(event.target.value);
                update((p) => setRange(p, from, p.toAyah));
              }}
            />
          </label>
          <label className="field inline">
            <span>To</span>
            <input
              type="number"
              inputMode="numeric"
              min={picked.first}
              max={picked.last}
              value={project.toAyah}
              onChange={(event) => {
                const to = Number(event.target.value);
                update((p) => setRange(p, p.fromAyah, to));
              }}
            />
          </label>
        </fieldset>
      )}
    </Step>
  );
};
