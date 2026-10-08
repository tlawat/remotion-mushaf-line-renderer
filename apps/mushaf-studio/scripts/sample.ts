#!/usr/bin/env bun
// `bun run sample`: downloads the default sample's recording into public/ once. The recording is the
// reciter's (docs/mushaf-studio/licensing.md), so it is not committed: the compositions' default
// `audioFile` is `mushaf-studio/fatiha/audio.mp3` (ignored by .gitignore), fetched here from the
// clip URL the sample's timings name (`alignment.recitation.audioUrl`). Until then the compositions
// stream that URL and the Studio says so. `bun run sample --help` for the options.
import {mkdir, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** The sample's timings, under public/: they name the clip they were aligned on. */
export const DEFAULT_TIMINGS = 'mushaf-studio/fatiha/timings.json';
/** Where the clip goes, under public/: the compositions' default `audioFile`. */
export const DEFAULT_OUT = 'mushaf-studio/fatiha/audio.mp3';
/** How long one download may take, response and body. */
export const TIMEOUT_MS = 120_000;
/** One download and one retry. */
export const ATTEMPTS = 2;
/** The folder under public/ whose recordings apps/mushaf-studio/.gitignore keeps out of git. */
export const IGNORED_DIR = 'mushaf-studio';
/**
 * The audio extensions apps/mushaf-studio/.gitignore ignores under `IGNORED_DIR`, as its patterns
 * write them (lower case: git matches them case-sensitively).
 */
export const IGNORED_AUDIO_EXTENSIONS: readonly string[] = [
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.flac',
  '.ogg',
  '.opus',
  '.webm',
];

export const USAGE = `Usage: bun run sample [--timings <path>] [--out <path>] [--url <url>] [--force]

Downloads the recording a timings file was aligned on into public/, once.

  --timings <path>  timings JSON under public/ naming the clip (alignment.recitation.audioUrl)
                    default: ${DEFAULT_TIMINGS}
  --out <path>      where to write it under public/${IGNORED_DIR}/, as ${IGNORED_AUDIO_EXTENSIONS.join(', ')}
                    default: ${DEFAULT_OUT}
  --url <url>       the clip to download, instead of the one the timings name
  --force           download again even when the file is there
  -h, --help        this text

The recording belongs to its reciter: it stays on your machine (.gitignore keeps it out of git).`;

export type SampleErrorCode = 'SAMPLE_USAGE' | 'SAMPLE_TIMINGS' | 'SAMPLE_DOWNLOAD';

/** A failure of the script: a stable code and a message that names the value and the fix. */
export class SampleError extends Error {
  readonly code: SampleErrorCode;
  constructor(code: SampleErrorCode, message: string) {
    super(message);
    this.name = 'SampleError';
    this.code = code;
  }
}

export type SampleOptions = {
  /** Under public/. */
  readonly timings: string;
  /** Under public/. */
  readonly out: string;
  /** The clip to download; `null`: the one the timings name. */
  readonly url: string | null;
  readonly force: boolean;
};

export type SampleCommand = {readonly kind: 'help'} | {readonly kind: 'run'; readonly options: SampleOptions};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/** The command line, `process.argv.slice(2)`: `--name value` or `--name=value`. `SAMPLE_USAGE` for anything else. */
export const parseSampleArgs = (argv: readonly string[]): SampleCommand => {
  let timings = DEFAULT_TIMINGS;
  let out = DEFAULT_OUT;
  let url: string | null = null;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') return {kind: 'help'};
    if (arg === '--force') {
      force = true;
      continue;
    }
    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = equals < 0 ? arg : arg.slice(0, equals);
    const inline = equals < 0 ? undefined : arg.slice(equals + 1);
    if (name !== '--timings' && name !== '--out' && name !== '--url') {
      throw new SampleError(
        'SAMPLE_USAGE',
        `Unknown argument "${arg}". Run \`bun run sample --help\` for the options.`,
      );
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === '' || (inline === undefined && value.startsWith('--'))) {
      throw new SampleError(
        'SAMPLE_USAGE',
        `${name} needs a value, e.g. ${name} ${name === '--url' ? 'https://…/clip.mp3' : DEFAULT_OUT}.`,
      );
    }
    if (name === '--timings') timings = value;
    else if (name === '--out') out = value;
    else {
      if (!isHttpUrl(value)) {
        throw new SampleError('SAMPLE_USAGE', `--url "${value}" is not an http(s) URL. Pass the clip's full URL.`);
      }
      url = value;
    }
  }
  return {kind: 'run', options: {timings, out, url, force}};
};

/**
 * The absolute path of `relative` under `publicDir` (a leading `public/` or `/` is tolerated, as the
 * props write them). `SAMPLE_USAGE` for a path that leaves public/.
 */
export const publicPath = (publicDir: string, relative: string, flag: '--timings' | '--out'): string => {
  const trimmed = relative.replace(/^\/+/, '').replace(/^public\//, '');
  const resolved = path.resolve(publicDir, trimmed);
  const inside = path.relative(publicDir, resolved);
  if (trimmed === '' || inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) {
    throw new SampleError(
      'SAMPLE_USAGE',
      `${flag} "${relative}" is not a file under public/. Give a path like ${DEFAULT_OUT}.`,
    );
  }
  return resolved;
};

/**
 * `--out` under public/ (`publicPath()`), refused (`SAMPLE_USAGE`) unless .gitignore keeps it out
 * of git: a file under public/mushaf-studio/ with one of `IGNORED_AUDIO_EXTENSIONS`. The recording
 * is the reciter's, so the script never writes it where it could be committed.
 */
export const outPath = (publicDir: string, relative: string): string => {
  const dest = publicPath(publicDir, relative, '--out');
  const parts = path.relative(publicDir, dest).split(path.sep);
  if (parts.length < 2 || parts[0] !== IGNORED_DIR || !IGNORED_AUDIO_EXTENSIONS.includes(path.extname(dest))) {
    throw new SampleError(
      'SAMPLE_USAGE',
      `--out "${relative}" is not a recording .gitignore keeps out of git: give a file under public/${IGNORED_DIR}/ ending in ${IGNORED_AUDIO_EXTENSIONS.join(', ')}, e.g. ${DEFAULT_OUT}. The recording is the reciter's and must not be committed.`,
    );
  }
  return dest;
};

/** `alignment.recitation.audioUrl` of a timings file's JSON; `SAMPLE_TIMINGS` naming the file when it has none. */
export const clipUrlOf = (json: unknown, file: string): string => {
  const alignment = (json as {alignment?: {recitation?: {audioUrl?: unknown}}} | null)?.alignment;
  const url = alignment?.recitation?.audioUrl;
  if (typeof url !== 'string' || !isHttpUrl(url)) {
    throw new SampleError(
      'SAMPLE_TIMINGS',
      `The timings ${file} name no clip (alignment.recitation.audioUrl is ${url === undefined ? 'missing' : JSON.stringify(url)}): they were not made from the aligner's catalogue. Pass the recording's URL with --url, or copy the recording to public/ yourself.`,
    );
  }
  return url;
};

export type DownloadIo = {
  readonly fetch: typeof fetch;
  readonly log: (line: string) => void;
  readonly timeoutMs?: number | undefined;
  readonly attempts?: number | undefined;
};

const describeFailure = (error: unknown, timeoutMs: number): string => {
  if (error instanceof Error && error.name === 'AbortError')
    return `no answer within ${Math.round(timeoutMs / 1000)} s`;
  return error instanceof Error ? error.message : String(error);
};

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/**
 * Whether `bytes` start as a recording does: an ID3 tag or an MPEG/ADTS frame sync (MP3, AAC), an
 * MP4 `ftyp` box (M4A), RIFF WAVE, Ogg, FLAC or Matroska (WebM). A proxy's or captive portal's HTML
 * page is none of them.
 */
export const looksLikeAudio = (bytes: Uint8Array): boolean =>
  startsWith(bytes, ascii('ID3')) ||
  (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) ||
  startsWith(bytes, ascii('ftyp'), 4) ||
  (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WAVE'), 8)) ||
  startsWith(bytes, ascii('OggS')) ||
  startsWith(bytes, ascii('fLaC')) ||
  startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);

/** The first bytes as text, for a message: printable ASCII kept, anything else a dot. */
export const previewOf = (bytes: Uint8Array): string =>
  String.fromCharCode(...bytes.subarray(0, 40))
    .replace(/[^\x20-\x7e]/g, '.')
    .trim();

/**
 * One attempt: the whole body within `timeoutMs`, an error for any status but 2xx, for an empty body
 * and for a body that is not audio (by its first bytes, or an `audio/*` content type), naming what
 * arrived instead.
 */
const fetchBytes = async (url: string, io: DownloadIo, timeoutMs: number): Promise<Uint8Array> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await io.fetch(url, {signal: controller.signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error('the server sent an empty file');
    const type = response.headers.get('content-type') ?? '';
    if (!looksLikeAudio(bytes) && !/^audio\//i.test(type)) {
      throw new Error(
        `the server sent ${type === '' ? 'a file with no content type' : type}, not audio: it starts with "${previewOf(bytes)}"`,
      );
    }
    return bytes;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Downloads `url` to `dest` (through `dest.part`, so an interrupted download never leaves a broken
 * file under the real name), retrying once (`attempts`) with each try bounded by `timeoutMs`.
 * Resolves with the bytes written; `SAMPLE_DOWNLOAD` naming the URL, the last failure and the fix.
 */
export const downloadClip = async (url: string, dest: string, io: DownloadIo): Promise<number> => {
  const timeoutMs = io.timeoutMs ?? TIMEOUT_MS;
  const attempts = Math.max(1, io.attempts ?? ATTEMPTS);
  let failure = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const bytes = await fetchBytes(url, io, timeoutMs);
      await mkdir(path.dirname(dest), {recursive: true});
      const part = `${dest}.part`;
      await writeFile(part, bytes);
      await rename(part, dest);
      return bytes.byteLength;
    } catch (error) {
      failure = describeFailure(error, timeoutMs);
      if (attempt < attempts) io.log(`sample: download failed (${failure}); trying once more`);
    }
  }
  await rm(`${dest}.part`, {force: true});
  throw new SampleError(
    'SAMPLE_DOWNLOAD',
    `Could not download ${url} (${failure}, ${attempts} ${attempts === 1 ? 'try' : 'tries'}). Check your connection (or proxy) and run \`bun run sample\` again, or save the clip as ${dest} yourself.`,
  );
};

const sizeOf = async (file: string): Promise<number | null> => {
  try {
    const info = await stat(file);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
};

/** The first `count` bytes of a file. */
const headOf = async (file: string, count = 64): Promise<Uint8Array> => {
  const handle = await open(file, 'r');
  try {
    const buffer = new Uint8Array(count);
    const {bytesRead} = await handle.read(buffer, 0, count, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const kb = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export type SampleIo = DownloadIo & {
  /** The app's public/ folder. */
  readonly publicDir: string;
};

/**
 * The script: nothing to do when `out` (a path .gitignore keeps out of git, `outPath()`) is there,
 * not empty and audio, unless `force`; else the clip of `url`, or the one the timings name,
 * downloaded to it. Resolves with the exit code, 0 once the file is there; `SampleError` otherwise.
 */
export const runSample = async (options: SampleOptions, io: SampleIo): Promise<number> => {
  const dest = outPath(io.publicDir, options.out);
  const shown = path.relative(path.dirname(io.publicDir), dest);
  const existing = await sizeOf(dest);
  if (existing !== null && existing > 0 && !options.force) {
    const head = await headOf(dest);
    if (looksLikeAudio(head)) {
      io.log(`sample: ${shown} is already there (${kb(existing)}); nothing to do.`);
      return 0;
    }
    io.log(`sample: ${shown} is not audio (it starts with "${previewOf(head)}"); downloading it again.`);
  }
  let url = options.url;
  if (url === null) {
    const timingsPath = publicPath(io.publicDir, options.timings, '--timings');
    const timingsShown = path.relative(path.dirname(io.publicDir), timingsPath);
    let text: string;
    try {
      text = await readFile(timingsPath, 'utf8');
    } catch {
      throw new SampleError(
        'SAMPLE_TIMINGS',
        `The timings ${timingsShown} cannot be read. Check --timings (a path under public/), or pass the recording's URL with --url.`,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new SampleError(
        'SAMPLE_TIMINGS',
        `The timings ${timingsShown} are not JSON. Restore the file, or pass --url.`,
      );
    }
    url = clipUrlOf(json, timingsShown);
  }
  io.log(`sample: downloading ${url}`);
  const bytes = await downloadClip(url, dest, io);
  io.log(`sample: saved ${shown} (${kb(bytes)}). The recording is the reciter's: it stays out of git.`);
  return 0;
};

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const main = async (): Promise<number> => {
  const command = parseSampleArgs(process.argv.slice(2));
  if (command.kind === 'help') {
    console.log(USAGE);
    return 0;
  }
  return runSample(command.options, {
    publicDir: path.join(APP_DIR, 'public'),
    fetch: (input, init) => globalThis.fetch(input, init),
    log: (line) => console.log(line),
  });
};

// Run only as the script, not when the tests import it.
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`sample: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = error instanceof SampleError && error.code === 'SAMPLE_USAGE' ? 2 : 1;
    },
  );
}
