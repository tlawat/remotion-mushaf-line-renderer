// `bun run sample`: the arguments, the timings' clip URL, the download (one retry, a timeout, never
// a half-written file) and the run (nothing to do once the file is there), against a temporary
// public/ folder and a fake fetch; and the committed sample's timings, which must name their clip.
import {existsSync} from 'node:fs';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  ATTEMPTS,
  clipUrlOf,
  DEFAULT_OUT,
  DEFAULT_TIMINGS,
  downloadClip,
  IGNORED_AUDIO_EXTENSIONS,
  IGNORED_DIR,
  looksLikeAudio,
  outPath,
  parseSampleArgs,
  previewOf,
  publicPath,
  runSample,
  SampleError,
  TIMEOUT_MS,
} from './sample';

const CLIP = 'https://clips.test/abdul_hamid_ghraio_2025_yt/1.mp3?start_ms=2909&end_ms=30695';
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0]);
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_PUBLIC = path.join(APP_DIR, 'public');
const PORTAL = '<!DOCTYPE html><html><body>Sign in to the Wi-Fi</body></html>';

/** The SampleError a download fails with; an error when it does not fail. */
const failure = (pending: Promise<unknown>): Promise<SampleError> =>
  pending.then(
    () => {
      throw new Error('expected the download to fail');
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(SampleError);
      return error as SampleError;
    },
  );

const usage = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SampleError);
    return error as SampleError;
  }
  throw new Error('expected a SampleError');
};

describe('parseSampleArgs', () => {
  it('defaults to the sample’s timings and the compositions’ audioFile', () => {
    expect(parseSampleArgs([])).toEqual({
      kind: 'run',
      options: {timings: DEFAULT_TIMINGS, out: DEFAULT_OUT, url: null, force: false},
    });
    expect(DEFAULT_TIMINGS).toBe('mushaf-studio/fatiha/timings.json');
    expect(DEFAULT_OUT).toBe('mushaf-studio/fatiha/audio.mp3');
    expect(TIMEOUT_MS).toBe(120_000);
    expect(ATTEMPTS).toBe(2);
  });

  it('reads every option, as two arguments or one with =', () => {
    expect(parseSampleArgs(['--timings', 't.json', '--out=a=b.mp3', `--url=${CLIP}`, '--force'])).toEqual({
      kind: 'run',
      options: {timings: 't.json', out: 'a=b.mp3', url: CLIP, force: true},
    });
    expect(parseSampleArgs(['--out', 'x.mp3', '-h'])).toEqual({kind: 'help'});
    expect(parseSampleArgs(['--help'])).toEqual({kind: 'help'});
  });

  it('refuses an unknown argument, a missing value and a URL that is not one', () => {
    expect(usage(() => parseSampleArgs(['--bogus'])).message).toContain('Unknown argument "--bogus"');
    expect(usage(() => parseSampleArgs(['clip.mp3'])).code).toBe('SAMPLE_USAGE');
    expect(usage(() => parseSampleArgs(['--out'])).message).toContain('--out needs a value');
    expect(usage(() => parseSampleArgs(['--out', '--force'])).message).toContain('--out needs a value');
    expect(usage(() => parseSampleArgs(['--timings='])).message).toContain('--timings needs a value');
    expect(usage(() => parseSampleArgs(['--url', 'clip.mp3'])).message).toContain(
      '--url "clip.mp3" is not an http(s) URL',
    );
  });
});

describe('publicPath', () => {
  const root = path.resolve('/app/public');

  it('resolves under public/, a leading public/ or / tolerated', () => {
    expect(publicPath(root, 'mushaf-studio/a.mp3', '--out')).toBe(path.join(root, 'mushaf-studio/a.mp3'));
    expect(publicPath(root, 'public/mushaf-studio/a.mp3', '--out')).toBe(path.join(root, 'mushaf-studio/a.mp3'));
    expect(publicPath(root, '/mushaf-studio/a.mp3', '--out')).toBe(path.join(root, 'mushaf-studio/a.mp3'));
  });

  it('refuses a path that leaves public/, or is public/ itself', () => {
    for (const bad of ['../a.mp3', 'mushaf-studio/../../a.mp3', '', '.', 'public/']) {
      const error = usage(() => publicPath(root, bad, '--out'));
      expect(error.code).toBe('SAMPLE_USAGE');
      expect(error.message).toContain(`--out "${bad}" is not a file under public/`);
    }
  });
});

describe('outPath', () => {
  const root = path.resolve('/app/public');

  it('takes a recording under public/mushaf-studio/ with an extension .gitignore ignores', () => {
    expect(outPath(root, DEFAULT_OUT)).toBe(path.join(root, DEFAULT_OUT));
    expect(outPath(root, 'public/mushaf-studio/p/clip.m4a')).toBe(path.join(root, 'mushaf-studio/p/clip.m4a'));
    expect(outPath(root, 'mushaf-studio/clip.opus')).toBe(path.join(root, 'mushaf-studio/clip.opus'));
  });

  it('refuses a path git would not ignore, naming the fix', () => {
    for (const bad of [
      'p/clip.mp3',
      'clip.mp3',
      'mushaf-studio.mp3',
      'mushaf-studio/clip.txt',
      'mushaf-studio/a.MP3',
    ]) {
      const error = usage(() => outPath(root, bad));
      expect(error.code).toBe('SAMPLE_USAGE');
      expect(error.message).toContain(`--out "${bad}" is not a recording .gitignore keeps out of git`);
      expect(error.message).toContain(DEFAULT_OUT);
    }
    expect(usage(() => outPath(root, '../a.mp3')).message).toContain('is not a file under public/');
  });

  it('matches the app’s .gitignore, the partial download included', async () => {
    const patterns = (await readFile(path.join(APP_DIR, '.gitignore'), 'utf8')).split('\n');
    for (const extension of [...IGNORED_AUDIO_EXTENSIONS, '.part']) {
      expect(patterns).toContain(`public/${IGNORED_DIR}/**/*${extension}`);
    }
  });
});

describe('looksLikeAudio', () => {
  const bytes = (...values: (number | string)[]) =>
    new Uint8Array(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])));

  it('knows a recording by its first bytes', () => {
    expect(looksLikeAudio(MP3)).toBe(true);
    expect(looksLikeAudio(bytes(0xff, 0xfb, 0x90, 0x64))).toBe(true);
    expect(looksLikeAudio(bytes(0, 0, 0, 0x20, 'ftypM4A '))).toBe(true);
    expect(looksLikeAudio(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBe(true);
    expect(looksLikeAudio(bytes('OggS'))).toBe(true);
    expect(looksLikeAudio(bytes('fLaC'))).toBe(true);
    expect(looksLikeAudio(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
  });

  it('is false for a web page, JSON or nothing', () => {
    expect(looksLikeAudio(new TextEncoder().encode(PORTAL))).toBe(false);
    expect(looksLikeAudio(new TextEncoder().encode('{"error":"nope"}'))).toBe(false);
    expect(looksLikeAudio(new Uint8Array(0))).toBe(false);
    // The first 40 bytes, anything but printable ASCII a dot.
    expect(previewOf(new TextEncoder().encode(PORTAL))).toBe(PORTAL.slice(0, 40));
    expect(previewOf(bytes(0, 'abc', 10, 'd'))).toBe('.abc.d');
  });
});

describe('clipUrlOf', () => {
  it('reads alignment.recitation.audioUrl', () => {
    expect(clipUrlOf({alignment: {recitation: {audioUrl: CLIP}}}, 'public/t.json')).toBe(CLIP);
  });

  it('names the file and the fix when there is no clip', () => {
    for (const json of [null, {}, {alignment: {}}, {alignment: {recitation: {audioUrl: 'a.mp3'}}}]) {
      const error = usage(() => clipUrlOf(json, 'public/t.json'));
      expect(error.code).toBe('SAMPLE_TIMINGS');
      expect(error.message).toContain('The timings public/t.json name no clip');
      expect(error.message).toContain('--url');
    }
  });

  it('finds the clip of the committed sample, and its loudness beside it', async () => {
    const json = JSON.parse(await readFile(path.join(APP_PUBLIC, DEFAULT_TIMINGS), 'utf8'));
    expect(clipUrlOf(json, DEFAULT_TIMINGS)).toMatch(/^https:\/\/.+\.mp3\?start_ms=2909&end_ms=30695$/);
    const audio = json.alignment.audio;
    expect(Object.keys(audio)).toEqual(['lufs', 'peak', 'firstSoundSeconds', 'durationSeconds']);
    expect(audio.lufs).toBeGreaterThan(-30);
    expect(audio.lufs).toBeLessThan(-10);
    expect(audio.peak).toBeGreaterThan(0);
    expect(audio.peak).toBeLessThanOrEqual(1);
    expect(audio.firstSoundSeconds).toBeLessThan(json.ayat[0].start);
    // The clip's own length: the file's durationSeconds, give or take the MP3's padding.
    expect(Math.abs(audio.durationSeconds - json.durationSeconds)).toBeLessThan(0.5);
  });
});

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mushaf-sample-'));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, {recursive: true, force: true});
});

const ok = () => vi.fn(async () => new Response(MP3));
const failing = (...statuses: number[]) => {
  const queue = [...statuses];
  return vi.fn(async () => {
    const status = queue.shift();
    return status === undefined ? new Response(MP3) : new Response('nope', {status});
  });
};

describe('downloadClip', () => {
  it('writes the clip, creating its folder, and leaves no partial file', async () => {
    const dest = path.join(dir, 'mushaf-studio', 'fatiha', 'audio.mp3');
    const log = vi.fn();
    expect(await downloadClip(CLIP, dest, {fetch: ok(), log})).toBe(MP3.byteLength);
    expect(new Uint8Array(await readFile(dest))).toEqual(MP3);
    expect(await readdir(path.dirname(dest))).toEqual(['audio.mp3']);
    expect(log).not.toHaveBeenCalled();
  });

  it('tries once more after a failure, and says so', async () => {
    const fetch = failing(503);
    const log = vi.fn();
    await downloadClip(CLIP, path.join(dir, 'a.mp3'), {fetch, log});
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('sample: download failed (HTTP 503); trying once more');
  });

  it('fails with SAMPLE_DOWNLOAD naming the URL, the failure and the fix after the retry', async () => {
    const fetch = failing(404, 404, 404);
    const dest = path.join(dir, 'a.mp3');
    const error = await failure(downloadClip(CLIP, dest, {fetch, log: () => undefined}));
    expect(error.code).toBe('SAMPLE_DOWNLOAD');
    expect(error.message).toContain(`Could not download ${CLIP} (HTTP 404, 2 tries)`);
    expect(error.message).toContain(dest);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it('refuses a body that is not audio, naming what arrived, unless its type says audio', async () => {
    const page = vi.fn(async () => new Response(PORTAL, {headers: {'content-type': 'text/html'}}));
    const dest = path.join(dir, 'a.mp3');
    const error = await failure(downloadClip(CLIP, dest, {fetch: page, log: () => undefined}));
    expect(error.code).toBe('SAMPLE_DOWNLOAD');
    expect(error.message).toContain('the server sent text/html, not audio: it starts with "<!DOCTYPE html>');
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(false);
    const typed = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {headers: {'content-type': 'audio/mpeg'}}));
    expect(await downloadClip(CLIP, dest, {fetch: typed, log: () => undefined})).toBe(3);
  });

  it('refuses an empty body', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(0)));
    const error = await failure(
      downloadClip(CLIP, path.join(dir, 'a.mp3'), {fetch, log: () => undefined, attempts: 1}),
    );
    expect(error.message).toContain('the server sent an empty file, 1 try');
  });

  it('gives each try timeoutMs, response and body', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const log = vi.fn();
    const pending = failure(downloadClip(CLIP, path.join(dir, 'a.mp3'), {fetch, log, timeoutMs: 5_000}));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(log).toHaveBeenCalledWith('sample: download failed (no answer within 5 s); trying once more');
    await vi.advanceTimersByTimeAsync(5_000);
    const error = await pending;
    expect(error.message).toContain('no answer within 5 s, 2 tries');
  });
});

describe('runSample', () => {
  const writeTimings = async (json: unknown, file = DEFAULT_TIMINGS) => {
    const at = path.join(dir, file);
    await mkdir(path.dirname(at), {recursive: true});
    await writeFile(at, JSON.stringify(json));
  };
  const options = (changes: Partial<Parameters<typeof runSample>[0]> = {}) => ({
    timings: DEFAULT_TIMINGS,
    out: DEFAULT_OUT,
    url: null,
    force: false,
    ...changes,
  });

  it('downloads the clip the timings name to the default audioFile', async () => {
    await writeTimings({alignment: {recitation: {audioUrl: CLIP}}});
    const fetch = ok();
    const log = vi.fn();
    expect(await runSample(options(), {publicDir: dir, fetch, log})).toBe(0);
    expect(fetch).toHaveBeenCalledWith(CLIP, expect.objectContaining({signal: expect.any(AbortSignal)}));
    expect(new Uint8Array(await readFile(path.join(dir, DEFAULT_OUT)))).toEqual(MP3);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      `sample: downloading ${CLIP}`,
      `sample: saved ${path.join(path.basename(dir), DEFAULT_OUT)} (1 KB). The recording is the reciter's: it stays out of git.`,
    ]);
  });

  it('does nothing when the file is there, unless forced', async () => {
    await mkdir(path.join(dir, 'mushaf-studio', 'fatiha'), {recursive: true});
    await writeFile(path.join(dir, DEFAULT_OUT), 'ID3 already');
    const fetch = ok();
    const log = vi.fn();
    expect(await runSample(options(), {publicDir: dir, fetch, log})).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![0]).toMatch(/audio\.mp3 is already there \(1 KB\); nothing to do\.$/);
    expect(await runSample(options({url: CLIP, force: true}), {publicDir: dir, fetch, log})).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await readFile(path.join(dir, DEFAULT_OUT)))).toEqual(MP3);
  });

  it('downloads a leftover that is not audio again', async () => {
    await mkdir(path.join(dir, 'mushaf-studio', 'fatiha'), {recursive: true});
    await writeFile(path.join(dir, DEFAULT_OUT), PORTAL);
    await writeTimings({alignment: {recitation: {audioUrl: CLIP}}});
    const fetch = ok();
    const log = vi.fn();
    await runSample(options(), {publicDir: dir, fetch, log});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(
      /audio\.mp3 is not audio \(it starts with "<!DOCTYPE html>.*"\); downloading it again\.$/,
    );
    expect(new Uint8Array(await readFile(path.join(dir, DEFAULT_OUT)))).toEqual(MP3);
  });

  it('downloads an empty leftover again', async () => {
    await mkdir(path.join(dir, 'mushaf-studio', 'fatiha'), {recursive: true});
    await writeFile(path.join(dir, DEFAULT_OUT), '');
    await writeTimings({alignment: {recitation: {audioUrl: CLIP}}});
    const fetch = ok();
    await runSample(options(), {publicDir: dir, fetch, log: () => undefined});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('takes --url instead of the timings, and --out anywhere under public/mushaf-studio/', async () => {
    const fetch = ok();
    await runSample(options({url: CLIP, out: 'public/mushaf-studio/p/clip.mp3', timings: 'missing.json'}), {
      publicDir: dir,
      fetch,
      log: () => undefined,
    });
    expect(existsSync(path.join(dir, 'mushaf-studio', 'p', 'clip.mp3'))).toBe(true);
  });

  it('refuses an --out git would not ignore before any request', async () => {
    const fetch = ok();
    await expect(
      runSample(options({url: CLIP, out: 'public/p/clip.mp3'}), {publicDir: dir, fetch, log: () => undefined}),
    ).rejects.toMatchObject({code: 'SAMPLE_USAGE'});
    expect(fetch).not.toHaveBeenCalled();
    expect(existsSync(path.join(dir, 'p'))).toBe(false);
  });

  it('names the timings and the fix when they cannot be read, are not JSON or name no clip', async () => {
    const run = () => runSample(options(), {publicDir: dir, fetch: ok(), log: () => undefined});
    await expect(run()).rejects.toMatchObject({
      code: 'SAMPLE_TIMINGS',
      message: expect.stringContaining('cannot be read'),
    });
    await mkdir(path.join(dir, 'mushaf-studio', 'fatiha'), {recursive: true});
    await writeFile(path.join(dir, DEFAULT_TIMINGS), '{');
    await expect(run()).rejects.toMatchObject({
      code: 'SAMPLE_TIMINGS',
      message: expect.stringContaining('are not JSON'),
    });
    await writeTimings({version: 1, surah: 1, ayat: []});
    await expect(run()).rejects.toMatchObject({
      code: 'SAMPLE_TIMINGS',
      message: expect.stringContaining('name no clip'),
    });
  });
});
