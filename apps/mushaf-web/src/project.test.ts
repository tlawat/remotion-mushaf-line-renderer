// The props each step builds (pure), the catalogue and translation helpers, and the catalogue
// loader against the research fixture: the timings land in the memory store and read back through
// the memory fetch the way the resolvers read them.
import {
  defaultMushafAyahTextProps,
  defaultMushafRecitationProps,
  MUSHAF_LOOKS,
  type QudRecitation,
  type QuranComResource,
  readTimings,
} from '@tlawat/mushaf-studio';
import {describe, expect, it, vi} from 'vitest';
import chapterFixture from '../../../packages/mushaf-studio/test/fixtures/qud/chapter-1-segments.json';
import recitationsFixture from '../../../packages/mushaf-studio/test/fixtures/qud/recitations.json';
import {createMemoryFetch, createMemoryFiles, memoryStaticFile} from './memory-files';
import {
  activeLook,
  buildAyahTextProps,
  buildProps,
  buildRecitationProps,
  fileStem,
  initialProject,
  looksForProject,
  makeCommand,
  missingInput,
  type PickedRecitation,
  pickRecitation,
  STYLE_FILE,
  setComposition,
  setGloss,
  setLook,
  setRange,
  setText,
  setTranslation,
  styleProps,
  videoSpec,
  type WebProject,
} from './project';
import {
  DEFAULT_RECITATION_SLUG,
  defaultRecitationSlug,
  groupByReciter,
  loadCatalogueChapter,
  recitationOptionLabel,
  timingsPath,
  translationLanguages,
  translationsIn,
} from './sources';

const recitations = recitationsFixture.recitations as unknown as readonly QudRecitation[];

const fatiha: PickedRecitation = {
  slug: 'abdul_hamid_ghraio_2025_yt',
  reciter: 'Abdul Hamid Ghraio',
  surah: 1,
  audioUrl: 'https://example.com/1.mp3',
  timingsUrl: 'mem://timings/abdul_hamid_ghraio_2025_yt/1.json',
  first: 2,
  last: 7,
};

const loaded: WebProject = pickRecitation(initialProject, fatiha);

describe('step 1: the recitation and the range', () => {
  it('opens the range on every ayah the recitation times', () => {
    expect(loaded.recitation).toBe(fatiha);
    expect([loaded.fromAyah, loaded.toAyah]).toEqual([2, 7]);
  });

  it('keeps the text files for the same surah from another reciter, drops them for a new surah', () => {
    const withFiles = setGloss(setTranslation(setText(loaded, 'mem://text'), 20, 'mem://tr'), 'mem://gloss');
    const sameSurah = pickRecitation(withFiles, {...fatiha, slug: 'other'});
    expect([sameSurah.translationUrl, sameSurah.glossUrl, sameSurah.textUrl]).toEqual([
      'mem://tr',
      'mem://gloss',
      'mem://text',
    ]);
    const newSurah = pickRecitation(withFiles, {...fatiha, surah: 112, first: 1, last: 4});
    expect([newSurah.translationUrl, newSurah.glossUrl, newSurah.textUrl]).toEqual(['', '', '']);
    expect(newSurah.translationId).toBe(20);
  });

  it('clamps the range to the timed ayahs', () => {
    expect(setRange(loaded, 0, 99)).toMatchObject({fromAyah: 2, toAyah: 7});
    expect(setRange(loaded, 3, 5)).toMatchObject({fromAyah: 3, toAyah: 5});
    expect(setRange(loaded, Number.NaN, 4)).toMatchObject({fromAyah: 2, toAyah: 4});
  });

  it('moves the other bound along when the range would turn over', () => {
    const narrow = setRange(loaded, 3, 4);
    expect(setRange(narrow, 6, 4)).toMatchObject({fromAyah: 6, toAyah: 6});
    expect(setRange(narrow, 3, 2)).toMatchObject({fromAyah: 2, toAyah: 2});
  });

  it('leaves a project without a recitation alone', () => {
    expect(setRange(initialProject, 3, 4)).toBe(initialProject);
  });
});

describe('step 2: the look', () => {
  it('offers the looks designed for the composition', () => {
    expect(looksForProject(loaded).map((l) => l.id)).toContain('tajweed-light');
    expect(looksForProject(setComposition(loaded, 'ayah-text')).map((l) => l.id)).not.toContain('tajweed-light');
  });

  it('applies a look over the defaults and keeps the content', () => {
    const night = buildRecitationProps(setLook(loaded, 'night'));
    expect(night.theme).toBe('dark');
    expect(night.layout.background).toBe('#101418');
    expect(night.layout.aspect).toBe('16:9');
    expect(night.timingsFile).toBe(fatiha.timingsUrl);
    expect(night.fonts).toBe('cdn');
  });

  it('ignores a look the composition is not designed for, and none at all', () => {
    const ayah = setComposition(setLook(loaded, 'tajweed-light'), 'ayah-text');
    expect(activeLook(ayah)).toBeNull();
    expect(buildAyahTextProps(ayah).layout).toEqual(defaultMushafAyahTextProps.layout);
    expect(activeLook(setLook(loaded, null))).toBeNull();
    expect(activeLook(setLook(loaded, 'no-such-look'))).toBeNull();
  });

  it('changes the frame with the reel look', () => {
    const reel = buildProps(setLook(loaded, 'reel'));
    expect(reel.props.layout.aspect).toBe('9:16');
    expect(MUSHAF_LOOKS.find((l) => l.id === 'reel')).toBeDefined();
  });
});

describe('step 3: the text files', () => {
  it('sets the translation and the gloss on the recitation', () => {
    const props = buildRecitationProps(setGloss(setTranslation(loaded, 20, 'mem://tr'), 'mem://gloss'));
    expect(props.text.translationFile).toBe('mem://tr');
    expect(props.text.glossFile).toBe('mem://gloss');
  });

  it('drops the translation file with the translation', () => {
    const none = setTranslation(setTranslation(loaded, 20, 'mem://tr'), null, 'mem://ignored');
    expect(none).toMatchObject({translationId: null, translationUrl: ''});
  });

  it('gives the ayah text its text file and translation, never the gloss', () => {
    const project = setComposition(
      setGloss(setTranslation(setText(loaded, 'mem://text'), 20, 'mem://tr'), 'mem://g'),
      'ayah-text',
    );
    const props = buildAyahTextProps(project);
    expect(props.textFile).toBe('mem://text');
    expect(props.text.translationFile).toBe('mem://tr');
    expect(props.text.glossFile).toBe('');
  });
});

describe('building the props', () => {
  it('starts from the package defaults with the CDN as data and font source', () => {
    const props = buildRecitationProps(initialProject);
    expect(props).toMatchObject({
      audioFile: '',
      timingsFile: '',
      fromAyah: 0,
      toAyah: 0,
      fonts: 'cdn',
      data: 'cdn',
      resolved: null,
    });
    expect(props.layout).toEqual(defaultMushafRecitationProps.layout);
  });

  it('points the content at the catalogue clip and the memory timings', () => {
    const props = buildRecitationProps(setRange(loaded, 3, 5));
    expect(props).toMatchObject({audioFile: fatiha.audioUrl, timingsFile: fatiha.timingsUrl, fromAyah: 3, toAyah: 5});
    expect(props.overlay.reciter).toBe('Abdul Hamid Ghraio');
  });

  it('builds the composition the switch shows', () => {
    expect(buildProps(loaded).composition).toBe('recitation');
    const ayah = buildProps(setComposition(loaded, 'ayah-text'));
    expect(ayah.composition).toBe('ayah-text');
    expect('textFile' in ayah.props).toBe(true);
  });

  it('says what is missing before the props can be resolved', () => {
    expect(missingInput(initialProject)).toMatch(/Pick a reciter/);
    expect(missingInput(loaded)).toBeNull();
    expect(missingInput(setComposition(loaded, 'ayah-text'))).toMatch(/Quran text/);
    expect(missingInput(setText(setComposition(loaded, 'ayah-text'), 'mem://t'))).toBeNull();
    expect(missingInput(setTranslation(loaded, 20))).toMatch(/translation/);
  });

  it('sizes and times the video like calculateMetadata()', () => {
    const timings = {version: 1, surah: 1, ayat: [{ayah: 2, start: 0.2, end: 5.5}]} as never;
    expect(videoSpec('16:9', timings)).toEqual({fps: 30, width: 1920, height: 1080, durationInFrames: 195});
    expect(videoSpec('9:16', timings)).toMatchObject({width: 1080, height: 1920});
  });
});

describe('step 4: the files and the command', () => {
  it('names the downloads after the surah and the range', () => {
    expect(fileStem(initialProject)).toBe('mushaf');
    expect(fileStem(setRange(loaded, 3, 5))).toBe('mushaf-001-3-5');
  });

  it('keeps only the style for make --props', () => {
    const style = styleProps(buildRecitationProps(setTranslation(setLook(loaded, 'night'), 20, 'mem://tr')));
    for (const key of ['audioFile', 'timingsFile', 'fromAyah', 'toAyah', 'resolved', 'splits', 'fonts', 'data']) {
      expect(style).not.toHaveProperty(key);
    }
    expect(style.theme).toBe('dark');
    expect(style.text).not.toHaveProperty('translationFile');
    expect(style.text).toHaveProperty('translationColor');
    expect(styleProps(buildAyahTextProps(setText(loaded, 'mem://t')))).not.toHaveProperty('textFile');
  });

  it('writes the make command for the same video', () => {
    expect(makeCommand(initialProject)).toBe('bun run make --help');
    expect(makeCommand(setTranslation(setRange(loaded, 3, 5), 20))).toBe(
      `bun run make --reciter abdul_hamid_ghraio_2025_yt --surah 1 --from 3 --to 5 --composition MushafRecitation --translation 20 --props ${STYLE_FILE}`,
    );
    expect(makeCommand(setComposition(loaded, 'ayah-text'))).toContain('--composition MushafAyahText');
  });
});

describe('the catalogue', () => {
  it('groups the recitations by reciter, in alphabetical order', () => {
    const groups = groupByReciter(recitations);
    const names = groups.map((g) => g.reciter);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(groups.reduce((n, g) => n + g.recitations.length, 0)).toBe(recitations.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('groups nothing into nothing', () => {
    expect(groupByReciter([])).toEqual([]);
  });

  it('labels a recitation by riwayah, style and channel', () => {
    const first = recitations[0]!;
    expect(recitationOptionLabel(first)).toBe(`${first.riwayah} · ${first.style} · ${first.channel}`);
  });

  it('opens on the default reciter, else the first entry, else nothing', () => {
    expect(defaultRecitationSlug(recitations)).toBe(DEFAULT_RECITATION_SLUG);
    const others = recitations.filter((r) => r.slug !== DEFAULT_RECITATION_SLUG);
    expect(defaultRecitationSlug(others)).toBe(others[0]!.slug);
    expect(defaultRecitationSlug([])).toBe('');
  });

  it('loads a chapter into memory, and the resolvers read it back through the memory fetch', async () => {
    const store = createMemoryFiles();
    const fakeFetch = vi.fn(async () => Response.json(chapterFixture));
    const recitation = recitations.find((r) => r.slug === chapterFixture.recitation)!;
    const picked = await loadCatalogueChapter({recitation, surah: 1}, store, {
      fetch: fakeFetch as unknown as typeof fetch,
    });
    expect(String((fakeFetch.mock.calls[0] as unknown[])[0])).toContain(
      `/recitations/${chapterFixture.recitation}/chapters/1/segments`,
    );
    expect(picked).toMatchObject({
      slug: chapterFixture.recitation,
      surah: 1,
      audioUrl: chapterFixture.audio_url,
      timingsUrl: `mem://${timingsPath(chapterFixture.recitation, 1)}`,
    });
    expect(picked.first).toBeLessThanOrEqual(picked.last);
    const timings = await readTimings(picked.timingsUrl, {
      fetch: createMemoryFetch(store),
      staticFile: memoryStaticFile,
    });
    expect(timings.ayat.length).toBeGreaterThan(0);
  });
});

describe('the translations', () => {
  const resources: readonly QuranComResource[] = [
    {id: 1, name: 'B', authorName: '', language: 'fr', languageName: 'french'},
    {id: 2, name: 'Saheeh', authorName: '', language: 'en', languageName: 'english'},
    {id: 3, name: 'A', authorName: '', language: 'fr', languageName: 'french'},
    {id: 4, name: 'Z', authorName: '', language: 'bn', languageName: 'bengali'},
  ];

  it('lists the languages English first, then by name, with their counts', () => {
    expect(translationLanguages(resources)).toEqual([
      {code: 'en', name: 'English', count: 1},
      {code: 'bn', name: 'Bengali', count: 1},
      {code: 'fr', name: 'French', count: 2},
    ]);
    expect(translationLanguages([])).toEqual([]);
  });

  it('lists the translations of one language by name', () => {
    expect(translationsIn(resources, 'fr').map((r) => r.id)).toEqual([3, 1]);
    expect(translationsIn(resources, 'xx')).toEqual([]);
  });
});
