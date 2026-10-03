import {recitedRange} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useEffect, useMemo, useState} from 'react';
import {
  fetchQuranComTranslation,
  fetchQuranComWordGloss,
  listQuranComTranslations,
  serialiseTranslation,
} from '../../translations';
import {loadOnce, runStudioTask, useStudioState} from '../store';
import {JSON_EXTENSIONS, patchProps, projectPath, slugify, writeFile} from '../studio-api';
import {styles} from '../styles';
import {resolvedOf, type TabProps} from '../tab-props';
import {Button, Field, Note, Section} from '../ui';
import {usePublicFiles} from '../use-public-files';

type FileField = 'translationFile' | 'glossFile' | 'transliterationFile';

/** Text: an ayah translation and a word gloss from quran.com into `public/`, or any file already there. */
export const TextTab: React.FC<TabProps> = ({compositionId, props, project}) => {
  const {quranComResources, busy} = useStudioState();
  useEffect(() => {
    void loadOnce('quranComResources', () => listQuranComTranslations({}));
  }, []);
  const [language, setLanguage] = useState('en');
  const [resourceChoice, setResourceChoice] = useState(0);
  const [glossLanguage, setGlossLanguage] = useState('en');
  const [publicChoice, setPublicChoice] = useState('');
  const jsonFiles = usePublicFiles(JSON_EXTENSIONS);
  const resolved = resolvedOf(props);
  const timings = resolved?.timings ?? null;

  const languages = useMemo(() => {
    const map = new Map<string, string>();
    for (const resource of quranComResources ?? [])
      if (!map.has(resource.language)) map.set(resource.language, resource.languageName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [quranComResources]);
  const resources = useMemo(
    () => (quranComResources ?? []).filter((resource) => resource.language === language),
    [quranComResources, language],
  );
  const resource = resources.find((r) => r.id === resourceChoice) ?? resources[0];
  const working = busy !== null;

  const passage = timings
    ? (() => {
        const range = recitedRange(timings);
        return {
          chapter: timings.surah,
          fromAyah: props.fromAyah > 0 ? props.fromAyah : range.fromAyah,
          toAyah: props.toAyah > 0 ? props.toAyah : range.toAyah,
        };
      })()
    : null;

  const setFile = (field: FileField, path: string) =>
    void runStudioTask('Updating the composition...', () => patchProps(compositionId, {text: {[field]: path}}));

  const fetchTranslation = () => {
    if (!resource || !passage) return;
    const id = resource.id;
    void runStudioTask(`Fetching ${resource.name}...`, async () => {
      const translation = await fetchQuranComTranslation({resourceId: id, ...passage});
      const path = await writeFile(projectPath(project, `translation-${id}.json`), serialiseTranslation(translation));
      await patchProps(compositionId, {text: {translationFile: path}});
    });
  };

  const fetchGloss = (field: 'translation' | 'transliteration') => {
    if (!passage) return;
    const lang = slugify(glossLanguage) || 'en';
    const prop: FileField = field === 'translation' ? 'glossFile' : 'transliterationFile';
    void runStudioTask(`Fetching the word ${field}...`, async () => {
      const gloss = await fetchQuranComWordGloss({field, language: lang, ...passage});
      const name = field === 'translation' ? `gloss-${lang}.json` : `transliteration-${lang}.json`;
      const path = await writeFile(projectPath(project, name), serialiseTranslation(gloss));
      await patchProps(compositionId, {text: {[prop]: path}});
    });
  };

  const current = (field: FileField): string => props.text[field] || 'none';

  return (
    <div>
      {passage ? null : <Note>Fetching needs the timings: pick a recitation or align a recording first.</Note>}
      <Section title="Ayah translation">
        <Note>Now: {current('translationFile')}</Note>
        {quranComResources === null ? (
          <Note>Loading quran.com's translation list...</Note>
        ) : (
          <>
            <Field label="Language">
              {(id) => (
                <select
                  id={id}
                  style={styles.input}
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setResourceChoice(0);
                  }}
                >
                  {languages.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({code})
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Translation">
              {(id) => (
                <select
                  id={id}
                  style={styles.input}
                  value={resource?.id ?? ''}
                  onChange={(e) => setResourceChoice(Number(e.target.value))}
                >
                  {resources.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} — {entry.authorName}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div style={styles.row}>
              <Button variant="primary" onClick={fetchTranslation} disabled={working || !resource || !passage}>
                Fetch for this passage
              </Button>
              <Button onClick={() => setFile('translationFile', '')} disabled={working || !props.text.translationFile}>
                None
              </Button>
            </div>
          </>
        )}
      </Section>
      <Section title="Word by word">
        <Note>
          Gloss: {current('glossFile')}; transliteration: {current('transliterationFile')}
        </Note>
        <Field label="Language (quran.com code, en, ur, id, ...)">
          {(id) => (
            <input
              id={id}
              style={styles.input}
              value={glossLanguage}
              onChange={(e) => setGlossLanguage(e.target.value)}
            />
          )}
        </Field>
        <div style={styles.row}>
          <Button onClick={() => fetchGloss('translation')} disabled={working || !passage}>
            Fetch translation
          </Button>
          <Button onClick={() => fetchGloss('transliteration')} disabled={working || !passage}>
            Fetch transliteration
          </Button>
          <Button onClick={() => setFile('glossFile', '')} disabled={working || !props.text.glossFile}>
            No gloss
          </Button>
          <Button
            onClick={() => setFile('transliterationFile', '')}
            disabled={working || !props.text.transliterationFile}
          >
            No transliteration
          </Button>
        </div>
      </Section>
      <Section title="Use a file from public/">
        {jsonFiles.length === 0 ? (
          <Note>No JSON file in public/ yet.</Note>
        ) : (
          <>
            <select
              style={styles.input}
              aria-label="JSON file in public/"
              value={publicChoice}
              onChange={(e) => setPublicChoice(e.target.value)}
            >
              <option value="">Pick a file</option>
              {jsonFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
            <div style={{...styles.row, marginTop: 6}}>
              <Button onClick={() => setFile('translationFile', publicChoice)} disabled={working || !publicChoice}>
                As translation
              </Button>
              <Button onClick={() => setFile('glossFile', publicChoice)} disabled={working || !publicChoice}>
                As gloss
              </Button>
              <Button onClick={() => setFile('transliterationFile', publicChoice)} disabled={working || !publicChoice}>
                As transliteration
              </Button>
            </div>
          </>
        )}
        <Note>
          Files downloaded from QUL (qul.tarteel.ai, login needed) can be dropped into public/ and chosen here in any of
          QUL's shapes: key/value, nested arrays, footnotes as tags, inline footnotes, text chunks, word by word.
        </Note>
      </Section>
    </div>
  );
};
