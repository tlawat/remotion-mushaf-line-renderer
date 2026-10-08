#!/usr/bin/env bun
// `bun run make`: a catalogue recitation to a rendered video, without opening the Studio. It does
// what the panel's Source and Text tabs do (fetch the reviewed segments, download the clip, write
// the timings, the translation and the Quran text into public/), saves the props beside the video
// and runs `remotion render` on them. `bun run make --help` for the usage; the rules are in
// make-lib.ts, which the tests cover.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  defaultMushafAyahTextProps,
  defaultMushafRecitationProps,
  fetchQuranComText,
  fetchQuranComTranslation,
  getChapterSegments,
  listRecitations,
  type QudRecitation,
  type QuranTextScript,
  serialiseAyahWords,
  serialiseTranslation,
  timingsFromCatalogue,
  UNICODE_FONTS,
} from '@tlawat/mushaf-studio';
import {
  buildProps,
  type CatalogueEntry,
  filterRecitations,
  formatRecitations,
  type MakeOptions,
  MakeUsageError,
  makeFiles,
  parseMakeArgs,
  parsePropsFile,
  renderArgs,
  resolveRecitation,
  shellLine,
  USAGE,
} from './make-lib';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

const log = (message: string) => console.log(`make: ${message}`);

const writeText = async (file: string, contents: string | Uint8Array): Promise<void> => {
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, contents);
};

/** The catalogue as `make-lib` reads it (`QudRecitation` is a superset). */
const catalogue = async (): Promise<readonly (QudRecitation & CatalogueEntry)[]> => {
  log('reading the QUD catalogue...');
  return listRecitations();
};

const listReciters = async (query: string): Promise<void> => {
  const entries = filterRecitations(await catalogue(), query);
  if (entries.length === 0) {
    console.log(`No recitation matches "${query}".`);
    return;
  }
  console.log(formatRecitations(entries));
  console.log(
    `\n${entries.length} recitation${entries.length === 1 ? '' : 's'}${query ? ` matching "${query}"` : ''}.`,
  );
};

const make = async (options: MakeOptions): Promise<number> => {
  const {reciter, surah, composition} = options;
  // Read first: a bad --props file fails before anything is downloaded.
  const overrides =
    options.props === undefined
      ? {}
      : parsePropsFile(
          await readFile(path.resolve(APP_DIR, options.props), 'utf8').catch((error: unknown) => {
            throw new MakeUsageError(
              `--props ${options.props} cannot be read (${error instanceof Error ? error.message : String(error)}); paths are relative to apps/mushaf-studio.`,
            );
          }),
          options.props,
        );

  const recitation = resolveRecitation(reciter, surah, await catalogue());
  log(`fetching the segments of ${recitation.label}, surah ${surah}...`);
  const chapter = await getChapterSegments({
    slug: recitation.slug,
    chapter: surah,
    ...(options.from === undefined ? {} : {verseFrom: options.from}),
    ...(options.to === undefined ? {} : {verseTo: options.to}),
  });
  const passage = {slug: recitation.slug, surah, from: chapter.verse_from, to: chapter.verse_to};

  const defaults = composition === 'MushafAyahText' ? defaultMushafAyahTextProps : defaultMushafRecitationProps;
  // MushafAyahText's text is in its font's script, and --props may change the font.
  const font = composition === 'MushafAyahText' ? String(overrides.font ?? defaultMushafAyahTextProps.font) : undefined;
  const textScript =
    font === undefined
      ? undefined
      : (UNICODE_FONTS as Readonly<Record<string, {readonly script: QuranTextScript}>>)[font]?.script;
  if (font !== undefined && textScript === undefined)
    throw new MakeUsageError(
      `--props sets font "${font}", which is not one of ${Object.keys(UNICODE_FONTS).join(', ')}.`,
    );
  const files = makeFiles(passage, {out: options.out, translation: options.translation, textScript});

  log(`downloading the clip into public/${files.audio}...`);
  let audio = files.audio;
  try {
    const response = await fetch(chapter.audio_url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeText(path.join(PUBLIC_DIR, files.audio), new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    // As in the panel: the render streams the clip from the catalogue instead.
    audio = chapter.audio_url;
    log(
      `the clip could not be downloaded (${error instanceof Error ? error.message : String(error)}); the video streams it from ${audio}`,
    );
  }
  const timings = timingsFromCatalogue(chapter, {audio});
  await writeText(path.join(PUBLIC_DIR, files.timings), JSON.stringify(timings, null, 1));
  log(`wrote public/${files.timings} (ayahs ${passage.from}-${passage.to})`);

  const range = {chapter: surah, fromAyah: passage.from, toAyah: passage.to};
  if (options.translation !== undefined && files.translation !== undefined) {
    log(`fetching quran.com translation ${options.translation}...`);
    const translation = await fetchQuranComTranslation({resourceId: options.translation, ...range});
    await writeText(path.join(PUBLIC_DIR, files.translation), serialiseTranslation(translation));
    log(`wrote public/${files.translation} (${translation.meta.name})`);
  }
  if (composition === 'MushafAyahText' && textScript !== undefined && files.text !== undefined) {
    log(`fetching the ${textScript} text from quran.com...`);
    const text = await fetchQuranComText({...range, script: textScript});
    await writeText(path.join(PUBLIC_DIR, files.text), serialiseAyahWords(text));
    log(`wrote public/${files.text}`);
  }

  const props = buildProps(defaults, composition, {...files, audio}, overrides);
  await writeText(path.resolve(APP_DIR, files.props), `${JSON.stringify(props, null, 2)}\n`);
  log(`wrote ${files.props}`);

  const args = renderArgs(composition, files.video, files.props, options.extra);
  if (options.dryRun) {
    log('dry run: render with');
    const appDir = path.relative(process.cwd(), APP_DIR);
    console.log(`  ${appDir === '' ? '' : `cd ${shellLine(appDir, [])} && `}${shellLine('bunx', args)}`);
    return 0;
  }
  log(`rendering: ${shellLine('bunx', args)}`);
  return new Promise<number>((resolve, reject) => {
    const child = spawn('bunx', args, {cwd: APP_DIR, stdio: 'inherit'});
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0 && existsSync(path.resolve(APP_DIR, files.video))) log(`done: ${files.video}`);
      resolve(code ?? (signal === null ? 1 : 128));
    });
  });
};

const main = async (): Promise<number> => {
  const command = parseMakeArgs(process.argv.slice(2));
  if (command.kind === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (command.kind === 'list') {
    await listReciters(command.query);
    return 0;
  }
  return make(command.options);
};

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof MakeUsageError) console.error(`make: ${error.message}`);
    else console.error(`make: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof MakeUsageError ? 2 : 1;
  },
);
