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
import {quranTextName} from '../recording';
import {loadOnce, runStudioTask, setStudioState, t as tNow, useStudioState, useT} from '../store';
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
  const t = useT();
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
    void runStudioTask(path ? tNow('text.busy.checking') : tNow('busy.updating'), async () => {
      if (path) {
        // `fetch` wrapped, not referenced: the native one throws "Illegal invocation" as another object's method.
        const io = {fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), staticFile};
        await loadTextFile(KIND[field], field, path, io);
      }
      setStudioState({busy: tNow('busy.updating')});
      await patchProps(compositionId, {text: {[field]: path}});
    });

  /** `-<surah>-<from>-<to>`: two compositions of one project keep their own files. */
  const suffix = passage ? `-${passage.chapter}-${passage.fromAyah}-${passage.toAyah}` : '';

  const fetchTranslation = () => {
    if (!resource || !passage) return;
    const id = resource.id;
    void runStudioTask(tNow('text.busy.fetching', {name: resource.name}), async () => {
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
    void runStudioTask(tNow('text.busy.text', {script: chosen}), async () => {
      const text = await fetchQuranComText({...passage, script: chosen});
      const path = await writeFile(projectPath(project, quranTextName(chosen, passage)), serialiseAyahWords(text));
      if (!isAyahTextProps(props)) {
        setStudioState({notice: tNow('text.notice.writtenRecitation', {path})});
        return;
      }
      const font = unicodeFontOf(props.font);
      if (font.script !== chosen) {
        setStudioState({
          notice: tNow('text.notice.wrongScript', {path, font: font.id, fontScript: font.script, script: chosen}),
        });
        return;
      }
      setStudioState({busy: tNow('busy.updating')});
      await patchProps(compositionId, {textFile: path});
      setStudioState({notice: tNow('text.notice.textFileSet', {path})});
    });
  };

  const fetchGloss = (field: 'translation' | 'transliteration') => {
    if (!passage) return;
    const lang = slugify(glossLanguage) || 'en';
    const prop: FileField = field === 'translation' ? 'glossFile' : 'transliterationFile';
    void runStudioTask(
      tNow(field === 'translation' ? 'text.busy.wordTranslation' : 'text.busy.wordTransliteration'),
      async () => {
        const gloss = await fetchQuranComWordGloss({field, language: lang, ...passage});
        const name = field === 'translation' ? `gloss-${lang}${suffix}.json` : `transliteration-${lang}${suffix}.json`;
        const path = await writeFile(projectPath(project, name), serialiseTranslation(gloss));
        await patchProps(compositionId, {text: {[prop]: path}});
      },
    );
  };

  const current = (field: FileField): string => props.text[field] || t('common.none');
  // An ayah text paints no word gloss or transliteration: the controls would set props it ignores.
  const words = !isAyahTextProps(props);

  return (
    <div>
      {passage ? null : <Note>{t('text.needsTimings')}</Note>}
      <Section title={t('text.quranText')}>
        <Note>
          {isAyahTextProps(props)
            ? t('text.now', {file: props.textFile || t('common.none')})
            : t('text.recitationNeedsNoText')}
        </Note>
        <Field label={t('text.script')}>
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
          {t('text.fetchText')}
        </Button>
      </Section>
      <Section title={t('text.ayahTranslation')}>
        <Note>{t('text.now', {file: current('translationFile')})}</Note>
        {quranComResources === null ? (
          <Note>{t('text.loadingList')}</Note>
        ) : (
          <>
            <Field label={t('text.language')}>
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
            <Field label={t('text.translation')}>
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
                {t('text.fetchForPassage')}
              </Button>
              <Button onClick={() => setFile('translationFile', '')} disabled={working || !props.text.translationFile}>
                {t('text.none')}
              </Button>
            </div>
          </>
        )}
      </Section>
      {words ? (
        <Section title={t('text.wordByWord')}>
          <Note>
            {t('text.glossNow', {gloss: current('glossFile'), transliteration: current('transliterationFile')})}
          </Note>
          <Field label={t('text.glossLanguage')}>
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
              {t('text.fetchWordTranslation')}
            </Button>
            <Button onClick={() => fetchGloss('transliteration')} disabled={working || !passage}>
              {t('text.fetchWordTransliteration')}
            </Button>
            <Button onClick={() => setFile('glossFile', '')} disabled={working || !props.text.glossFile}>
              {t('text.noGloss')}
            </Button>
            <Button
              onClick={() => setFile('transliterationFile', '')}
              disabled={working || !props.text.transliterationFile}
            >
              {t('text.noTransliteration')}
            </Button>
          </div>
        </Section>
      ) : (
        <Note>{t('text.glossOnlyRecitation')}</Note>
      )}
      <Section title={t('text.publicTitle')}>
        {jsonFiles.length === 0 ? (
          <Note>{t('text.noJson')}</Note>
        ) : (
          <>
            <select
              style={styles.input}
              aria-label={t('text.jsonSelect')}
              value={publicChoice}
              onChange={(e) => setPublicChoice(e.target.value)}
            >
              <option value="">{t('common.pickFile')}</option>
              {jsonFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name}
                </option>
              ))}
            </select>
            <div style={{...styles.row, marginTop: 6}}>
              <Button onClick={() => setFile('translationFile', publicChoice)} disabled={working || !publicChoice}>
                {t('text.asTranslation')}
              </Button>
              {words ? (
                <>
                  <Button onClick={() => setFile('glossFile', publicChoice)} disabled={working || !publicChoice}>
                    {t('text.asGloss')}
                  </Button>
                  <Button
                    onClick={() => setFile('transliterationFile', publicChoice)}
                    disabled={working || !publicChoice}
                  >
                    {t('text.asTransliteration')}
                  </Button>
                </>
              ) : null}
            </div>
          </>
        )}
        <Note>{t('text.qulNote')}</Note>
      </Section>
    </div>
  );
};
