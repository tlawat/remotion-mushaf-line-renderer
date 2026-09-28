// Produce a recitation timings JSON for a recording with the QUD Universal Aligner (development tool,
// not part of the package). The audio is uploaded to the API; see qud-aligner.ts.
//
// Usage:
//   bun tools/align-with-qud.ts --audio audio/tawbah.mp3 --out public/audio/tawbah-timings.json \
//       [--api https://aligner.qud.dev/api/v1] [--model Base|Large] [--riwayah hafs] [--device GPU|CPU]
//       [--from-ayah N] [--to-ayah N]   (keep only these ayahs of what was recited)
import {mkdir, writeFile} from 'node:fs/promises';
import {basename, dirname} from 'node:path';
import {alignWithQud, DEFAULT_QUD_API, fromQudAligner} from './qud-aligner';

const USAGE =
  'usage: bun tools/align-with-qud.ts --audio <file> --out <timings.json> [--api <url>] [--model Base|Large] [--riwayah hafs|warsh|qalun|shuba] [--device GPU|CPU] [--from-ayah N] [--to-ayah N]';

const ayahArg = (value: string | undefined, name: string): number | undefined => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer, got ${value}`);
  return n;
};

const parseArgs = (argv: string[]): Record<string, string> => {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(USAGE);
    args[key.slice(2)] = value;
  }
  return args;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const {audio, out} = args;
  if (!audio || !out) throw new Error(USAGE);
  const api = args.api ?? DEFAULT_QUD_API;
  const model = args.model ?? 'Base';
  const log = (line: string) => console.error(`[qud] ${line}`);

  log(`uploading ${audio} to ${api} (model ${model}, ${args.device ?? 'GPU'}, ${args.riwayah ?? 'hafs'})`);
  const started = Date.now();
  const {align, timestamps} = await alignWithQud({audio, api, model, riwayah: args.riwayah, device: args.device});
  log(
    `aligned in ${((Date.now() - started) / 1000).toFixed(1)} s on the ${align.device ?? '?'}${align.warning ? ` (${align.warning})` : ''}`,
  );
  for (const s of align.segments) {
    const range = s.ref_from ? `${s.ref_from}-${s.ref_to}` : 'no reference';
    const flag = s.error ? `  ${s.error}` : s.confidence < 0.8 ? '  low confidence' : '';
    log(
      `seg ${String(s.segment).padStart(2)} ${s.time_from.toFixed(2).padStart(7)}-${s.time_to.toFixed(2).padStart(7)}  ${range}  ${Math.round(s.confidence * 100)}%${flag}`,
    );
  }

  const fromAyah = ayahArg(args['from-ayah'], 'from-ayah');
  const toAyah = ayahArg(args['to-ayah'], 'to-ayah');
  const timings = fromQudAligner(
    {align, timestamps},
    {
      audio: basename(audio),
      source: `aligner.qud.dev /align/audio + /timestamps, model ${model}, ${align.device ?? '?'}${toAyah === undefined && fromAyah === undefined ? '' : `, ayahs ${fromAyah ?? 1}-${toAyah ?? 'end'} kept`}`,
      fromAyah,
      toAyah,
    },
  );
  for (const a of timings.ayat) {
    const repeats = new Set(a.words?.filter((w, i, all) => all.findIndex((x) => x.id === w.id) !== i).map((w) => w.id));
    log(
      `${timings.surah}:${String(a.ayah).padEnd(3)} ${a.start.toFixed(2).padStart(7)} - ${a.end.toFixed(2).padStart(7)}  ${a.complete ? 'complete' : 'partial'} (${a.words?.length ?? 0} words${repeats.size ? `, repeated: ${[...repeats].join(' ')}` : ''})`,
    );
  }
  await mkdir(dirname(out), {recursive: true});
  await writeFile(out, `${JSON.stringify(timings, null, 1)}\n`);
  log(`wrote ${out}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
