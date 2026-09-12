// Downloads page fonts from QUL's CDN (both sets, woff2 + ttf) into the example's public folder and
// the package's test fixtures, and checks them against the compiled layout.
import fs from 'node:fs';
import path from 'node:path';
import {EXAMPLE_FONTS_DIR, FIXTURE_FONTS_DIR, FIXTURE_PAGES, fetchWithRetry, log, runPool} from './cli.mjs';
import {expandPage} from './compile.mjs';
import {compareFonts, detectFontMagic, parseSfnt} from './sfnt.mjs';

const fontDirs = (set, page) => [
  path.join(EXAMPLE_FONTS_DIR, set),
  ...(FIXTURE_PAGES.includes(page) ? [path.join(FIXTURE_FONTS_DIR, set)] : []),
];

/**
 * @returns {{etags: object, report: string[], failed: boolean}} ETag entries of every downloaded
 * file, one report line per check, and whether anything failed.
 */
export const downloadFonts = async (def, pages, layout, {concurrency, allowZeroAdvance}) => {
  const etags = {};
  let failed = false;
  let done = 0;
  const perPage = await runPool(pages, Math.max(2, concurrency), async (page) => {
    const report = [];
    const parsedBySet = {};
    for (const set of Object.keys(def.fontSets)) {
      for (const wanted of ['woff2', 'ttf']) {
        // The CDN has gaps (page 328 of the tajweed set has no woff2): mirror the format it serves
        // instead, the same one the package's registry routes that page to.
        const formats = wanted === 'woff2' ? ['woff2', 'woff'] : ['ttf'];
        let saved = null;
        let lastError = null;
        for (const format of formats) {
          const url = def.fontUrl(set, page, format);
          let res;
          try {
            res = await fetchWithRetry(url, {accept: '*/*', origin: 'https://example.com'}); // like a browser, so the CORS header is recorded
          } catch (e) {
            lastError = e;
            if (/^HTTP 404 /.test(String(e.message))) continue;
            break;
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          const magic = detectFontMagic(bytes);
          if (magic !== format && !(format === 'ttf' && magic === 'otf')) {
            lastError = new Error(`not a ${format} file (magic ${magic ?? 'unknown'}, ${bytes.length} bytes)`);
            break;
          }
          etags[url] = {
            etag: res.headers.get('etag'),
            contentType: res.headers.get('content-type'),
            contentLength: bytes.length,
            cors: res.headers.get('access-control-allow-origin'),
          };
          for (const dir of fontDirs(set, page)) {
            fs.mkdirSync(dir, {recursive: true});
            fs.writeFileSync(path.join(dir, `p${page}.${format}`), bytes);
          }
          if (format === 'ttf') parsedBySet[set] = parseSfnt(bytes);
          saved = format;
          break;
        }
        if (saved === null) {
          report.push(`${set} p${page}.${wanted}: ${lastError?.message ?? 'not downloaded'}`);
          failed = true;
        } else if (saved !== wanted) {
          report.push(`${set} p${page}: the CDN has no ${wanted} for this page; mirrored its ${saved} instead`);
        }
      }
    }
    const plain = parsedBySet['qpc-v4'];
    const tajweed = parsedBySet['qpc-v4-tajweed'];
    if (plain && tajweed) {
      const problems = compareFonts(plain, tajweed);
      if (problems.length) {
        // The two sets are hinted/spaced independently (page 187 differs in two advances); each look
        // uses one set consistently, so this is informational, not a failure.
        report.push(
          `p${page}: plain and tajweed fonts differ in ${problems.length} place(s): ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ' …' : ''}`,
        );
      } else {
        report.push(
          `p${page}: plain and tajweed fonts agree (${tajweed.advances.size} code points, upem ${tajweed.unitsPerEm}, ${tajweed.family} / ${plain.family})`,
        );
      }
    }
    const font = tajweed ?? plain;
    if (font && layout) {
      const expanded = expandPage(layout, page);
      const zero = [];
      const unmapped = [];
      for (const line of expanded.lines) {
        for (const w of line.words) {
          const adv = font.advanceOfText(w.text);
          if (adv === null) unmapped.push(w.location);
          else if (adv === 0) zero.push(w.location);
        }
      }
      if (unmapped.length) {
        report.push(
          `p${page}: ${unmapped.length} word(s) use code points missing from the page font: ${unmapped.slice(0, 8).join(', ')}`,
        );
        failed = true;
      }
      if (zero.length) {
        report.push(
          `p${page}: ${zero.length} standalone zero-advance word(s): ${zero.join(', ')}${allowZeroAdvance ? ' (allowed)' : ''}`,
        );
        if (!allowZeroAdvance) failed = true;
      }
      if (!unmapped.length && !zero.length) report.push(`p${page}: every word maps to a glyph with a positive advance`);
    }
    done++;
    if (pages.length > 20 && done % 50 === 0) log(`fonts: ${done}/${pages.length} pages`);
    return report;
  });
  return {etags, report: perPage.flat(), failed};
};
