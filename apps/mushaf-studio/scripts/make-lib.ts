// The pure half of `scripts/make.ts`: the command line, the file names, the props and the
// suggestions for a slug the catalogue does not know. No network, no file system, no clock, so
// that scripts/make-lib.test.ts can pin every rule down.

/** The compositions `make` renders: the two that follow a recitation. */
export const MAKE_COMPOSITIONS = ['MushafRecitation', 'MushafAyahText'] as const;
export type MakeComposition = (typeof MAKE_COMPOSITIONS)[number];

/** Where `make` writes its audio, timings, translation and text, relative to `public/`. */
export const CLI_PUBLIC_DIR = 'mushaf-studio/cli';

/** Surahs and the longest one's ayah count, for the argument checks (the catalogue has the rest). */
const SURAHS = 114;
const MAX_AYAH = 286;

export const USAGE = `Make a recitation video from the QUD catalogue, without opening the Studio.

Usage (from apps/mushaf-studio):
  bun run make --reciter <slug> --surah <n> [options] [-- <extra remotion render args>]
  bun run make --list-reciters [query]

Options:
  --reciter <slug>          a catalogue recitation (see --list-reciters)
  --surah <n>               the surah, 1-114
  --from <n> --to <n>       the ayahs (default: every ayah the catalogue has for the surah)
  --composition <id>        MushafRecitation (default) or MushafAyahText
  --translation <id>        a quran.com translation resource id, shown under the lines
  --props <file.json>       props deep-merged over the composition's defaults and the fetched files
  --out <file>              the video (default out/<slug>-<surah>-<from>-<to>.mp4)
  --dry-run                 fetch and write the files, print the render command, do not render
  --list-reciters [query]   print the catalogue (slug, reciter, riwayah, style, chapters),
                            filtered by every word of the query
  -h, --help                this text

Paths are relative to apps/mushaf-studio. The clip, its timings and the text files go to
public/${CLI_PUBLIC_DIR}/, the props to <out without extension>.props.json, the video to --out.
Everything after \`--\` is passed to \`remotion render\`, for example
  -- --browser-executable=/path/to/chrome-headless-shell --concurrency=2

Behind a TLS-intercepting proxy the renderer's browser rejects QUL's CDN certificate and the
fonts packages take over (the default \`fonts: 'fallback'\`); pass \`-- --ignore-certificate-errors\`
to let the browser reach the CDN anyway, or \`--props\` with {"fonts": "package"} to skip it.`;

/** A command line `make` cannot run: the message names the argument and the fix. */
export class MakeUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MakeUsageError';
  }
}

export type MakeOptions = {
  readonly reciter: string;
  readonly surah: number;
  /** Absent: from the first ayah the catalogue has. */
  readonly from?: number;
  /** Absent: to the last ayah the catalogue has. */
  readonly to?: number;
  readonly composition: MakeComposition;
  readonly translation?: number;
  readonly props?: string;
  readonly out?: string;
  readonly dryRun: boolean;
  /** Passed to `remotion render` after its own arguments. */
  readonly extra: readonly string[];
};

export type MakeCommand =
  | {readonly kind: 'help'}
  | {readonly kind: 'list'; readonly query: string}
  | {readonly kind: 'make'; readonly options: MakeOptions};

const VALUE_OPTIONS = ['reciter', 'surah', 'from', 'to', 'composition', 'translation', 'props', 'out'] as const;
type ValueOption = (typeof VALUE_OPTIONS)[number];
const FLAG_OPTIONS = ['dry-run', 'list-reciters', 'help'] as const;
const ALL_OPTIONS: readonly string[] = [...VALUE_OPTIONS, ...FLAG_OPTIONS];

const isValueOption = (name: string): name is ValueOption => (VALUE_OPTIONS as readonly string[]).includes(name);

const integerArg = (name: string, value: string, min: number, max: number): number => {
  const n = /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;
  if (!Number.isInteger(n) || n < min || n > max)
    throw new MakeUsageError(`--${name} must be a whole number from ${min} to ${max} (got "${value}").`);
  return n;
};

/**
 * Reads `make`'s arguments (`process.argv.slice(2)`): `--name value` or `--name=value`, the flags,
 * `--list-reciters` with an optional query, and everything after `--` kept for `remotion render`.
 * Throws `MakeUsageError` for an unknown or repeated option, a missing value, a stray word or a
 * value out of range.
 */
export const parseMakeArgs = (argv: readonly string[]): MakeCommand => {
  const values: Partial<Record<ValueOption, string>> = {};
  const flags = new Set<string>();
  const queryWords: string[] = [];
  let extra: readonly string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      extra = argv.slice(i + 1);
      break;
    }
    if (arg === '-h') {
      flags.add('help');
      continue;
    }
    if (!arg.startsWith('--')) {
      if (flags.has('list-reciters')) {
        queryWords.push(arg);
        continue;
      }
      throw new MakeUsageError(
        `Unexpected argument "${arg}": every value follows its option (--surah 112). Run with --help for the usage.`,
      );
    }
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if (!ALL_OPTIONS.includes(name)) {
      const near = closest(name, ALL_OPTIONS);
      throw new MakeUsageError(
        `Unknown option --${name}${near === null ? '' : ` (did you mean --${near}?)`}. Run with --help for the usage.`,
      );
    }
    if (flags.has(name) || (isValueOption(name) && values[name] !== undefined))
      throw new MakeUsageError(`--${name} is given twice; give it once.`);
    if (!isValueOption(name)) {
      if (name === 'list-reciters' && eq !== -1) queryWords.push(arg.slice(eq + 1));
      else if (eq !== -1) throw new MakeUsageError(`--${name} takes no value (got "${arg}").`);
      flags.add(name);
      continue;
    }
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (value === undefined || value === '' || (eq === -1 && value.startsWith('--')))
      throw new MakeUsageError(`--${name} needs a value (--${name} <${name === 'reciter' ? 'slug' : 'value'}>).`);
    values[name] = value;
  }

  if (flags.has('help')) return {kind: 'help'};
  if (flags.has('list-reciters')) return {kind: 'list', query: queryWords.join(' ').trim()};

  if (values.reciter === undefined)
    throw new MakeUsageError('--reciter <slug> is required; `bun run make --list-reciters` lists the slugs.');
  if (values.surah === undefined) throw new MakeUsageError('--surah <n> is required (1-114).');
  const surah = integerArg('surah', values.surah, 1, SURAHS);
  const from = values.from === undefined ? undefined : integerArg('from', values.from, 1, MAX_AYAH);
  const to = values.to === undefined ? undefined : integerArg('to', values.to, 1, MAX_AYAH);
  if (from !== undefined && to !== undefined && to < from)
    throw new MakeUsageError(`--to (${to}) comes before --from (${from}); give the first ayah, then the last.`);

  const composition = values.composition ?? 'MushafRecitation';
  if (!(MAKE_COMPOSITIONS as readonly string[]).includes(composition)) {
    const near = MAKE_COMPOSITIONS.find((id) => id.toLowerCase() === composition.toLowerCase());
    throw new MakeUsageError(
      `--composition must be ${MAKE_COMPOSITIONS.join(' or ')} (got "${composition}")${near ? `; did you mean ${near}?` : '.'}`,
    );
  }
  const translation =
    values.translation === undefined
      ? undefined
      : integerArg('translation', values.translation, 1, Number.MAX_SAFE_INTEGER);
  if (values.out !== undefined && !/\.[a-z0-9]+$/i.test(values.out))
    throw new MakeUsageError(`--out needs a file extension, such as .mp4 (got "${values.out}").`);

  return {
    kind: 'make',
    options: {
      reciter: values.reciter.trim(),
      surah,
      ...(from === undefined ? {} : {from}),
      ...(to === undefined ? {} : {to}),
      composition: composition as MakeComposition,
      ...(translation === undefined ? {} : {translation}),
      ...(values.props === undefined ? {} : {props: values.props}),
      ...(values.out === undefined ? {} : {out: values.out}),
      dryRun: flags.has('dry-run'),
      extra,
    },
  };
};

/** ASCII, lower case, `-` for everything else, like the panel's file names; `_` is kept. */
export const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[^ -~]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

/** A recited passage, as the catalogue resolved it. */
export type Passage = {readonly slug: string; readonly surah: number; readonly from: number; readonly to: number};

/** `<slug>-<surah>-<from>-<to>`: the name the Source tab gives a catalogue pick, and every file `make` writes. */
export const passageStem = ({slug, surah, from, to}: Passage): string => slugify(`${slug}-${surah}-${from}-${to}`);

export type MakeFiles = {
  /** Under `public/`, as the props record them. */
  readonly audio: string;
  readonly timings: string;
  readonly translation?: string;
  readonly text?: string;
  /** Relative to the app folder. */
  readonly video: string;
  readonly props: string;
};

/**
 * Every file of one run: the clip and its timings (`mushaf-studio/cli/<stem>.mp3` and
 * `.timings.json`), the translation and the Quran text under the Text tab's names
 * (`translation-<id>-<surah>-<from>-<to>.json`, `text-<script>-…`), the video (`--out`, by default
 * `out/<stem>.mp4`) and its props beside it (`out/<stem>.props.json`).
 */
export const makeFiles = (
  passage: Passage,
  options: {
    readonly out?: string | undefined;
    readonly translation?: number | undefined;
    readonly textScript?: string | undefined;
  } = {},
): MakeFiles => {
  const stem = passageStem(passage);
  const range = `${passage.surah}-${passage.from}-${passage.to}`;
  const video = options.out ?? `out/${stem}.mp4`;
  return {
    audio: `${CLI_PUBLIC_DIR}/${stem}.mp3`,
    timings: `${CLI_PUBLIC_DIR}/${stem}.timings.json`,
    ...(options.translation === undefined
      ? {}
      : {translation: `${CLI_PUBLIC_DIR}/translation-${options.translation}-${range}.json`}),
    ...(options.textScript === undefined ? {} : {text: `${CLI_PUBLIC_DIR}/text-${options.textScript}-${range}.json`}),
    video,
    props: `${video.replace(/\.[^./\\]+$/, '')}.props.json`,
  };
};

type Json = Readonly<Record<string, unknown>>;

const isPlainObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `base` with `patch` applied: nested objects key by key (`{layout: {aspect: '9:16'}}` keeps the
 * rest of `layout`), arrays and scalars replaced, `undefined` ignored. Neither argument changes.
 */
export const deepMerge = (base: Json, patch: Json): Record<string, unknown> => {
  const merged: Record<string, unknown> = {...base};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return merged;
};

/**
 * The props one run saves: what the files set (`audioFile`, `timingsFile`, the range reset to the
 * timings' own, no splits on `MushafRecitation`, `text.translationFile`, `textFile` on
 * `MushafAyahText`), as a patch over the composition's defaults.
 */
export const filesPatch = (composition: MakeComposition, files: MakeFiles): Record<string, unknown> => ({
  audioFile: files.audio,
  timingsFile: files.timings,
  fromAyah: 0,
  toAyah: 0,
  ...(composition === 'MushafRecitation' ? {splits: []} : {}),
  ...(files.translation === undefined ? {} : {text: {translationFile: files.translation}}),
  ...(composition === 'MushafAyahText' && files.text !== undefined ? {textFile: files.text} : {}),
});

/** The composition's defaults, then the files, then the `--props` file, each deep-merged over the last. */
export const buildProps = (
  defaults: Json,
  composition: MakeComposition,
  files: MakeFiles,
  overrides: Json = {},
): Record<string, unknown> => deepMerge(deepMerge(defaults, filesPatch(composition, files)), overrides);

/** Reads a `--props` file's text: a JSON object, or a `MakeUsageError` naming the file. */
export const parsePropsFile = (text: string, path: string): Json => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new MakeUsageError(
      `--props ${path} is not JSON (${error instanceof Error ? error.message : String(error)}); give a JSON object such as {"theme": "light"}.`,
    );
  }
  if (!isPlainObject(value))
    throw new MakeUsageError(`--props ${path} must hold a JSON object of props, such as {"theme": "light"}.`);
  return value;
};

/** The arguments of `bunx remotion render`, `extra` last so that it can override ours. */
export const renderArgs = (
  composition: MakeComposition,
  video: string,
  propsFile: string,
  extra: readonly string[] = [],
): string[] => ['remotion', 'render', composition, video, `--props=${propsFile}`, ...extra];

/** A command as it would be typed in a POSIX shell: words with anything unusual single-quoted. */
export const shellLine = (command: string, args: readonly string[]): string =>
  [command, ...args]
    .map((word) => (/^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`))
    .join(' ');

/** The catalogue fields `make` reads: `QudRecitation` without the parts it ignores. */
export type CatalogueEntry = {
  readonly slug: string;
  readonly label: string;
  readonly reciter: {readonly reciter_id: string; readonly name_en: string; readonly name_ar: string};
  readonly riwayah: string;
  readonly style: string;
  readonly chapters: readonly number[];
};

const haystack = (entry: CatalogueEntry): string =>
  [entry.slug, entry.label, entry.reciter.name_en, entry.reciter.name_ar, entry.riwayah, entry.style]
    .join(' ')
    .toLowerCase();

/** The entries that contain every word of `query` (slug, label, names, riwayah, style); all of them for an empty query. */
export const filterRecitations = <T extends CatalogueEntry>(catalogue: readonly T[], query: string): T[] => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return catalogue.filter((entry) => {
    const text = haystack(entry);
    return words.every((word) => text.includes(word));
  });
};

/** One line per recitation, in columns: slug, reciter, riwayah, style, chapters covered. */
export const formatRecitations = (entries: readonly CatalogueEntry[]): string => {
  const rows = entries.map((e) => [e.slug, e.reciter.name_en, e.riwayah, e.style, `${e.chapters.length} ch`]);
  const header = ['slug', 'reciter', 'riwayah', 'style', 'chapters'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  return [header, ...rows]
    .map((row) =>
      row
        .map((cell, i) => cell.padEnd(widths[i]!))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
};

/** Levenshtein distance, for the suggestions. */
export const editDistance = (a: string, b: string): number => {
  let previous = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length]!;
};

const closest = (word: string, candidates: readonly string[]): string | null => {
  let best: string | null = null;
  let bestDistance = Math.max(2, Math.floor(word.length / 3)) + 1;
  for (const candidate of candidates) {
    const d = editDistance(word, candidate);
    if (d < bestDistance) [best, bestDistance] = [candidate, d];
  }
  return best;
};

const tokens = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * How far `entry` is from what the user typed: 0 for a slug containing it, then by shared words
 * (`husary` finds `mahmoud_khalil_al_husary_…`) and by edit distance on the slug. Lower is closer.
 */
const distanceTo = (wanted: string, entry: CatalogueEntry): number => {
  const query = wanted.toLowerCase();
  if (entry.slug.includes(query) || query.includes(entry.slug)) return 0;
  const words = tokens(query);
  const own = new Set([...tokens(entry.slug), ...tokens(entry.reciter.name_en), ...tokens(entry.reciter.reciter_id)]);
  const shared = words.filter((w) => own.has(w) || [...own].some((o) => o.length > 3 && editDistance(o, w) <= 1));
  const ratio = editDistance(query, entry.slug) / Math.max(query.length, entry.slug.length);
  return shared.length > 0 ? 1 - shared.length / words.length / 2 : 1 + ratio;
};

/**
 * Up to `limit` catalogue entries closest to `wanted`, closest first: the suggestions for a slug
 * the catalogue does not know. Entries that are not close at all (no shared word, under half the
 * slug in common) are left out, so the list can be empty. With `chapter`, only entries that cover it.
 */
export const suggestRecitations = <T extends CatalogueEntry>(
  wanted: string,
  catalogue: readonly T[],
  options: {readonly chapter?: number | undefined; readonly limit?: number | undefined} = {},
): T[] => {
  const {chapter, limit = 5} = options;
  return catalogue
    .filter((entry) => chapter === undefined || entry.chapters.includes(chapter))
    .map((entry) => ({entry, distance: distanceTo(wanted, entry)}))
    .filter(({distance}) => distance < 1.5)
    .sort((a, b) => a.distance - b.distance || a.entry.slug.localeCompare(b.entry.slug))
    .slice(0, limit)
    .map(({entry}) => entry);
};

/**
 * The catalogue entry for `slug`, or a `MakeUsageError` that lists the close matches: for an
 * unknown slug, the slugs nearest to it; for a recitation without `chapter`, its chapters' count
 * and the nearest recitations that have it (the same reciter's other recordings first).
 */
export const resolveRecitation = <T extends CatalogueEntry>(
  slug: string,
  chapter: number,
  catalogue: readonly T[],
): T => {
  const entry = catalogue.find((e) => e.slug === slug);
  const list = (entries: readonly T[]) => entries.map((e) => `\n  ${e.slug}  (${e.label})`).join('');
  if (entry === undefined) {
    const near = suggestRecitations(slug, catalogue);
    throw new MakeUsageError(
      `The catalogue has no recitation "${slug}".${near.length > 0 ? ` Close matches:${list(near)}` : ''}\nRun \`bun run make --list-reciters [query]\` for the full list.`,
    );
  }
  if (!entry.chapters.includes(chapter)) {
    const sameReciter = catalogue.filter(
      (e) => e.slug !== slug && e.reciter.reciter_id === entry.reciter.reciter_id && e.chapters.includes(chapter),
    );
    const near = [
      ...sameReciter,
      ...suggestRecitations(slug, catalogue, {chapter}).filter((e) => !sameReciter.includes(e)),
    ].slice(0, 5);
    throw new MakeUsageError(
      `"${slug}" has no reviewed segments for surah ${chapter} (it covers ${entry.chapters.length} chapters).${near.length > 0 ? ` Recitations that have it:${list(near)}` : ''}\nRun \`bun run make --list-reciters [query]\` to see the others.`,
    );
  }
  return entry;
};
