// The registry's CDN URLs against the ETag survey written by `scripts/fetch-qul.mjs --etags`:
// every URL the package would fetch must have answered 200, and every gap the survey found must be
// routed around by CDN_FORMAT_EXCEPTIONS in src/mushafs.ts.
import {existsSync, readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {MUSHAF_IDS, getMushafDefinition} from '../../src/mushafs';

const file = new URL('../../../../scripts/cdn-etags.json', import.meta.url);

type Survey = {entries: Record<string, {etag: string | null; contentType: string | null; cors: string | null}>; problems?: string[]};

describe.skipIf(!existsSync(file))('CDN survey (scripts/cdn-etags.json)', () => {
  const survey: Survey = JSON.parse(readFileSync(file, 'utf8'));
  const gaps = (survey.problems ?? []).map((line) => {
    const url = line.slice(0, line.indexOf(': HTTP'));
    const available = Array.from(line.matchAll(/(https:\/\/\S+) \(/g), (m) => m[1] as string);
    return {url, available};
  });

  it('serves every URL the registry would fetch, with CORS for any origin', () => {
    const missing: string[] = [];
    for (const id of MUSHAF_IDS) {
      const def = getMushafDefinition(id);
      for (let page = 1; page <= def.pages; page++) {
        const url = def.fontUrl(page);
        const entry = survey.entries[url];
        const gap = gaps.find((g) => g.available.includes(url));
        if (!entry && !gap) missing.push(url);
        // Entries recorded by a font download (no Origin header on that request) carry no CORS value.
        if (entry && entry.cors !== null && entry.cors !== '*') missing.push(`${url} (cors ${entry.cors})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('routes around every gap the survey found', () => {
    for (const gap of gaps) {
      const m = gap.url.match(/quran_fonts\/(v4|v4-tajweed)\/woff2\/p(\d+)\.woff2/);
      expect(m, gap.url).not.toBeNull();
      const id = m![1] === 'v4' ? 'qpc-v4' : 'qpc-v4-tajweed';
      const chosen = getMushafDefinition(id).fontUrl(Number(m![2]));
      expect(chosen).not.toBe(gap.url);
      expect(gap.available, `${id} page ${m![2]}: ${chosen} is not among the URLs the survey found`).toContain(chosen);
    }
  });
});
