import {recitedRanges} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useEffect, useMemo, useState} from 'react';
import {staticFile} from 'remotion';
import {loadTextFile} from '../../compositions/shared';
import {
  fetchChapterInfo,
  fetchQuranComTafsir,
  listQuranComTafsirs,
  serialiseChapterInfo,
  serialiseTafsir,
} from '../../content';
import type {QuranComResource} from '../../translations';
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
import {
  endCardOf,
  hasEndCard,
  hasTranslationLayers,
  isAyahTextProps,
  isPageProps,
  MAX_TRANSLATION_LAYERS,
  newTranslationLayer,
  resolvedOf,
  type TabProps,
  type TranslationLayer,
  textFileOf,
  textGroupOf,
  translationLayersOf,
  translationLayersPatch,
} from '../tab-props';
import {Button, Field, Note, Section} from '../ui';
import {usePublicFiles} from '../use-public-files';

type FileField = 'translationFile' | 'glossFile' | 'transliterationFile';

/** What each prop takes: `loadTextFile()` refuses the other kind before it reaches the props. */
const KIND: Readonly<Record<FileField, 'ayah' | 'word'>> = {
  translationFile: 'ayah',
  glossFile: 'word',
  transliterationFile: 'word',
};

/** quran.com's resources grouped by language: `[code, name]`, by name. */
const languagesOf = (resources: readonly QuranComResource[] | null): readonly (readonly [string, string])[] => {
  const map = new Map<string, string>();
  for (const resource of resources ?? [])
    if (!map.has(resource.language)) map.set(resource.language, resource.languageName);
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
};

/** A language and a resource of it, from one of quran.com's lists. */
const ResourcePicker: React.FC<{
  readonly resources: readonly QuranComResource[];
  readonly language: string;
  readonly onLanguage: (language: string) => void;
  readonly resource: QuranComResource | undefined;
  readonly onResource: (id: number) => void;
  readonly label: string;
}> = ({resources, language, onLanguage, resource, onResource, label}) => {
  const t = useT();
  const languages = useMemo(() => languagesOf(resources), [resources]);
  const ofLanguage = resources.filter((entry) => entry.language === language);
  return (
    <>
      <Field label={t('text.language')}>
        {(id) => (
          <select id={id} style={styles.input} value={language} onChange={(e) => onLanguage(e.target.value)}>
            {languages.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={label}>
        {(id) => (
          <select
            id={id}
            style={styles.input}
            value={resource?.id ?? ''}
            onChange={(e) => onResource(Number(e.target.value))}
          >
            {ofLanguage.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} — {entry.authorName}
              </option>
            ))}
          </select>
        )}
      </Field>
    </>
  );
};

/** The layers moved: `layers` with the one at `from` at `to`. */
const moved = (layers: readonly TranslationLayer[], from: number, to: number): TranslationLayer[] => {
  const next = [...layers];
  const [layer] = next.splice(from, 1);
  if (layer) next.splice(to, 0, layer);
  return next;
};

/**
 * Text: the Quran text of the passage (what `<MushafAyahText>` sets), the ayah translation (one
 * file, or up to three layers where the composition takes `text.translations`) and a word gloss
 * from quran.com into `public/`, or any file already there; and for the end card, the passage's
 * tafsir and the surah's introduction. A page takes translations but no word gloss (it is printed whole).
 */
export const TextTab: React.FC<TabProps> = (tabProps) => <TranslationsAndText {...tabProps} />;

/**
 * The passage the timings time, the props' range where they set one: what the fetches ask quran.com
 * for. `null` without timings, and for timings that cross surahs (the fetches ask for one surah).
 */
const passageOf = (props: TabProps['props']) => {
  const timings = resolvedOf(props)?.timings ?? null;
  if (!timings) return null;
  const ranges = recitedRanges(timings);
  const range = ranges[0];
  if (!range || ranges.length !== 1) return null;
  return {
    chapter: range.surah,
    fromAyah: props.fromAyah > 0 ? props.fromAyah : range.fromAyah,
    toAyah: props.toAyah > 0 ? props.toAyah : range.toAyah,
  };
};

/**
 * The end card's content: a tafsir of the passage and the surah's introduction from quran.com,
 * each written into the project and set as the card's file and what it shows. Nothing (a note) on
 * a composition without an end card.
 */
const EndCardContent: React.FC<TabProps> = ({compositionId, props, project}) => {
  const {quranComTafsirs, busy} = useStudioState();
  const t = useT();
  const available = hasEndCard(props);
  useEffect(() => {
    if (available) void loadOnce('quranComTafsirs', () => listQuranComTafsirs({}));
  }, [available]);
  const [language, setLanguage] = useState('en');
  const [choice, setChoice] = useState(0);
  const [infoLanguage, setInfoLanguage] = useState('en');
  if (!available) return <Note>{t('text.noEndCard')}</Note>;
  const passage = passageOf(props);
  const card = endCardOf(props);
  const working = busy !== null;
  const tafsirs = (quranComTafsirs ?? []).filter((entry) => entry.language === language);
  const tafsir = tafsirs.find((entry) => entry.id === choice) ?? tafsirs[0];

  const fetchTafsir = () => {
    if (!tafsir || !passage) return;
    const id = tafsir.id;
    const {chapter, fromAyah, toAyah} = passage;
    void runStudioTask(tNow('text.busy.tafsir', {name: tafsir.name}), async () => {
      const fetched = await fetchQuranComTafsir({tafsirId: id, surah: chapter, fromAyah, toAyah});
      const name = `tafsir-${id}-${chapter}-${fromAyah}-${toAyah}.json`;
      const path = await writeFile(projectPath(project, name), serialiseTafsir(fetched));
      setStudioState({busy: tNow('busy.updating')});
      await patchProps(compositionId, {endCard: {tafsirFile: path, show: 'tafsir'}});
      setStudioState({notice: tNow('text.notice.endCard', {path})});
    });
  };

  const fetchInfo = () => {
    if (!passage) return;
    const surah = passage.chapter;
    const lang = slugify(infoLanguage) || 'en';
    void runStudioTask(tNow('text.busy.surahInfo'), async () => {
      const info = await fetchChapterInfo({surah, language: lang});
      const path = await writeFile(
        projectPath(project, `chapter-info-${surah}-${lang}.json`),
        serialiseChapterInfo(info),
      );
      setStudioState({busy: tNow('busy.updating')});
      await patchProps(compositionId, {endCard: {chapterInfoFile: path, show: 'chapter-info'}});
      setStudioState({notice: tNow('text.notice.endCard', {path})});
    });
  };

  return (
    <>
      <Section title={t('text.tafsir')}>
        <Note>{t('text.now', {file: card.tafsirFile || t('common.none')})}</Note>
        {quranComTafsirs === null ? (
          <Note>{t('text.loadingTafsirs')}</Note>
        ) : (
          <ResourcePicker
            resources={quranComTafsirs}
            language={language}
            onLanguage={(next) => {
              setLanguage(next);
              setChoice(0);
            }}
            resource={tafsir}
            onResource={setChoice}
            label={t('text.tafsirResource')}
          />
        )}
        <Button variant="primary" onClick={fetchTafsir} disabled={working || !tafsir || !passage}>
          {t('text.fetchTafsir')}
        </Button>
      </Section>
      <Section title={t('text.surahInfo')}>
        <Note>{t('text.now', {file: card.chapterInfoFile || t('common.none')})}</Note>
        <Field label={t('text.surahInfoLanguage')}>
          {(id) => (
            <input
              id={id}
              style={styles.input}
              value={infoLanguage}
              onChange={(e) => setInfoLanguage(e.target.value)}
            />
          )}
        </Field>
        <Button onClick={fetchInfo} disabled={working || !passage}>
          {t('text.fetchSurahInfo')}
        </Button>
        <Note>{t('text.endCardNote', {show: card.show ?? 'none'})}</Note>
      </Section>
    </>
  );
};

const TranslationsAndText: React.FC<TabProps> = (tabProps) => {
  const {compositionId, props, project} = tabProps;
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
  const resources = useMemo(
    () => (quranComResources ?? []).filter((resource) => resource.language === language),
    [quranComResources, language],
  );
  const resource = resources.find((r) => r.id === resourceChoice) ?? resources[0];
  const working = busy !== null;

  const passage = passageOf(props);
  const layered = hasTranslationLayers(props);
  const layers = translationLayersOf(props);

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

  /** Saves the translation layers: the whole list, the first one's file as `translationFile`. */
  const saveLayers = (next: readonly TranslationLayer[]) =>
    void runStudioTask(tNow('busy.updating'), () => patchProps(compositionId, translationLayersPatch(next)));

  /**
   * Fetches the chosen translation of the passage into the project and shows it: as the single
   * `translationFile`, or, where the composition takes layers, as layer `layer` (a new last one for
   * `'new'`), in the font picked for its script.
   */
  const fetchTranslation = (layer: number | 'new' = 'new') => {
    if (!resource || !passage) return;
    const id = resource.id;
    const current = layers;
    void runStudioTask(tNow('text.busy.fetching', {name: resource.name}), async () => {
      const translation = await fetchQuranComTranslation({resourceId: id, ...passage});
      const name = `translation-${id}${suffix}.json`;
      const path = await writeFile(projectPath(project, name), serialiseTranslation(translation));
      if (!layered) {
        await patchProps(compositionId, {text: {translationFile: path}});
        return;
      }
      const next =
        layer === 'new'
          ? [...current, newTranslationLayer(props, path)]
          : current.map((entry, i) => (i === layer ? {...entry, file: path} : entry));
      await patchProps(compositionId, translationLayersPatch(next));
    });
  };

  /** A file of `public/` as a new last layer: checked as `setFile()` checks it. */
  const addLayerFile = (path: string) => {
    const current = layers;
    void runStudioTask(tNow('text.busy.checking'), async () => {
      const io = {fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), staticFile};
      await loadTextFile('ayah', 'translationFile', path, io);
      setStudioState({busy: tNow('busy.updating')});
      await patchProps(compositionId, translationLayersPatch([...current, newTranslationLayer(props, path)]));
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

  const current = (field: FileField): string => textFileOf(props, field) || t('common.none');
  const full = layers.length >= MAX_TRANSLATION_LAYERS;
  // A file may be two layers (two sizes of one translation): its rank among them keeps the keys apart.
  const layerKeys = layers.map(
    (layer, index) => `${layer.file}#${layers.slice(0, index).filter((other) => other.file === layer.file).length}`,
  );
  // An ayah text paints no word gloss or transliteration: the controls would set props it ignores.
  const words = !isAyahTextProps(props) && !isPageProps(props);
  // Every composition here has a `text` group; one without would be given a key its schema refuses.
  const takesText = textGroupOf(props) !== null;

  return (
    <div>
      {passage ? null : <Note>{t(resolvedOf(props)?.timings ? 'text.crossesSurahs' : 'text.needsTimings')}</Note>}
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
      {takesText ? (
        <Section
          title={
            layered ? t('text.layers', {count: layers.length, max: MAX_TRANSLATION_LAYERS}) : t('text.ayahTranslation')
          }
        >
          {layered ? (
            layers.length === 0 ? (
              <Note>{t('text.noLayers')}</Note>
            ) : (
              <ul style={styles.list} data-mushaf-control="translation-layers">
                {layers.map((layer, index) => (
                  <li key={layerKeys[index]} style={{...styles.row, padding: '3px 0'}} data-layer={index}>
                    <span style={{flex: '1 1 auto', overflowWrap: 'anywhere'}}>
                      {t('text.layer', {n: index + 1, file: layer.file || t('common.none'), font: layer.font})}
                    </span>
                    <Button
                      variant="ghost"
                      title={t('text.layerUp')}
                      disabled={working || index === 0}
                      onClick={() => saveLayers(moved(layers, index, index - 1))}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      title={t('text.layerDown')}
                      disabled={working || index === layers.length - 1}
                      onClick={() => saveLayers(moved(layers, index, index + 1))}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      title={t('text.layerFetch')}
                      disabled={working || !resource || !passage}
                      onClick={() => fetchTranslation(index)}
                    >
                      ⟳
                    </Button>
                    <Button
                      variant="ghost"
                      title={t('text.layerRemove')}
                      disabled={working}
                      onClick={() => saveLayers(layers.filter((_, i) => i !== index))}
                    >
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Note>{t('text.now', {file: current('translationFile')})}</Note>
          )}
          {quranComResources === null ? (
            <Note>{t('text.loadingList')}</Note>
          ) : (
            <>
              <ResourcePicker
                resources={quranComResources}
                language={language}
                onLanguage={(next) => {
                  setLanguage(next);
                  setResourceChoice(0);
                }}
                resource={resource}
                onResource={setResourceChoice}
                label={t('text.translation')}
              />
              <div style={styles.row}>
                {layered ? (
                  <Button
                    variant="primary"
                    onClick={() => fetchTranslation('new')}
                    disabled={working || !resource || !passage || full}
                  >
                    {t('text.addLayer')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => fetchTranslation()}
                      disabled={working || !resource || !passage}
                    >
                      {t('text.fetchForPassage')}
                    </Button>
                    <Button
                      onClick={() => setFile('translationFile', '')}
                      disabled={working || !textFileOf(props, 'translationFile')}
                    >
                      {t('text.none')}
                    </Button>
                  </>
                )}
              </div>
              {layered ? <Note>{t('text.layersNote', {max: MAX_TRANSLATION_LAYERS})}</Note> : null}
            </>
          )}
        </Section>
      ) : (
        <Note>{t('text.noTextGroup')}</Note>
      )}
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
            <Button onClick={() => setFile('glossFile', '')} disabled={working || !textFileOf(props, 'glossFile')}>
              {t('text.noGloss')}
            </Button>
            <Button
              onClick={() => setFile('transliterationFile', '')}
              disabled={working || !textFileOf(props, 'transliterationFile')}
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
              {layered ? (
                <Button onClick={() => addLayerFile(publicChoice)} disabled={working || !publicChoice || full}>
                  {t('text.asLayer')}
                </Button>
              ) : (
                <Button onClick={() => setFile('translationFile', publicChoice)} disabled={working || !publicChoice}>
                  {t('text.asTranslation')}
                </Button>
              )}
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
      <EndCardContent {...tabProps} />
    </div>
  );
};
