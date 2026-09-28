// Probes QUL's CDN the way a Remotion render will use it: cross-origin fetch of page fonts and
// (with `data`) of the two exports the package builds the layout from, checking status, CORS
// header, magic bytes and (when scripts/cdn-etags.json exists) that the ETags still match the ones
// recorded when the fonts and the exports were mirrored.
import {createHash} from 'node:crypto';
import {readSurvey} from './cli.mjs';
import {detectFontMagic} from './sfnt.mjs';

const USER_AGENT = 'remotion-mushaf-line-renderer/qul verify';

export const verifyCdn = async (def, pages, {data = false} = {}) => {
  const survey = readSurvey();
  const recorded = survey?.entries ?? null;
  const problems = [];
  const ok = [];
  /** One data export: served, cross-origin, a zip, and (when recorded) unchanged since the mirror was taken. */
  const checkExport = async (part) => {
    const url = def.exports[part];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 180_000);
      const res = await fetch(url, {
        headers: {origin: 'https://example.com', 'user-agent': USER_AGENT},
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        problems.push(
          `${part} export: HTTP ${res.status} for ${url} — QUL publishes each export under a new prefix; find the current link on qul.tarteel.ai and update scripts/lib/datasets.mjs and the package's registry`,
        );
        return;
      }
      const cors = res.headers.get('access-control-allow-origin');
      if (cors !== '*' && cors !== 'https://example.com')
        problems.push(
          `${part} export: access-control-allow-origin is ${JSON.stringify(cors)}, expected "*" — no Remotion render path can fetch it; renders must pass a mirror as \`data\``,
        );
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!(bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50))
        problems.push(
          `${part} export: body is not a zip (${bytes.length} bytes, starts with ${JSON.stringify(bytes.subarray(0, 16).toString('latin1'))})`,
        );
      const etag = res.headers.get('etag');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const known = survey?.data?.[part];
      if (known?.url === url && known.etag && etag !== known.etag)
        problems.push(
          `${part} export: ETag changed since scripts/cdn-etags.json (${known.etag} → ${etag}); re-run \`qul data\` and the suites`,
        );
      if (known?.url === url && known.sha256 && sha256 !== known.sha256)
        problems.push(
          `${part} export: content changed since scripts/cdn-etags.json (sha256 ${known.sha256} → ${sha256})`,
        );
      ok.push(
        `${part} export: ${bytes.length} bytes, CORS ${cors}, cache-control ${res.headers.get('cache-control')}, etag ${etag}, sha256 ${sha256.slice(0, 12)}…`,
      );
    } catch (e) {
      problems.push(`${part} export: ${e.message}`);
    }
  };
  const check = async (set, page, format) => {
    const url = page === null ? def.sharedFontUrl(set, format) : def.fontUrl(set, page, format);
    const what = page === null ? `${set} ${def.sharedFonts[set].file}.${format}` : `${set} p${page}.${format}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(url, {
        headers: {origin: 'https://example.com', 'user-agent': USER_AGENT},
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        problems.push(`${what}: HTTP ${res.status}`);
        return;
      }
      const cors = res.headers.get('access-control-allow-origin');
      if (cors !== '*' && cors !== 'https://example.com') {
        problems.push(`${what}: access-control-allow-origin is ${JSON.stringify(cors)}, expected "*"`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const magic = detectFontMagic(bytes);
      if (magic !== format && !(format === 'ttf' && magic === 'otf')) {
        problems.push(`${what}: body is not a ${format} (magic ${magic ?? 'unknown'}, ${bytes.length} bytes)`);
      }
      const etag = res.headers.get('etag');
      if (recorded?.[url]?.etag && etag !== recorded[url].etag) {
        problems.push(
          `${what}: ETag changed since scripts/cdn-etags.json (${recorded[url].etag} → ${etag}); the font may have been republished — re-run \`qul fonts\` and re-check the rendering`,
        );
      }
      ok.push(
        `${what}: ${bytes.length} bytes, CORS ${cors}, cache-control ${res.headers.get('cache-control')}, etag ${etag}`,
      );
    } catch (e) {
      problems.push(`${what}: ${e.message}`);
    }
  };
  if (data) for (const part of ['words', 'layout']) await checkExport(part);
  for (const page of pages) {
    for (const set of Object.keys(def.fontSets)) {
      for (const format of ['woff2', 'ttf']) await check(set, page, format);
    }
  }
  // The shared fonts, which every render with a surah name or juz name fetches.
  for (const id of Object.keys(def.sharedFonts)) await check(id, null, 'woff2');
  return {ok, problems};
};
