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
 * Downloads the shared fonts (surah names, quran-common; woff2 + ttf) into
 * example/public/fonts/<id>/, and checks the ttf: the surah-name font must map exactly the 114
 * code points the package's registry lists, quran-common the 30 juz names and the frame.
 *
 * @returns {{etags: object, report: string[], failed: boolean}}
 */
export const downloadSharedFonts = async (def) => {
  const etags = {};
  const report = [];
  let failed = false;
  for (const [id, spec] of Object.entries(def.sharedFonts)) {
    const dir = path.join(EXAMPLE_FONTS_DIR, id);
    let parsed = null;
    for (const format of ['woff2', 'ttf']) {
      const url = def.sharedFontUrl(id, format);
      let res;
      try {
        res = await fetchWithRetry(url, {accept: '*/*', origin: 'https://example.com'});
      } catch (e) {
        report.push(`${id} ${spec.file}.${format}: ${e.message}`);
        failed = true;
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const magic = detectFontMagic(bytes);
      if (magic !== format && !(format === 'ttf' && magic === 'otf')) {
        report.push(
          `${id} ${spec.file}.${format}: not a ${format} file (magic ${magic ?? 'unknown'}, ${bytes.length} bytes)`,
        );
        failed = true;
        continue;
      }
      etags[url] = {
        etag: res.headers.get('etag'),
        contentType: res.headers.get('content-type'),
        contentLength: bytes.length,
        cors: res.headers.get('access-control-allow-origin'),
      };
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(path.join(dir, `${spec.file}.${format}`), bytes);
      if (format === 'ttf') parsed = parseSfnt(bytes);
    }
    if (!parsed) continue;
    const problems = checkSharedFont(id, parsed);
    if (problems.length) {
      report.push(`${id}: ${problems.join('; ')}`);
      failed = true;
    } else {
      report.push(
        `${id}: ${parsed.family}, upem ${parsed.unitsPerEm}, ${parsed.advances.size} code points mapped as the registry expects`,
      );
    }
  }
  return {etags, report, failed};
};

/** The 114 surah-name code points (1–21 in U+FC45–U+FC64, 22–114 in U+FB51–U+FBEB) the package's registry lists. */
export const SURAH_NAME_CODE_POINTS = [
  ...[0xfc45, 0xfc46, 0xfc47, 0xfc4a, 0xfc4b, 0xfc4e, 0xfc4f, 0xfc51, 0xfc52, 0xfc53, 0xfc55],
  ...[0xfc56, 0xfc58, 0xfc5a, 0xfc5b, 0xfc5c, 0xfc5d, 0xfc5e, 0xfc61, 0xfc62, 0xfc64],
  ...[0xfb51, 0xfb52, 0xfb54, 0xfb55, 0xfb57, 0xfb58, 0xfb5a, 0xfb5b, 0xfb5d, 0xfb5e, 0xfb60, 0xfb61, 0xfb63],
  ...[0xfb64, 0xfb66, 0xfb67, 0xfb69, 0xfb6a, 0xfb6c, 0xfb6d, 0xfb6f, 0xfb70, 0xfb72, 0xfb73, 0xfb75, 0xfb76],
  ...[0xfb78, 0xfb79, 0xfb7b, 0xfb7c, 0xfb7e, 0xfb7f, 0xfb81, 0xfb82, 0xfb84, 0xfb85, 0xfb87, 0xfb88, 0xfb8a],
  ...[0xfb8b, 0xfb8d, 0xfb8e, 0xfb90, 0xfb91, 0xfb93, 0xfb94, 0xfb96, 0xfb97, 0xfb99, 0xfb9a, 0xfb9c, 0xfb9d],
  ...[0xfb9f, 0xfba0, 0xfba2, 0xfba3, 0xfba5, 0xfba6, 0xfba8, 0xfba9, 0xfbab, 0xfbac, 0xfbae, 0xfbaf, 0xfbb1],
  ...[0xfbb2, 0xfbb4, 0xfbb5, 0xfbb7, 0xfbb8, 0xfbba, 0xfbbb, 0xfbbd, 0xfbbe, 0xfbc0, 0xfbc1, 0xfbd3, 0xfbd4],
  ...[0xfbd6, 0xfbd7, 0xfbd9, 0xfbda, 0xfbdc, 0xfbdd, 0xfbdf, 0xfbe0, 0xfbe2, 0xfbe3, 0xfbe5, 0xfbe6, 0xfbe8],
  ...[0xfbe9, 0xfbeb],
];

/** The glyphs the package draws from a shared font must be in it, with a positive advance. */
export const checkSharedFont = (id, font) => {
  const problems = [];
  const expectMapped = (cps, what) => {
    const missing = cps.filter((cp) => !font.advances.has(cp));
    const zero = cps.filter((cp) => font.advances.get(cp) === 0);
    if (missing.length)
      problems.push(
        `${missing.length} ${what} code point(s) missing: ${missing
          .slice(0, 5)
          .map((cp) => `U+${cp.toString(16).toUpperCase()}`)
          .join(', ')}`,
      );
    if (zero.length) problems.push(`${zero.length} ${what} glyph(s) with zero advance`);
  };
  if (id === 'surah-names-v4') {
    if (font.unitsPerEm !== 2500) problems.push(`unitsPerEm ${font.unitsPerEm}, expected 2500`);
    const inRanges = [...font.advances.keys()].filter(
      (cp) => (cp >= 0xfb51 && cp <= 0xfbeb) || (cp >= 0xfc45 && cp <= 0xfc64),
    );
    if (inRanges.length !== SURAH_NAME_CODE_POINTS.length)
      problems.push(
        `${inRanges.length} code points in the surah-name ranges, expected ${SURAH_NAME_CODE_POINTS.length}`,
      );
    expectMapped(SURAH_NAME_CODE_POINTS, 'surah-name');
    expectMapped([0xfcaa, 0xfcab, 0xfcae, 0xfcb4], 'basmalah');
  } else if (id === 'quran-common') {
    if (font.unitsPerEm !== 1024) problems.push(`unitsPerEm ${font.unitsPerEm}, expected 1024`);
    const juz = Array.from({length: 30}, (_, i) => 0xe001 + i);
    expectMapped(juz, 'juz-name');
    expectMapped([0xe000], 'header-frame');
    if (font.advances.get(0xe000) !== 8240)
      problems.push(`header frame advance ${font.advances.get(0xe000)}, expected 8240`);
  }
  return problems;
};

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
        // The two sets are hinted/spaced independently (page 187 differs in two advances); each theme
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
