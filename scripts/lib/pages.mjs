// Fetches QUL's public mushaf-layout preview pages into a cache directory and parses them.
import fs from 'node:fs';
import path from 'node:path';
import {fetchWithRetry, log, runPool} from './cli.mjs';
import {parsePageHtml, QulParseError} from './qul-html.mjs';

export const fetchPages = async (def, pages, {cacheDir, concurrency}) => {
  const dir = path.join(cacheDir, String(def.layoutId));
  fs.mkdirSync(dir, {recursive: true});
  const failures = [];
  let fetched = 0;
  let cached = 0;
  const parsed = await runPool(pages, concurrency, async (page) => {
    const file = path.join(dir, `p${page}.html`);
    let html;
    if (fs.existsSync(file)) {
      html = fs.readFileSync(file, 'utf8');
      cached++;
    } else {
      try {
        const res = await fetchWithRetry(def.previewUrl(page));
        html = await res.text();
        fs.writeFileSync(file, html);
        fetched++;
        if ((fetched + cached) % 25 === 0) log(`${fetched + cached}/${pages.length} pages`);
      } catch (e) {
        failures.push(`page ${page}: ${e.message}`);
        return null;
      }
    }
    try {
      return parsePageHtml(html, page);
    } catch (e) {
      if (e instanceof QulParseError) {
        // Do not cache a response that is not a QUL page (login wall, error page); keep real pages
        // that merely failed a structural check so re-runs and diagnostics are cheap.
        if (/does not look like a QUL page|empty response|no lines found/.test(e.message))
          fs.rmSync(file, {force: true});
        failures.push(e.message);
        return null;
      }
      throw e;
    }
  });
  log(`pages: ${fetched} fetched, ${cached} from cache`);
  if (failures.length) {
    throw new Error(
      `Could not obtain ${failures.length} page(s):\n - ${failures.slice(0, 20).join('\n - ')}${failures.length > 20 ? `\n - … ${failures.length - 20} more` : ''}`,
    );
  }
  return parsed;
};
