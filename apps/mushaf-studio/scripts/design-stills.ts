#!/usr/bin/env bun
// `bun scripts/design-stills.ts`: renders the stills and strips of render-design.md 12.2 (V1-V20)
// into a round folder and checks them with scripts/design-check.ts. Each case's props are
// `applyFormat(applyLook(defaults, look), format)` and its overrides (scripts/design-cases.ts),
// written as whole style groups to `<case>.json`; the app is bundled once, with a copy of its
// `public/` that adds the files the cases read (V19's backdrop, the translation of V14 and V15, the
// paused timings of V4-slow), so nothing is written into the app. Dev only.
// `bun scripts/design-stills.ts --help` for the options.
import {spawn} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchQuranComTranslation, serialiseTranslation} from '@tlawat/mushaf-studio';
import {
  ASSET_PATHS,
  bundleArgs,
  casePropsFor,
  compositionsArgs,
  DESIGN_USAGE,
  type DesignAsset,
  type DesignCase,
  type DesignOptions,
  DesignUsageError,
  durationFrom,
  needsDuration,
  parseDesignArgs,
  pausedTimings,
  SAMPLE_PAUSE,
  SAMPLE_TIMINGS,
  selectCases,
  stillArgs,
  stillFile,
  stripArgs,
  stripDir,
  type TimingsJson,
} from './design-cases';
import {folderImages, formatReports, runChecks} from './design-check';
import {backdropImage, encodePng} from './design-image';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Saheeh International on quran.com, the translation V14 and V15 show. */
const SAHEEH_INTERNATIONAL = 20;

const log = (message: string): void => console.log(`design: ${message}`);

/** Runs `bunx <args>` in the app, its output collected; rejects with the output on failure. */
const run = (args: readonly string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('bunx', args, {cwd: APP_DIR, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`bunx ${args.join(' ')} exited with ${code}\n${output.trim()}`));
    });
  });

/** Runs `tasks` with at most `jobs` at once, in order of start. */
const pool = async (jobs: number, tasks: readonly (() => Promise<void>)[]): Promise<void> => {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length) {
      const task = tasks[next++];
      if (task !== undefined) await task();
    }
  };
  await Promise.all(Array.from({length: Math.min(jobs, tasks.length)}, worker));
};

/** The round's `public/`: the app's, with the backdrop, the paused timings and the translation added. Returns what it holds. */
const preparePublic = async (dir: string, options: DesignOptions): Promise<Set<DesignAsset>> => {
  const publicDir = path.join(dir, 'public');
  cpSync(path.join(APP_DIR, 'public'), publicDir, {recursive: true});
  mkdirSync(path.join(publicDir, 'design'), {recursive: true});
  const assets = new Set<DesignAsset>();
  writeFileSync(path.join(publicDir, ASSET_PATHS.backdrop), encodePng(backdropImage()));
  assets.add('backdrop');
  const sample = JSON.parse(readFileSync(path.join(publicDir, SAMPLE_TIMINGS), 'utf8')) as TimingsJson;
  writeFileSync(
    path.join(publicDir, ASSET_PATHS.paused),
    `${JSON.stringify(pausedTimings(sample, SAMPLE_PAUSE), null, 2)}\n`,
  );
  assets.add('paused');
  const translationFile = path.join(publicDir, ASSET_PATHS.translation);
  if (options.translation !== null) {
    cpSync(path.resolve(options.translation), translationFile);
    assets.add('translation');
  } else if (existsSync(translationFile)) assets.add('translation');
  else {
    try {
      const translation = await fetchQuranComTranslation({resourceId: SAHEEH_INTERNATIONAL, chapter: 1});
      writeFileSync(translationFile, serialiseTranslation(translation));
      assets.add('translation');
    } catch (error) {
      log(`no translation (${error instanceof Error ? error.message : String(error)}): V14 and V15 are skipped`);
    }
  }
  return assets;
};

const renderCase = (
  dir: string,
  bundle: string,
  designCase: DesignCase,
  durations: Readonly<Record<string, number>>,
  extra: readonly string[],
): (() => Promise<void>)[] => {
  const props = path.join(dir, `${designCase.id}.json`);
  return designCase.shots.flatMap((shot) => {
    if (shot.kind === 'strip') {
      const target = path.join(dir, stripDir(designCase.id));
      return [
        async () => {
          rmSync(target, {recursive: true, force: true});
          await run(stripArgs(bundle, designCase, target, shot.from, shot.to, props, extra));
          log(`${designCase.id}: f${shot.from}-f${shot.to}`);
        },
      ];
    }
    return shot.frames.map((wanted) => async () => {
      const last = durations[designCase.id];
      const frame = wanted === 'last' ? (last === undefined ? null : last - 1) : wanted;
      if (frame === null) {
        log(`${designCase.id}: no duration, last frame skipped`);
        return;
      }
      await run(stillArgs(bundle, designCase, path.join(dir, stillFile(designCase.id, frame)), frame, props, extra));
      log(`${designCase.id}: f${frame}`);
    });
  });
};

const main = async (): Promise<number> => {
  const options = parseDesignArgs(process.argv.slice(2));
  if (options === 'help') {
    console.log(DESIGN_USAGE);
    return 0;
  }
  const dir = path.resolve(APP_DIR, options.out, options.round);
  mkdirSync(dir, {recursive: true});
  const assets = await preparePublic(dir, options);
  const bundle = path.join(dir, 'bundle');
  if (!options.reuseBundle || !existsSync(path.join(bundle, 'index.html'))) {
    log('bundling');
    await run(bundleArgs('src/index.ts', bundle, path.join(dir, 'public'), options.extra));
  }

  const cases = selectCases(options.only).filter((c) => {
    const lacking = (c.assets ?? []).filter((a) => !assets.has(a));
    if (lacking.length > 0) log(`${c.id}: skipped, no ${lacking.join(', ')}`);
    return lacking.length === 0;
  });
  for (const c of cases) writeFileSync(path.join(dir, `${c.id}.json`), `${JSON.stringify(casePropsFor(c), null, 2)}\n`);

  const durationsFile = path.join(dir, 'durations.json');
  const durations: Record<string, number> = existsSync(durationsFile)
    ? (JSON.parse(readFileSync(durationsFile, 'utf8')) as Record<string, number>)
    : {};
  for (const c of cases.filter(needsDuration)) {
    const output = await run(compositionsArgs(bundle, path.join(dir, `${c.id}.json`), options.extra));
    const frames = durationFrom(output, c.composition);
    if (frames !== null) durations[c.id] = frames;
  }
  writeFileSync(durationsFile, `${JSON.stringify(durations, null, 2)}\n`);

  await pool(
    options.jobs,
    cases.flatMap((c) => renderCase(dir, bundle, c, durations, options.extra)),
  );
  log(`rendered into ${dir}`);
  if (!options.check) return 0;
  const reports = runChecks(
    folderImages(dir),
    cases.map((c) => c.id),
  );
  console.log(formatReports(reports));
  writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(reports, null, 2)}\n`);
  const passed = reports.filter((r) => r.pass === true).map((r) => r.id);
  log(`${passed.length} of ${reports.length} cases pass: ${passed.join(' ')}`);
  return 0;
};

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`design: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof DesignUsageError ? 2 : 1;
  },
);
