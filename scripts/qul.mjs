#!/usr/bin/env node
// The QUL data tools in one command. Zero dependencies; Node >= 22.13 (node:sqlite) for the
// commands that read the exports, Node >= 20 for fonts and ETags alone. Run it as `bun run qul
// <command>` or `node scripts/qul.mjs <command>`.
//
// The package itself never reads any of this: at render time it fetches QUL's two exports (the
// words JSON and the layout SQLite, URLs pinned in scripts/lib/datasets.mjs and the package's
// registry) from Tarteel's CDN, or the `data` source it is given, and builds the layout in memory.
// The mirror is for the suites, the Studio and offline renders, and for checking the CDN.
//
//   qul data [--etags]           Download the pinned exports into example/public/data/<dataset>/,
//                                validate them and record them in scripts/cdn-etags.json.
//
//   qul check [options]          Compile and validate the mirrored exports without downloading.
//     --layout-sqlite <db> --words <file>   other export files instead of the mirror
//     --pages <list>                        a subset (validation is then skipped)
//     --no-validate                         skip validation (debugging only)
//
//   qul compare [options]        Compile QUL's public preview pages (604 requests, cached under
//                                .cache/qul) and compare them, page by page, with the mirror.
//     --pages <list>                        a subset of pages
//     --cache <dir>                         preview page cache (default .cache/qul)
//     --concurrency <n>                     parallel requests (default 3; be polite to QUL)
//
//   qul fonts <pages|all> [options]   Download page fonts (both sets, woff2 + ttf) into
//                                example/public/fonts/<set>/ and, for pages 1, 10, 187 and 604,
//                                packages/…/test/fixtures/fonts/<set>/; checks every word of the
//                                mirrored layout against them and the plain set against the colour set.
//                                Also downloads the two shared fonts (surah names, quran-common)
//                                into example/public/fonts/<id>/ and checks their glyph tables.
//     --etags                               also refresh scripts/cdn-etags.json
//     --allow-zero-advance                  do not fail when a standalone word has zero advance
//     --concurrency <n>                     parallel downloads (default 3)
//
//   qul etags                    HEAD every CDN woff2 URL and write scripts/cdn-etags.json.
//
//   qul verify [--pages <list> | --all] [--data]
//                                Fetch page fonts (and, with --data, the two exports) cross-origin
//                                like a render would and check status, CORS, magic bytes and ETags
//                                (default pages 1,10,604).
//
//   qul mirror [--pages <list>] [--no-data] [--compare] [--no-push]
//                                Download the exports and the fonts (default: all pages) into the
//                                local mirror, refresh the ETags, commit the exports and the ETags
//                                (font files are never committed) and push the current branch.
//
// Page lists: "1,10,604", "1-20,187" or "all".

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {DEFAULT_CACHE_DIR, ETAGS_FILE, log, parsePageList, ROOT, readSurvey, writeSurvey} from './lib/cli.mjs';
import {LayoutValidationError} from './lib/compile.mjs';
import {
  compareLayouts,
  compilePages,
  downloadData,
  haveMirror,
  layoutFromExports,
  MIRROR_DIR,
  mirrorFiles,
  stableDataRecord,
} from './lib/data.mjs';
import {QPC_V4} from './lib/datasets.mjs';
import {recordEtags} from './lib/etags.mjs';
import {downloadFonts, downloadSharedFonts} from './lib/fonts.mjs';
import {fetchPages} from './lib/pages.mjs';
import {verifyCdn} from './lib/verify.mjs';

const def = QPC_V4;

const help = () => {
  const source = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(
    source
      .split('\n')
      .slice(1)
      .filter((l) => l.startsWith('//'))
      .map((l) => l.slice(3))
      .join('\n'),
  );
};

const options = {
  'layout-sqlite': {type: 'string'},
  words: {type: 'string'},
  cache: {type: 'string', default: DEFAULT_CACHE_DIR},
  concurrency: {type: 'string', default: '3'},
  pages: {type: 'string'},
  all: {type: 'boolean', default: false},
  data: {type: 'boolean', default: false},
  'no-data': {type: 'boolean', default: false},
  compare: {type: 'boolean', default: false},
  etags: {type: 'boolean', default: false},
  'allow-zero-advance': {type: 'boolean', default: false},
  'no-validate': {type: 'boolean', default: false},
  'no-push': {type: 'boolean', default: false},
  help: {type: 'boolean', default: false},
};

const {values: args, positionals} = parseArgs({options, allowPositionals: true, strict: true});
const [command, ...rest] = positionals;
const concurrency = Number(args.concurrency);
const subset = () => (args.pages ? parsePageList(args.pages, def.pages) : null);
const relative = (file) => path.relative(ROOT, file);

const noMirror = () =>
  new Error(
    `no mirror under ${relative(path.join(MIRROR_DIR, def.dataset))}/: run \`qul data\` (needs network), or pass --layout-sqlite and --words`,
  );

const data = async () => {
  const record = await downloadData(def);
  await layoutFromExports(def);
  writeSurvey({data: stableDataRecord(record, readSurvey()?.data ?? {})}, 'the data exports');
  if (args.etags) await recordEtags(def);
};

const check = async () => {
  let files;
  if (args['layout-sqlite'] || args.words) {
    if (!args['layout-sqlite'] || !args.words) throw new Error('--layout-sqlite and --words go together');
    files = {words: path.resolve(args.words), layout: path.resolve(args['layout-sqlite'])};
  } else {
    if (!haveMirror(def)) throw noMirror();
    files = mirrorFiles(def);
  }
  return layoutFromExports(def, files, {subset: subset(), validate: !args['no-validate']});
};

const compare = async () => {
  const pages = subset() ?? parsePageList('all', def.pages);
  if (!haveMirror(def)) throw noMirror();
  const exports = await layoutFromExports(def, mirrorFiles(def), {subset: subset()});
  log(`fetching ${pages.length} preview page(s) from ${def.previewUrl(1).replace(/\?.*$/, '')}`);
  const parsed = await fetchPages(def, pages, {cacheDir: args.cache, concurrency});
  const preview = compilePages(def, parsed, `qul-preview:layout-${def.layoutId}`, {subset: subset(), label: 'preview'});
  const differences = compareLayouts(exports, preview);
  if (differences.length === 0) {
    log(`preview and exports agree on every page (${exports.wordCount} words)`);
    return;
  }
  process.exitCode = 1;
  log(
    `preview and exports DIFFER in ${differences.length} place(s):\n - ${differences.slice(0, 40).join('\n - ')}${differences.length > 40 ? `\n - … ${differences.length - 40} more` : ''}`,
  );
};

const fonts = async (spec) => {
  if (!spec) throw new Error('qul fonts: which pages? e.g. `qul fonts 1,10,604` or `qul fonts all`');
  const pages = parsePageList(spec, def.pages);
  let layout = null;
  if (haveMirror(def)) layout = await layoutFromExports(def, mirrorFiles(def), {validate: false});
  else log('no mirror of the exports; the glyph coverage check is skipped (run `qul data` first)');
  log(
    `downloading fonts for ${pages.length} page(s): ${pages.length > 20 ? `${pages[0]}..${pages.at(-1)}` : pages.join(', ')}`,
  );
  const {etags, report, failed} = await downloadFonts(def, pages, layout, {
    concurrency,
    allowZeroAdvance: args['allow-zero-advance'],
  });
  for (const line of report) log(' -', line);
  log('downloading the shared fonts (surah names, quran-common)');
  const shared = await downloadSharedFonts(def);
  for (const line of shared.report) log(' -', line);
  if (failed || shared.failed) {
    process.exitCode = 1;
    log('font checks FAILED (see above)');
  }
  if (args.etags) await recordEtags(def, {...etags, ...shared.etags});
};

const verify = async () => {
  const pages = args.all ? parsePageList('all', def.pages) : parsePageList(args.pages ?? '1,10,604', def.pages);
  const {ok, problems} = await verifyCdn(def, pages, {data: args.data});
  for (const line of ok) console.log('ok  ', line);
  for (const line of problems) console.log('FAIL', line);
  console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall CDN checks passed');
  if (problems.length) process.exitCode = 1;
};

const mirror = async () => {
  const git = (...a) => execFileSync('git', a, {cwd: ROOT, encoding: 'utf8'}).trim();
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === 'HEAD') throw new Error('detached HEAD; check out the branch that should receive the commit first');
  if (git('diff', '--cached', '--name-only') !== '')
    throw new Error('the index already has staged changes; commit or unstage them first');
  const spec = args.pages ?? 'all';
  if (!args['no-data']) await data();
  if (args.compare) await compare();
  args.etags = true;
  await fonts(spec);
  // The mirrored exports and the ETags only; the font files stay local (.gitignore).
  git('add', MIRROR_DIR, ETAGS_FILE);
  if (git('diff', '--cached', '--name-only') === '') {
    log('nothing changed; nothing to commit');
    return;
  }
  const summary = git('diff', '--cached', '--shortstat');
  git(
    'commit',
    '-q',
    '-m',
    `Mirror QUL's exports (fonts surveyed: ${spec})`,
    '-m',
    `Pulled with \`qul mirror\`: ${summary}.`,
  );
  console.log(git('--no-pager', 'log', '-1', '--stat=80', '--format=%h %s'));
  if (!args['no-push']) git('push', '-u', 'origin', branch);
};

const main = async () => {
  if (args.help || !command) {
    help();
    process.exit(command ? 0 : 1);
  }
  switch (command) {
    case 'data':
      await data();
      break;
    case 'check':
      await check();
      break;
    case 'compare':
      await compare();
      break;
    case 'fonts':
      await fonts(rest[0]);
      break;
    case 'etags':
      await recordEtags(def);
      break;
    case 'verify':
      await verify();
      break;
    case 'mirror':
      await mirror();
      break;
    default:
      throw new Error(`unknown command "${command}" (run \`qul --help\`)`);
  }
  log(process.exitCode ? 'finished with errors' : 'done');
};

main().catch((e) => {
  const verbose = process.env.DEBUG && !(e instanceof LayoutValidationError);
  console.error(`[qul] ${verbose ? e.stack : (e.message ?? e)}`);
  if (!verbose && !(e instanceof LayoutValidationError)) console.error('[qul] (set DEBUG=1 for a stack trace)');
  process.exit(1);
});
