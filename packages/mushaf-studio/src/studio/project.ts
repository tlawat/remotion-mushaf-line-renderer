// Project files: a composition's props (content and style, never `resolved`) and the `public/`
// files they point to, as one JSON to share. The collect and validate steps are pure; export and
// import wrap them with the Studio API.
import type {StaticFile} from '@remotion/studio';
import {mushafRecitationSchema} from '../compositions/recitation/schema';
import {MushafStudioError} from '../errors';
import {MIRROR_FILES} from '../schema';
import {mushafAyahTextSchema} from '../unicode/schema';
import type {MessageKey, MessageParams} from './i18n';
import {t} from './store';
import {isUrl} from './studio-api';
import {
  endCardOf,
  isAyahTextProps,
  isPageProps,
  type StudioCompositionProps,
  textFileOf,
  translationLayersOf,
} from './tab-props';

/** What `project.json` holds. */
export type ProjectFile = {
  readonly version: 1;
  readonly compositionId: string;
  /** The props without `resolved`: `calculateMetadata()` fills it again from them. */
  readonly props: Readonly<Record<string, unknown>>;
  /** The `public/` paths the props point to, sorted. */
  readonly files: readonly string[];
};

/** The name of the project file in the project's folder. */
export const PROJECT_FILE_NAME = 'project.json';

/** A `public/` path the props name: not empty, not a URL, without a leading `/`. */
const publicPath = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' && !isUrl(value) ? value.replace(/^\/+/, '') : null;

/**
 * The `public/` paths a composition's props point to, sorted and once each: the audio, the timings,
 * the text files (every translation layer), the end card's tafsir and surah introduction, the
 * background image, an ayah text's Quran text, and the mushaf mirror when `data` reads it. URLs are
 * not files of the project and are left out.
 */
export const collectProjectFiles = (props: StudioCompositionProps): readonly string[] => {
  const record = props as unknown as Readonly<Record<string, unknown>>;
  const card = endCardOf(props);
  const candidates: unknown[] = [
    props.audioFile,
    props.timingsFile,
    textFileOf(props, 'translationFile'),
    textFileOf(props, 'glossFile'),
    textFileOf(props, 'transliterationFile'),
    ...translationLayersOf(props).map((layer) => layer.file),
    card.tafsirFile,
    card.chapterInfoFile,
    props.layout.backgroundImage,
  ];
  if (isAyahTextProps(props)) candidates.push(props.textFile);
  if (record.data === 'mirror') candidates.push(MIRROR_FILES.words, MIRROR_FILES.layout);
  const paths = new Set(candidates.map(publicPath).filter((path): path is string => path !== null));
  return [...paths].sort();
};

/** The project file of a composition: its props without `resolved`, and the files they need. */
export const projectFileOf = (compositionId: string, props: StudioCompositionProps): ProjectFile => {
  const {resolved: _resolved, ...rest} = props as unknown as Readonly<Record<string, unknown>>;
  return {version: 1, compositionId, props: rest, files: collectProjectFiles(props)};
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = (
  problem: MessageKey,
  params: MessageParams = {},
  details: Readonly<Record<string, unknown>> = {},
): never => {
  throw new MushafStudioError('BAD_STUDIO_PROP', t('project.invalid', {problem: t(problem, params)}), details);
};

/**
 * A project file read back, checked: version 1, a composition id, props that pass the schema of
 * the composition they are for (`<MushafAyahText>`'s when they carry `textFile`, else
 * `<MushafRecitation>`'s) and a list of files. `files` is completed with what the props point to,
 * so a hand-edited list cannot hide a file. Throws a `BAD_STUDIO_PROP` error that names the problem.
 */
export const validateProjectFile = (value: unknown): ProjectFile => {
  if (!isRecord(value)) return invalid('project.notObject');
  if (value.version !== 1)
    return invalid(
      'project.badVersion',
      {version: JSON.stringify(value.version) ?? 'undefined'},
      {version: value.version},
    );
  if (typeof value.compositionId !== 'string' || value.compositionId === '') return invalid('project.noComposition');
  if (!isRecord(value.props)) return invalid('project.propsNotObject');
  if (!Array.isArray(value.files) || value.files.some((file) => typeof file !== 'string'))
    return invalid('project.filesNotList');
  const schema = 'textFile' in value.props ? mushafAyahTextSchema : mushafRecitationSchema;
  const parsed = schema.safeParse({...value.props, resolved: null});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || 'props';
    return invalid('project.badProps', {path: where, message: issue?.message ?? ''}, {path: where});
  }
  const {resolved: _resolved, ...props} = parsed.data as Readonly<Record<string, unknown>>;
  const files = new Set([
    ...(value.files as readonly string[]),
    ...collectProjectFiles(parsed.data as StudioCompositionProps),
  ]);
  return {version: 1, compositionId: value.compositionId, props, files: [...files].sort()};
};

/** The files of a project that `public/` does not have (by the names `getStaticFiles()` gives). */
export const missingProjectFiles = (
  project: Pick<ProjectFile, 'files'>,
  staticFiles: readonly Pick<StaticFile, 'name'>[],
): readonly string[] => {
  const present = new Set(staticFiles.map((file) => file.name.replace(/^\/+/, '')));
  return project.files.filter((file) => !present.has(file));
};

/** Whether a project's props are for the same kind of composition as the panel's: an ayah text, a page, or a recitation. */
export const projectFits = (project: ProjectFile, props: StudioCompositionProps): boolean =>
  'textFile' in project.props === isAyahTextProps(props) && 'pageView' in project.props === isPageProps(props);

/** Offers a text as a download, through a Blob and a link click. Browser only. */
export const downloadText = (name: string, text: string, type = 'application/json'): void => {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the click has been handled: revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
