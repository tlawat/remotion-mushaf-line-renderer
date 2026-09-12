// Records the ETag of every CDN woff2 font in scripts/cdn-etags.json, and notes the gaps.
import {log, runPool, USER_AGENT, writeSurvey} from './cli.mjs';

const headStatus = async (url) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {'user-agent': USER_AGENT, origin: 'https://example.com'},
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res;
  } catch (e) {
    return {ok: false, status: 0, statusText: e.message, headers: new Headers()};
  }
};

/** Other CDN locations of the same page font (other format, without the cache-busting query, other set). */
const fontUrlVariants = (def, page, url) => {
  const out = [];
  for (const s of Object.keys(def.fontSets)) {
    for (const format of ['woff2', 'woff', 'ttf']) {
      const withQuery = def.fontUrl(s, page, format);
      for (const candidate of [withQuery, withQuery.replace(/\?.*$/, '')]) {
        if (candidate !== url && !out.includes(candidate)) out.push(candidate);
      }
    }
  }
  return out;
};

/** @param {object} known  entries already recorded by a download, so they are not requested again */
export const recordEtags = async (def, known = {}) => {
  const entries = {...known};
  const urls = [];
  for (const set of Object.keys(def.fontSets)) {
    for (let page = 1; page <= def.pages; page++) urls.push({set, page, url: def.fontUrl(set, page, 'woff2')});
  }
  let done = 0;
  const problems = [];
  await runPool(urls, 6, async ({page, url}) => {
    if (entries[url]) return;
    try {
      const res = await headStatus(url);
      if (!res.ok) {
        // A gap on the CDN: find out what does exist for that page so the registry can route around it.
        const available = [];
        for (const alt of fontUrlVariants(def, page, url)) {
          const r = await headStatus(alt);
          if (r.ok)
            available.push(`${alt} (${r.headers.get('content-type')}, ${r.headers.get('content-length')} bytes)`);
        }
        problems.push(
          `${url}: HTTP ${res.status}${res.status === 0 ? ` ${res.statusText}` : ''}${available.length ? `; available instead: ${available.join(', ')}` : '; no other format or set has this page either'}`,
        );
        return;
      }
      entries[url] = {
        etag: res.headers.get('etag'),
        contentType: res.headers.get('content-type'),
        contentLength: Number(res.headers.get('content-length')) || null,
        cors: res.headers.get('access-control-allow-origin'),
      };
    } finally {
      done++;
      if (done % 200 === 0) log(`etags: ${done}/${urls.length}`);
    }
  });
  // Sorted by URL so re-runs produce a stable, reviewable diff (requests finish in any order), and
  // the committed file is left alone when only its generation time would change.
  const sorted = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((url) => [url, entries[url]]),
  );
  const base = def.fontUrl('qpc-v4-tajweed', 1, 'woff2').replace(/\/p1\.woff2.*$/, '');
  writeSurvey({base, entries: sorted, problems}, `${Object.keys(entries).length} font entries`);
  // Gaps are recorded, not fatal: the layout and the fixture fonts are still valid, and the
  // registry handles known gaps explicitly.
  if (problems.length)
    log(`etags: ${problems.length} CDN gap(s), recorded in cdn-etags.json:\n - ${problems.slice(0, 20).join('\n - ')}`);
  return problems;
};
