import {describe, expect, it} from 'vitest';
import {ayahKeyOf, parseTranslationFile, serialiseTranslation, stripFootnotes} from '../../../src/translations';
import type {AyahTranslation, Translation, WordGloss} from '../../../src/types';
import {fixture, thrown} from './helpers';

const DEFAULT_META = {id: 'file', name: 'Translation', language: 'und', source: 'file'};

const ayah = (value: unknown): AyahTranslation => {
  const t = parseTranslationFile(value);
  if (t.kind !== 'ayah') throw new Error(`expected an ayah translation, got ${t.kind}`);
  return t;
};

describe('stripFootnotes', () => {
  it('leaves plain text alone', () => {
    expect(stripFootnotes('Guide us to the straight path -')).toBe('Guide us to the straight path -');
  });

  it('returns an empty string for empty or markup-only text', () => {
    expect(stripFootnotes('')).toBe('');
    expect(stripFootnotes('   ')).toBe('');
    expect(stripFootnotes('<sup foot_note="1">1</sup>[[a note]]')).toBe('');
  });

  it('drops <sup> footnote references with their content, quoted or not', () => {
    expect(stripFootnotes('formed <sup foot_note="77646">1</sup>')).toBe('formed');
    expect(stripFootnotes('In the name of Allāh,<sup foot_note=195932>1</sup> the Entirely Merciful.')).toBe(
      'In the name of Allāh, the Entirely Merciful.',
    );
    expect(stripFootnotes('a<SUP class="f">12</SUP> b')).toBe('a b');
  });

  it('drops inline [[...]] footnotes with their content', () => {
    expect(stripFootnotes("clouds are formed [[The word ibl can mean 'camel'...]] and")).toBe('clouds are formed and');
  });

  it('drops any other tag but keeps its content', () => {
    expect(stripFootnotes('<i class="s">(from the whisperers)</i> among <b>the</b> race<br/>')).toBe(
      '(from the whisperers) among the race',
    );
  });

  it('puts a space where markup glued two words together, and none before punctuation', () => {
    expect(stripFootnotes('unseen beings<sup foot_note="81506">1</sup>and mankind')).toBe('unseen beings and mankind');
    expect(stripFootnotes('<i>(from the whisperers)</i>among')).toBe('(from the whisperers) among');
    expect(stripFootnotes('Allah<sup>1</sup>, the')).toBe('Allah, the');
    expect(stripFootnotes("Allah<i>'s</i> mercy")).toBe("Allah's mercy");
  });

  it('adds no space between characters of scripts written without spaces', () => {
    expect(stripFootnotes('奉至仁至慈的<sup foot_note="1">1</sup>真主之名')).toBe('奉至仁至慈的真主之名');
  });

  it('collapses every run of whitespace to one space and trims', () => {
    expect(stripFootnotes('  a\n\tb   c  ')).toBe('a b c');
  });

  it('leaves a lone angle bracket that opens no tag', () => {
    expect(stripFootnotes('a < b')).toBe('a < b');
  });

  it('is idempotent', () => {
    const once = stripFootnotes('x<sup>1</sup>y [[n]] <i>z</i>');
    expect(stripFootnotes(once)).toBe(once);
  });
});

describe('parseTranslationFile: QUL shapes', () => {
  it('reads key/value', () => {
    const t = ayah(fixture('qul-key-value.json'));
    expect(Object.keys(t.text)).toEqual(['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:7']);
    expect(t.text['1:1']).toBe('In the name of Allāh, the Entirely Merciful, the Especially Merciful.');
    expect(t.text['1:6']).toBe('Guide us to the straight path -');
    expect(t.meta).toEqual(DEFAULT_META);
  });

  it('reads nested arrays: outer index the surah, inner index the ayah', () => {
    const t = ayah(fixture('qul-nested-arrays.json'));
    expect(Object.keys(t.text)).toHaveLength(9);
    expect(t.text['1:1']).toBe('translation of 1:1');
    expect(t.text['1:7']).toBe('translation of 1:7');
    expect(t.text['2:2']).toBe('translation of 2:2');
    expect(t.text['1:8']).toBeUndefined();
  });

  it('reads nested arrays with empty surahs in between', () => {
    expect(ayah([[], ['a']]).text).toEqual({'2:1': 'a'});
  });

  it('reads footnotes as tags, dropping the references and the bodies', () => {
    const t = ayah(fixture('qul-footnote-tags.json'));
    expect(t.text).toEqual({
      '88:17': 'Do the disbelievers not see how rain clouds are formed',
      '88:18': 'and how the sky is raised ˹high˺,',
    });
  });

  it('reads inline footnotes', () => {
    const t = ayah(fixture('qul-inline-footnotes.json'));
    expect(t.text['88:17']).toBe('Do the disbelievers not see how rain clouds are formed');
    expect(t.text['88:18']).toBe('and how the sky is raised ˹high˺,');
  });

  it('reads text chunks: strings and formatting kept, footnote references dropped', () => {
    const t = ayah(fixture('qul-text-chunks.json'));
    expect(t.text['114:6']).toBe('(from the whisperers) among the race of unseen beings and mankind.”');
    expect(t.text['114:5']).toBe('who whispers into the hearts of mankind,');
  });

  it('reads an empty chunk list as empty text', () => {
    expect(ayah({'1:1': []}).text).toEqual({'1:1': ''});
  });

  it('reads word by word as a WordGloss', () => {
    const t = parseTranslationFile(fixture('qul-word-by-word.json')) as WordGloss;
    expect(t.kind).toBe('word');
    expect(Object.keys(t.words)).toHaveLength(6);
    expect(t.words['1:1:1']).toBe('In (the) name');
    expect(t.words['1:2:2']).toBe('(be) to Allah');
  });

  it('detects by shape, whatever the source', () => {
    expect(parseTranslationFile({'114:6': 'x'}).kind).toBe('ayah');
    expect(parseTranslationFile({'114:6:1': 'x'}).kind).toBe('word');
  });
});

describe('parseTranslationFile: meta', () => {
  it('fills what the file does not say from the given meta, over the defaults', () => {
    const t = parseTranslationFile(fixture('qul-key-value.json'), {id: 'qul:20', language: 'en', license: 'CC'});
    expect(t.meta).toEqual({id: 'qul:20', name: 'Translation', language: 'en', source: 'file', license: 'CC'});
  });

  it('ignores meta fields given as undefined', () => {
    const meta = {id: undefined, name: 'Mine'} as unknown as Partial<AyahTranslation['meta']>;
    expect(parseTranslationFile({'1:1': 'a'}, meta).meta).toEqual({...DEFAULT_META, name: 'Mine'});
  });

  it("lets the envelope's own meta win over the given meta", () => {
    const envelope = {version: 1, kind: 'ayah', meta: {id: 'quran.com:20', name: 'Saheeh'}, text: {'1:1': 'a'}};
    const t = parseTranslationFile(envelope, {id: 'given', language: 'en'});
    expect(t.meta).toEqual({id: 'quran.com:20', name: 'Saheeh', language: 'en', source: 'file'});
  });

  it('reads an envelope with no meta', () => {
    expect(parseTranslationFile({version: 1, kind: 'word', words: {'1:1:1': 'a'}}).meta).toEqual(DEFAULT_META);
  });
});

describe('parseTranslationFile: errors', () => {
  const bad = (value: unknown) => {
    const error = thrown(() => parseTranslationFile(value));
    expect(error.code).toBe('BAD_TRANSLATION_FILE');
    return error.message;
  };

  it('rejects a non-object, naming what it found and the shapes it reads', () => {
    for (const value of [null, undefined, 42, 'text', true]) {
      const message = bad(value);
      expect(message).toContain('QUL key/value');
      expect(message).toContain('studio envelope');
    }
    expect(bad(42)).toContain('found 42');
    expect(bad('text')).toContain('found "text"');
  });

  it('rejects an empty object and an empty array', () => {
    expect(bad({})).toContain('empty object');
    expect(bad([])).toContain('empty array');
  });

  it('rejects a key that is neither an ayah nor a word key', () => {
    for (const key of ['abc', '1', '1:1:1:1', '0:1', '1:0', '01:1', ' 1:1', '1:1:0']) {
      expect(bad({[key]: 'x'})).toContain(JSON.stringify(key));
    }
  });

  it('rejects a surah out of 1-114', () => {
    expect(bad({'115:1': 'x'})).toContain('surah 115');
    expect(bad({'1:1': 'x', '200:1:1': 'y'})).toContain('surah 200');
  });

  it('rejects an object that mixes ayah and word keys', () => {
    const message = bad({'1:1': 'a', '1:1:1': 'b'});
    expect(message).toContain('mixes ayah keys ("1:1") and word keys ("1:1:1")');
    expect(bad({'1:1:1': 'b', '1:2': 'a'})).toContain('mixes ayah keys ("1:2") and word keys ("1:1:1")');
  });

  it('rejects an ayah value of another type, naming the shapes', () => {
    const message = bad({'1:1': 'a', '1:2': 7});
    expect(message).toContain('"1:2"');
    expect(message).toContain('found 7');
    expect(message).toContain('{t, f}');
    expect(bad({'1:1': {f: {}}})).toMatch(/found an? object/);
    expect(bad({'1:1': {t: 3, f: {}}})).toContain('"1:1"');
  });

  it('rejects a word value that is not a string', () => {
    expect(bad({'1:1:1': ['a']})).toContain('word by word');
  });

  it('rejects a bad text chunk, naming its index', () => {
    expect(bad({'1:1': ['a', 3]})).toContain('chunk 1 of "1:1"');
    expect(bad({'1:1': [{text: 'no type'}]})).toContain('chunk 0');
    expect(bad({'1:1': [{type: 'i'}]})).toMatch(/found an? object/);
  });

  it('rejects malformed nested arrays', () => {
    expect(bad(['not an array'])).toContain('item [0]');
    expect(bad([['a'], [2]])).toContain('item [1][0] (2:1)');
    expect(bad([[], []])).toContain('every surah array is empty');
    expect(bad(Array.from({length: 115}, () => ['a']))).toContain('at most 114');
  });

  it('rejects envelopes it cannot read', () => {
    expect(bad({version: 2, kind: 'ayah', text: {'1:1': 'a'}})).toContain('version is 2');
    expect(bad({version: 1, kind: 'verse', text: {'1:1': 'a'}})).toContain('kind should be "ayah" or "word"');
    expect(bad({version: 1, kind: 'ayah', words: {'1:1': 'a'}})).toContain('under "text"');
    expect(bad({version: 1, kind: 'word', words: []})).toContain('under "words"');
    expect(bad({version: 1, kind: 'ayah', text: {}})).toContain('empty object');
    expect(bad({version: 1, kind: 'ayah', text: {'1:1:1': 'a'}})).toContain('holds ayah entries');
    expect(bad({version: 1, kind: 'word', words: {'1:1': 'a'}})).toContain('holds word entries');
    expect(bad({version: 1, kind: 'ayah', meta: 'x', text: {'1:1': 'a'}})).toContain('meta should be an object');
    expect(bad({version: 1, kind: 'ayah', meta: {name: 3}, text: {'1:1': 'a'}})).toContain('meta.name');
  });
});

describe('serialiseTranslation', () => {
  const sources = [
    'qul-key-value.json',
    'qul-nested-arrays.json',
    'qul-footnote-tags.json',
    'qul-inline-footnotes.json',
    'qul-text-chunks.json',
    'qul-word-by-word.json',
  ];

  it.each(sources)('round-trips %s through the envelope', (name) => {
    const t = parseTranslationFile(fixture(name), {id: `qul:${name}`, license: 'see QUL'});
    expect(parseTranslationFile(JSON.parse(serialiseTranslation(t)))).toEqual(t);
  });

  it('writes the envelope with a fixed key order, entries in reading order, one per line', () => {
    const t: Translation = {
      kind: 'ayah',
      meta: {source: 'quran.com', language: 'en', name: 'Saheeh', id: 'quran.com:20'},
      text: {'2:10': 'c', '10:1': 'd', '2:2': 'b', '1:7': 'a'},
    };
    expect(serialiseTranslation(t)).toBe(
      [
        '{',
        ' "version": 1,',
        ' "kind": "ayah",',
        ' "meta": {',
        '  "id": "quran.com:20",',
        '  "name": "Saheeh",',
        '  "language": "en",',
        '  "source": "quran.com"',
        ' },',
        ' "text": {',
        '  "1:7": "a",',
        '  "2:2": "b",',
        '  "2:10": "c",',
        '  "10:1": "d"',
        ' }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('writes words under "words", in surah, ayah, word order, and keeps the licence', () => {
    const t: WordGloss = {
      kind: 'word',
      meta: {id: 'x', name: 'y', language: 'en', source: 'file', license: 'CC-BY-4.0'},
      words: {'1:2:1': 'b', '1:1:10': 'a2', '1:1:2': 'a1'},
    };
    const out = JSON.parse(serialiseTranslation(t));
    expect(Object.keys(out)).toEqual(['version', 'kind', 'meta', 'words']);
    expect(Object.keys(out.words)).toEqual(['1:1:2', '1:1:10', '1:2:1']);
    expect(out.meta.license).toBe('CC-BY-4.0');
  });

  it('is stable: equal translations give the same text', () => {
    const a = parseTranslationFile({'1:2': 'b', '1:1': 'a'});
    const b = parseTranslationFile({'1:1': 'a', '1:2': 'b'});
    expect(serialiseTranslation(a)).toBe(serialiseTranslation(b));
  });
});

describe('ayahKeyOf', () => {
  it('gives the ayah of a word id', () => {
    expect(ayahKeyOf('9:1:3')).toBe('9:1');
    expect(ayahKeyOf('114:6:12')).toBe('114:6');
  });

  it('gives null for no word, a sequential wordId or anything that is not a word id', () => {
    expect(ayahKeyOf(null)).toBeNull();
    expect(ayahKeyOf(undefined)).toBeNull();
    expect(ayahKeyOf(42)).toBeNull();
    expect(ayahKeyOf('9:1')).toBeNull();
    expect(ayahKeyOf('')).toBeNull();
    expect(ayahKeyOf('a:b:c')).toBeNull();
  });
});
