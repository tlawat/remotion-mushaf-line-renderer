import {recitedRange} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useEffect, useMemo, useState} from 'react';
import {staticFile} from 'remotion';
import {loadTextFile} from '../../compositions/shared';
import {
  fetchQuranComTranslation,
  fetchQuranComWordGloss,
  listQuranComTranslations,
  serialiseTranslation,
} from '../../translations';
import {unicodeFontOf} from '../../unicode/font';
import {fetchQuranComText, QURAN_TEXT_SCRIPTS, type QuranTextScript, serialiseAyahWords} from '../../unicode/text';
import {loadOnce, runStudioTask, setStudioState, useStudioState} from '../store';
import {JSON_EXTENSIONS, patchProps, projectPath, slugify, writeFile} from '../studio-api';
import {styles} from '../styles';
import {isAyahTextProps, resolvedOf, type TabProps} from '../tab-props';
import {Button, Field, Note, Section} from '../ui';
import {usePublicFiles} from '../use-public-files';

type FileField = 'translationFile' | 'glossFile' | 'transliterationFile';

/** What each prop takes: `loadTextFile()` refuses the other kind before it reaches the props. */
const KIND: Readonly<Record<FileField, 'ayah' | 'word'>> = {
  translationFile: 'ayah',
  glossFile: 'word',
  transliterationFile: 'word',
};

/**
 * Text: the Quran text of the passage (what `<MushafAyahText>` sets), an ayah translation and a word
 * gloss from quran.com into `public/`, or any file already there.
 */
export const TextTab: React.FC<TabProps> = ({compositionId, props, project}) => {
  const {quranComResources, busy} = useStudioState();
  useEffect(() => {
    void loadOnce('quranComResources', () => listQuranComTranslations({}));
  }, []);
  // An ayah text starts on the script its font sets: a text in another one would not resolve.
  const [script, setScript] = useState<QuranTextScript>(() =>
    isAyahTextProps(props) ? unicodeFontOf(props.font).script : 'uthmani',
  );
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

  /**
   * Points a prop at a file (`''` for none). A file of the wrong kind is refused here, in the status
   * line: saved, it would fail `calculateMetadata()` and the composition would not mount.
   */
  const setFile = (field: FileField, path: string) =>
    void runStudioTask(path ? 'Checking the file...' : 'Updating the composition...', async () => {
      if (path) {
        // `fetch` wrapped, not referenced: the native one throws "Illegal invocation" as another object's method.
        const io = {fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), staticFile};
        await loadTextFile(KIND[field], field, path, io);
      }
      setStudioState({busy: 'Updating the composition...'});
      await patchProps(compositionId, {text: {[field]: path}});
    });

  /** `-<surah>-<from>-<to>`: two compositions of one project keep their own files. */
  const suffix = passage ? `-${passage.chapter}-${passage.fromAyah}-${passage.toAyah}` : '';

  const fetchTranslation = () => {
    if (!resource || !passage) return;
    const id = resource.id;
    void runStudioTask(`Fetching ${resource.name}...`, async () => {
      const translation = await fetchQuranComTranslation({resourceId: id, ...passage});
      const name = `translation-${id}${suffix}.json`;
      const path = await writeFile(projectPath(project, name), serialiseTranslation(translation));
      await patchProps(compositionId, {text: {translationFile: path}});
    });
  };

  /**
   * Writes the passage's text in `script` into the project. Only `<MushafAyahText>` reads it (its
   * `textFile`), and only a text in its font's script: anything else is written and named, not set.
   */
  const fetchText = () => {
    if (!passage) return;
    const chosen = script;
    void runStudioTask(`Fetching the ${chosen} text...`, async () => {
      const text = await fetchQuranComText({...passage, script: chosen});
      const path = await writeFile(projectPath(project, `text-${chosen}${suffix}.json`), serialiseAyahWords(text));
      if (!isAyahTextProps(props)) {
        setStudioState({
          notice: `public/${path} is written. This composition sets the printed lines and reads no Quran text; a MushafAyahText composition reads it as its textFile.`,
        });
        return;
      }
      const font = unicodeFontOf(props.font);
      if (font.script !== chosen) {
        setStudioState({
          notice: `public/${path} is written, but textFile is left as it is: font "${font.id}" sets ${font.script} text, not ${chosen}.`,
        });
        return;
      }
      setStudioState({busy: 'Updating the composition...'});
      await patchProps(compositionId, {textFile: path});
      setStudioState({notice: `public/${path} is written and is now the composition's textFile.`});
    });
  };

  const fetchGloss = (field: 'translation' | 'transliteration') => {
    if (!passage) return;
    const lang = slugify(glossLanguage) || 'en';
    const prop: FileField = field === 'translation' ? 'glossFile' : 'transliterationFile';
    void runStudioTask(`Fetching the word ${field}...`, async () => {
      const gloss = await fetchQuranComWordGloss({field, language: lang, ...passage});
      const name = field === 'translation' ? `gloss-${lang}${suffix}.json` : `transliteration-${lang}${suffix}.json`;
      const path = await writeFile(projectPath(project, name), serialiseTranslation(gloss));
      await patchProps(compositionId, {text: {[prop]: path}});
    });
  };

  const current = (field: FileField): string => props.text[field] || 'none';

  return (
    <div>
      {passage ? null : <Note>Fetching needs the timings: pick a recitation or align a recording first.</Note>}
      <Section title="Quran text">
        <Note>
          {isAyahTextProps(props)
            ? `Now: ${props.textFile || 'none'}`
            : 'The printed lines need no text file; a MushafAyahText composition reads this one as its textFile.'}
        </Note>
        <Field label="Script">
          {(id) => (
            <select
              id={id}
              style={styles.input}
              value={script}
              onChange={(e) => setScript(e.target.value as QuranTextScript)}
            >
              {QURAN_TEXT_SCRIPTS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button variant="primary" onClick={fetchText} disabled={working || !passage}>
          Fetch the text of this passage
        </Button>
      </Section>
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
