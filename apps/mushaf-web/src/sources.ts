// Where the page's content comes from: the QUD catalogue for the recitation, quran.com for the
// translation, the word gloss and the Quran text. Each loader fetches through the package's
// clients, writes the file the Studio would have written into public/ into the memory store, and
// returns its `mem://` URL. The grouping helpers for the selects are pure.
import {
  fetchQuranComText,
  fetchQuranComTranslation,
  fetchQuranComWordGloss,
  getChapterSegments,
  type QudRecitation,
  type QuranComResource,
  serialiseAyahWords,
  serialiseTranslation,
  timingsFromCatalogue,
} from '@tlawat/mushaf-studio';
import {type MemoryFiles, memoryUrl} from './memory-files';
import type {PickedRecitation} from './project';

/** The catalogue entry the page opens on: the reciter of the Studio's sample. */
export const DEFAULT_RECITATION_SLUG = 'abdul_hamid_ghraio_2025_yt';

/** The network options every loader takes: an injected `fetch` (tests) and an abort signal. */
export type SourceOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly signal?: AbortSignal | undefined;
};

/** One reciter of the catalogue and their recitations, for an `<optgroup>`. */
export type ReciterGroup = {
  readonly reciter: string;
  readonly reciterArabic: string;
  readonly recitations: readonly QudRecitation[];
};

/**
 * The catalogue grouped by reciter (by `reciter_id`, named by `name_en`), reciters in alphabetical
 * order, each reciter's recitations in catalogue order.
 */
export const groupByReciter = (recitations: readonly QudRecitation[]): readonly ReciterGroup[] => {
  const groups = new Map<string, {reciter: string; reciterArabic: string; recitations: QudRecitation[]}>();
  for (const recitation of recitations) {
    const id = recitation.reciter?.reciter_id ?? recitation.slug;
    const group = groups.get(id);
    if (group) group.recitations.push(recitation);
    else
      groups.set(id, {
        reciter: recitation.reciter?.name_en || recitation.label,
        reciterArabic: recitation.reciter?.name_ar ?? '',
        recitations: [recitation],
      });
  }
  return [...groups.values()].sort((a, b) => a.reciter.localeCompare(b.reciter, 'en'));
};

/** What tells a reciter's recitations apart in the select: riwayah, style, channel. */
export const recitationOptionLabel = (recitation: QudRecitation): string =>
  [recitation.riwayah, recitation.style, recitation.channel].filter((part) => part !== '').join(' · ') ||
  recitation.label;

/** The slug the page selects first: the default reciter when the catalogue has it, else its first entry, else `''`. */
export const defaultRecitationSlug = (recitations: readonly QudRecitation[]): string =>
  recitations.some((r) => r.slug === DEFAULT_RECITATION_SLUG) ? DEFAULT_RECITATION_SLUG : (recitations[0]?.slug ?? '');

/** The memory path of a catalogue chapter's timings. */
export const timingsPath = (slug: string, surah: number): string => `timings/${slug}/${surah}.json`;

/**
 * A whole catalogue chapter (`getChapterSegments()` with word timestamps), converted with
 * `timingsFromCatalogue()` and stored as `timings/<slug>/<surah>.json`. The audio stays where the
 * catalogue serves it (its clip URL is CORS-enabled and Range-capable). The ayah range is the
 * composition's `fromAyah`/`toAyah`, so changing it needs no new request.
 */
export const loadCatalogueChapter = async (
  query: {readonly recitation: QudRecitation; readonly surah: number},
  store: MemoryFiles,
  options: SourceOptions = {},
): Promise<PickedRecitation> => {
  const {recitation, surah} = query;
  const chapter = await getChapterSegments(
    {slug: recitation.slug, chapter: surah},
    options.fetch ? {fetch: options.fetch} : {},
  );
  const timings = timingsFromCatalogue(chapter);
  const timingsUrl = store.put(timingsPath(recitation.slug, surah), `${JSON.stringify(timings)}\n`);
  return {
    slug: recitation.slug,
    reciter: recitation.reciter?.name_en || recitation.label,
    surah: timings.surah,
    audioUrl: chapter.audio_url,
    timingsUrl,
    first: timings.ayat[0]!.ayah,
    last: timings.ayat[timings.ayat.length - 1]!.ayah,
  };
};

/** A language quran.com has translations in: ISO 639-1 code where it has one, and its English name. */
export type TranslationLanguage = {readonly code: string; readonly name: string; readonly count: number};

const titleCase = (name: string): string => name.replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase());

/** The languages of a translation list, English first, then by name. */
export const translationLanguages = (resources: readonly QuranComResource[]): readonly TranslationLanguage[] => {
  const languages = new Map<string, {code: string; name: string; count: number}>();
  for (const resource of resources) {
    const code = resource.language;
    const entry = languages.get(code);
    if (entry) entry.count++;
    else languages.set(code, {code, name: titleCase(resource.languageName || code), count: 1});
  }
  return [...languages.values()].sort((a, b) =>
    a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.name.localeCompare(b.name, 'en'),
  );
};

/** The translations of one language, by name. */
export const translationsIn = (resources: readonly QuranComResource[], language: string): readonly QuranComResource[] =>
  resources.filter((r) => r.language === language).sort((a, b) => a.name.localeCompare(b.name, 'en'));

const quranComOptions = (options: SourceOptions) => ({
  ...(options.fetch ? {fetch: options.fetch} : {}),
  ...(options.signal ? {signal: options.signal} : {}),
});

/** A quran.com translation of a whole surah, stored as `translations/<id>/<surah>.json` in the studio envelope (once: a stored file is reused). */
export const loadTranslationFile = async (
  query: {readonly resourceId: number; readonly surah: number},
  store: MemoryFiles,
  options: SourceOptions = {},
): Promise<string> => {
  const path = `translations/${query.resourceId}/${query.surah}.json`;
  if (store.has(path)) return memoryUrl(path);
  const translation = await fetchQuranComTranslation(
    {resourceId: query.resourceId, chapter: query.surah},
    quranComOptions(options),
  );
  return store.put(path, serialiseTranslation(translation));
};

/** quran.com's word-by-word translation of a whole surah in `language`, stored as `gloss/<language>/<surah>.json`. */
export const loadGlossFile = async (
  query: {readonly language: string; readonly surah: number},
  store: MemoryFiles,
  options: SourceOptions = {},
): Promise<string> => {
  const path = `gloss/${query.language}/${query.surah}.json`;
  if (store.has(path)) return memoryUrl(path);
  const gloss = await fetchQuranComWordGloss(
    {chapter: query.surah, field: 'translation', language: query.language},
    quranComOptions(options),
  );
  return store.put(path, serialiseTranslation(gloss));
};

/** The Uthmani text of a whole surah for `<MushafAyahText>`, stored as `text/uthmani/<surah>.json`. */
export const loadQuranTextFile = async (
  query: {readonly surah: number},
  store: MemoryFiles,
  options: SourceOptions = {},
): Promise<string> => {
  const path = `text/uthmani/${query.surah}.json`;
  if (store.has(path)) return memoryUrl(path);
  const text = await fetchQuranComText({chapter: query.surah, script: 'uthmani'}, quranComOptions(options));
  return store.put(path, serialiseAyahWords(text));
};
