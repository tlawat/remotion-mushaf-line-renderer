import {describe, expect, it} from 'vitest';
import {
  buildProps,
  type CatalogueEntry,
  deepMerge,
  editDistance,
  filterRecitations,
  formatRecitations,
  MakeUsageError,
  makeFiles,
  parseMakeArgs,
  parsePropsFile,
  passageStem,
  renderArgs,
  resolveRecitation,
  shellLine,
  suggestRecitations,
} from './make-lib';

const entry = (slug: string, name: string, chapters: readonly number[], reciterId = slug): CatalogueEntry => ({
  slug,
  label: `${name} · Hafs A'n Assem · Murattal`,
  reciter: {reciter_id: reciterId, name_en: name, name_ar: ''},
  riwayah: "Hafs A'n Assem",
  style: 'Murattal',
  chapters,
});

const ALL = Array.from({length: 114}, (_, i) => i + 1);
const CATALOGUE: readonly CatalogueEntry[] = [
  entry('abdul_hamid_ghraio_2025_yt', 'Abdul Hamid Ghraio', ALL, 'abdul_hamid_ghraio'),
  entry('abdul_hamid_ghraio_2026_yt', 'Abdul Hamid Ghraio', [1, 112], 'abdul_hamid_ghraio'),
  entry('mahmoud_khalil_al_husary_qdc', 'Mahmoud Khalil Al-Husary', ALL),
  {...entry('abdulbasit_abdulsamad_warsh_qdc', 'AbdulBaset AbdulSamad', [1, 2]), riwayah: "Warsh A'n Nafi'"},
  entry('yasser_al_dosari_yt', 'Yasser Al-Dosari', [112, 113, 114]),
];

const make = (argv: readonly string[]) => {
  const command = parseMakeArgs(argv);
  if (command.kind !== 'make') throw new Error(`expected make, got ${command.kind}`);
  return command.options;
};

const usageError = (argv: readonly string[]): string => {
  try {
    parseMakeArgs(argv);
  } catch (error) {
    expect(error).toBeInstanceOf(MakeUsageError);
    return (error as Error).message;
  }
  throw new Error('expected a MakeUsageError');
};

describe('parseMakeArgs', () => {
  it('reads the minimal command with its defaults', () => {
    expect(make(['--reciter', 'abc', '--surah', '112'])).toEqual({
      reciter: 'abc',
      surah: 112,
      composition: 'MushafRecitation',
      dryRun: false,
      extra: [],
    });
  });

  it('reads every option, in both spellings, and the passthrough after --', () => {
    expect(
      make([
        '--reciter=abc',
        '--surah',
        '1',
        '--from=2',
        '--to',
        '7',
        '--composition',
        'MushafAyahText',
        '--translation',
        '20',
        '--props',
        'reel.json',
        '--out',
        'out/a.mp4',
        '--dry-run',
        '--',
        '--browser-executable=/x',
        '--surah',
      ]),
    ).toEqual({
      reciter: 'abc',
      surah: 1,
      from: 2,
      to: 7,
      composition: 'MushafAyahText',
      translation: 20,
      props: 'reel.json',
      out: 'out/a.mp4',
      dryRun: true,
      extra: ['--browser-executable=/x', '--surah'],
    });
  });

  it('answers --help and -h before checking anything else', () => {
    expect(parseMakeArgs(['--help'])).toEqual({kind: 'help'});
    expect(parseMakeArgs(['--surah', '999', '-h'])).toEqual({kind: 'help'});
  });

  it('reads --list-reciters with no query, a query of several words, or --list-reciters=query', () => {
    expect(parseMakeArgs(['--list-reciters'])).toEqual({kind: 'list', query: ''});
    expect(parseMakeArgs(['--list-reciters', 'abdul', 'hamid'])).toEqual({kind: 'list', query: 'abdul hamid'});
    expect(parseMakeArgs(['--list-reciters=husary'])).toEqual({kind: 'list', query: 'husary'});
  });

  it('requires --reciter and --surah', () => {
    expect(usageError([])).toMatch(/--reciter <slug> is required/);
    expect(usageError(['--reciter', 'abc'])).toMatch(/--surah <n> is required/);
  });

  it('refuses a surah or an ayah out of range, or not a whole number', () => {
    expect(usageError(['--reciter', 'a', '--surah', '0'])).toMatch(
      /--surah must be a whole number from 1 to 114 \(got "0"\)/,
    );
    expect(usageError(['--reciter', 'a', '--surah', '115'])).toMatch(/got "115"/);
    expect(usageError(['--reciter', 'a', '--surah', '1.5'])).toMatch(/got "1.5"/);
    expect(usageError(['--reciter', 'a', '--surah', '1', '--from', '0'])).toMatch(/--from must be/);
    expect(usageError(['--reciter', 'a', '--surah', '1', '--to', '287'])).toMatch(/--to must be/);
  });

  it('refuses --to before --from, and accepts one ayah', () => {
    expect(usageError(['--reciter', 'a', '--surah', '1', '--from', '5', '--to', '4'])).toMatch(
      /--to \(4\) comes before --from \(5\)/,
    );
    expect(make(['--reciter', 'a', '--surah', '1', '--from', '5', '--to', '5'])).toMatchObject({from: 5, to: 5});
  });

  it('refuses an unknown composition, suggesting the right case', () => {
    expect(usageError(['--reciter', 'a', '--surah', '1', '--composition', 'mushafayahtext'])).toMatch(
      /did you mean MushafAyahText\?/,
    );
    expect(usageError(['--reciter', 'a', '--surah', '1', '--composition', 'MushafPassage'])).toMatch(
      /--composition must be MushafRecitation or MushafAyahText \(got "MushafPassage"\)/,
    );
  });

  it('refuses an unknown option with the closest one, a repeated option, a missing value and a stray word', () => {
    expect(usageError(['--reciters', 'a'])).toMatch(/Unknown option --reciters \(did you mean --reciter\?\)/);
    expect(usageError(['--colour'])).toMatch(/Unknown option --colour\. Run with --help/);
    expect(usageError(['--surah', '1', '--surah', '2'])).toMatch(/--surah is given twice/);
    expect(usageError(['--reciter'])).toMatch(/--reciter needs a value/);
    expect(usageError(['--reciter', '--surah', '1'])).toMatch(/--reciter needs a value/);
    expect(usageError(['--reciter=', '--surah', '1'])).toMatch(/--reciter needs a value/);
    expect(usageError(['--dry-run=yes'])).toMatch(/--dry-run takes no value/);
    expect(usageError(['112'])).toMatch(/Unexpected argument "112"/);
  });

  it('refuses a translation id that is not a positive integer and an --out without extension', () => {
    expect(usageError(['--reciter', 'a', '--surah', '1', '--translation', 'sahih'])).toMatch(/--translation must be/);
    expect(usageError(['--reciter', 'a', '--surah', '1', '--out', 'out/video'])).toMatch(
      /--out needs a file extension/,
    );
  });
});

describe('file names', () => {
  const passage = {slug: 'abdul_hamid_ghraio_2025_yt', surah: 112, from: 1, to: 4};

  it('names the passage like the Source tab: <slug>-<surah>-<from>-<to>, slug characters kept', () => {
    expect(passageStem(passage)).toBe('abdul_hamid_ghraio_2025_yt-112-1-4');
    expect(passageStem({...passage, slug: 'Weird Slug/ü'})).toBe('weird-slug-u-112-1-4');
  });

  it('puts the clip and timings under public/mushaf-studio/cli and the props beside the video', () => {
    expect(makeFiles(passage)).toEqual({
      audio: 'mushaf-studio/cli/abdul_hamid_ghraio_2025_yt-112-1-4.mp3',
      timings: 'mushaf-studio/cli/abdul_hamid_ghraio_2025_yt-112-1-4.timings.json',
      video: 'out/abdul_hamid_ghraio_2025_yt-112-1-4.mp4',
      props: 'out/abdul_hamid_ghraio_2025_yt-112-1-4.props.json',
    });
  });

  it('names the translation and the text after the Text tab, and follows --out', () => {
    expect(makeFiles(passage, {out: 'renders/reel.v2.webm', translation: 20, textScript: 'uthmani'})).toMatchObject({
      translation: 'mushaf-studio/cli/translation-20-112-1-4.json',
      text: 'mushaf-studio/cli/text-uthmani-112-1-4.json',
      video: 'renders/reel.v2.webm',
      props: 'renders/reel.v2.props.json',
    });
  });
});

describe('props', () => {
  const defaults = {
    audioFile: 'https://example/old.mp3',
    timingsFile: 'mushaf-studio/fatiha/timings.json',
    fromAyah: 2,
    toAyah: 7,
    splits: [{page: 1, line: 3, atWordId: 4}],
    textFile: 'mushaf-studio/fatiha/text-uthmani.json',
    layout: {aspect: '16:9', visibleLines: 3},
    text: {translationFile: '', translationSize: 40},
    resolved: null,
  };
  const files = makeFiles({slug: 's', surah: 112, from: 1, to: 4}, {translation: 20, textScript: 'uthmani'});

  it('deep-merges objects, replaces arrays and scalars, ignores undefined, changes neither argument', () => {
    const base = {a: {b: 1, c: 2}, list: [1, 2], keep: 'x'};
    const patch = {a: {c: 3}, list: [9], keep: undefined};
    expect(deepMerge(base, patch)).toEqual({a: {b: 1, c: 3}, list: [9], keep: 'x'});
    expect(base).toEqual({a: {b: 1, c: 2}, list: [1, 2], keep: 'x'});
  });

  it('MushafRecitation: the files over the defaults, the range reset, the splits cleared, textFile untouched', () => {
    expect(buildProps(defaults, 'MushafRecitation', files)).toEqual({
      ...defaults,
      audioFile: 'mushaf-studio/cli/s-112-1-4.mp3',
      timingsFile: 'mushaf-studio/cli/s-112-1-4.timings.json',
      fromAyah: 0,
      toAyah: 0,
      splits: [],
      text: {translationFile: 'mushaf-studio/cli/translation-20-112-1-4.json', translationSize: 40},
    });
  });

  it('MushafAyahText: sets textFile and keeps its own keys', () => {
    const props = buildProps(defaults, 'MushafAyahText', files);
    expect(props.textFile).toBe('mushaf-studio/cli/text-uthmani-112-1-4.json');
    expect(props.splits).toEqual(defaults.splits);
  });

  it('no translation: text.translationFile stays the default', () => {
    const plain = makeFiles({slug: 's', surah: 1, from: 1, to: 7});
    expect(buildProps(defaults, 'MushafRecitation', plain).text).toEqual(defaults.text);
  });

  it('--props last: a group is merged key by key, and a file it names wins over the fetched one', () => {
    const props = buildProps(defaults, 'MushafRecitation', files, {
      layout: {aspect: '9:16'},
      audioFile: 'mine.mp3',
      theme: 'light',
    });
    expect(props.layout).toEqual({aspect: '9:16', visibleLines: 3});
    expect(props.audioFile).toBe('mine.mp3');
    expect(props.theme).toBe('light');
  });

  it('reads a --props file: a JSON object, or an error naming the file', () => {
    expect(parsePropsFile('{"theme":"light"}', 'reel.json')).toEqual({theme: 'light'});
    expect(() => parsePropsFile('{theme', 'reel.json')).toThrow(/--props reel.json is not JSON/);
    expect(() => parsePropsFile('[1]', 'reel.json')).toThrow(/must hold a JSON object/);
    expect(() => parsePropsFile('null', 'reel.json')).toThrow(MakeUsageError);
  });
});

describe('render command', () => {
  it('runs remotion render on the props file, the passthrough last', () => {
    expect(renderArgs('MushafAyahText', 'out/a.mp4', 'out/a.props.json', ['--ignore-certificate-errors'])).toEqual([
      'remotion',
      'render',
      'MushafAyahText',
      'out/a.mp4',
      '--props=out/a.props.json',
      '--ignore-certificate-errors',
    ]);
  });

  it('prints it as a shell would read it', () => {
    expect(shellLine('bunx', ['remotion', 'render', 'out/my video.mp4', "it's", '--props=out/a.json'])).toBe(
      "bunx remotion render 'out/my video.mp4' 'it'\\''s' --props=out/a.json",
    );
  });
});

describe('catalogue', () => {
  it('edit distance: empty, equal, one edit', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abc', 'abd')).toBe(1);
    expect(editDistance('ghraio', 'ghario')).toBe(2);
  });

  it('filters by every word of the query, in any field; an empty query keeps everything', () => {
    expect(filterRecitations(CATALOGUE, '')).toHaveLength(CATALOGUE.length);
    expect(filterRecitations(CATALOGUE, 'GHRAIO 2026').map((e) => e.slug)).toEqual(['abdul_hamid_ghraio_2026_yt']);
    expect(filterRecitations(CATALOGUE, 'warsh').map((e) => e.slug)).toEqual(['abdulbasit_abdulsamad_warsh_qdc']);
    expect(filterRecitations(CATALOGUE, 'nobody')).toEqual([]);
  });

  it('formats one aligned row per recitation under a header', () => {
    const lines = formatRecitations(CATALOGUE.slice(3, 5)).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^slug\s+reciter\s+riwayah\s+style\s+chapters$/);
    expect(lines[2]).toMatch(/^yasser_al_dosari_yt\s+Yasser Al-Dosari\s+Hafs A'n Assem\s+Murattal\s+3 ch$/);
    expect(lines[1]!.indexOf('AbdulBaset')).toBe(lines[2]!.indexOf('Yasser'));
  });

  it('suggests close slugs for a typo, a partial slug or a reciter name, and nothing for noise', () => {
    expect(suggestRecitations('abdul_hamid_ghario_2025_yt', CATALOGUE)[0]?.slug).toBe('abdul_hamid_ghraio_2025_yt');
    expect(suggestRecitations('husary', CATALOGUE).map((e) => e.slug)).toEqual(['mahmoud_khalil_al_husary_qdc']);
    expect(suggestRecitations('dosary', CATALOGUE).map((e) => e.slug)).toEqual(['yasser_al_dosari_yt']);
    expect(suggestRecitations('zzzzqqq', CATALOGUE)).toEqual([]);
    expect(suggestRecitations('ghraio', CATALOGUE, {chapter: 2}).map((e) => e.slug)).toEqual([
      'abdul_hamid_ghraio_2025_yt',
    ]);
    expect(suggestRecitations('a', CATALOGUE, {limit: 2})).toHaveLength(2);
  });

  it('resolves a slug that has the chapter', () => {
    expect(resolveRecitation('yasser_al_dosari_yt', 112, CATALOGUE).slug).toBe('yasser_al_dosari_yt');
  });

  it('an unknown slug lists the close matches', () => {
    expect(() => resolveRecitation('husary', 1, CATALOGUE)).toThrow(
      /no recitation "husary"\. Close matches:\n {2}mahmoud_khalil_al_husary_qdc/,
    );
    expect(() => resolveRecitation('zzzzqqq', 1, CATALOGUE)).toThrow(/no recitation "zzzzqqq"\.\nRun `bun run make/);
  });

  it('a recitation without the chapter lists the ones that have it, the same reciter first', () => {
    let message = '';
    try {
      resolveRecitation('abdul_hamid_ghraio_2026_yt', 2, CATALOGUE);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(
      /"abdul_hamid_ghraio_2026_yt" has no reviewed segments for surah 2 \(it covers 2 chapters\)/,
    );
    expect(message).toMatch(/Recitations that have it:\n {2}abdul_hamid_ghraio_2025_yt/);
    expect(message).not.toMatch(/yasser/);
  });
});
