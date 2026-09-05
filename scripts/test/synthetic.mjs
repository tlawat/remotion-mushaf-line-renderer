// A three-page synthetic "mushaf" in QUL's shapes, used to test the compiler without network access.
// Page 1: header + 2 centred ayah lines (like Al-Fatihah); page 2: header, basmallah, two justified
// ayah lines, one of which continues an ayah onto the next page; page 3: the continuation, a
// two-code-point word, a standalone rub-el-hizb word, a centred last line, and a second surah.

const cp = (n) => String.fromCodePoint(0xfc41 + n);

export const SYNTH = {
  dataset: 'synth',
  layoutId: 0,
  pages: 3,
  linesPerPage: 4,
  linesOnPage: (page) => (page === 1 ? 3 : 4),
  invariants: {lines: 11, ayahLines: 7, surahNameLines: 3, basmallahLines: 1, centeredAyahLines: 3, words: 24, ayahs: 7, codePointMin: 0xfc41, codePointMax: 0xfcfc},
  expectations: [
    {page: 1, line: 1, type: 'surah_name', surah: 1},
    {page: 1, line: 2, type: 'ayah', firstLocation: '1:1:1', lastLocation: '1:1:3', lastKind: 'end', centered: true},
    {page: 1, lines: 3, allCentered: true},
    {page: 2, line: 1, type: 'surah_name', surah: 2},
    {page: 2, line: 2, type: 'basmallah', surah: 2},
    {page: 3, surahNameLines: 1},
  ],
};

// Words: [wordId, surah, ayah, position, kind, text]
const W = (id, s, a, p, kind, text) => ({wordId: id, surah: s, ayah: a, position: p, kind, text});

export const SYNTH_PAGES = [
  {
    page: 1,
    lines: [
      {line: 1, type: 'surah_name', centered: true, surah: 1, words: []},
      {line: 2, type: 'ayah', centered: true, words: [W(1, 1, 1, 1, 'word', cp(0)), W(2, 1, 1, 2, 'word', cp(1)), W(3, 1, 1, 3, 'end', cp(2))]},
      {line: 3, type: 'ayah', centered: true, words: [W(4, 1, 2, 1, 'word', cp(3)), W(5, 1, 2, 2, 'end', cp(4))]},
    ],
  },
  {
    page: 2,
    lines: [
      {line: 1, type: 'surah_name', centered: true, surah: 2, words: []},
      {line: 2, type: 'basmallah', centered: true, words: []},
      {line: 3, type: 'ayah', centered: false, words: [W(6, 2, 1, 1, 'word', cp(0)), W(7, 2, 1, 2, 'word', cp(1)), W(8, 2, 1, 3, 'word', cp(2)), W(9, 2, 1, 4, 'end', cp(3))]},
      {line: 4, type: 'ayah', centered: false, words: [W(10, 2, 2, 1, 'word', cp(4)), W(11, 2, 2, 2, 'word', cp(5)), W(12, 2, 2, 3, 'word', cp(6))]},
    ],
  },
  {
    page: 3,
    lines: [
      {line: 1, type: 'ayah', centered: false, words: [W(13, 2, 2, 4, 'word', cp(0)), W(14, 2, 2, 5, 'end', cp(1)), W(15, 2, 3, 1, 'rub-el-hizb', cp(2)), W(16, 2, 3, 2, 'word', cp(3) + cp(4))]},
      {line: 2, type: 'ayah', centered: false, words: [W(17, 2, 3, 3, 'word', cp(5)), W(18, 2, 3, 4, 'end', cp(6)), W(19, 2, 4, 1, 'word', cp(7)), W(20, 2, 4, 2, 'end', cp(8))]},
      {line: 3, type: 'surah_name', centered: true, surah: 3, words: []},
      {line: 4, type: 'ayah', centered: true, words: [W(21, 3, 1, 1, 'word', cp(9)), W(22, 3, 1, 2, 'word', cp(10)), W(23, 3, 1, 3, 'word', cp(11)), W(24, 3, 1, 4, 'end', cp(12))]},
    ],
  },
];

/** Renders a page in the exact structure of QUL's shared/_mushaf_page.html.erb partial. */
export const renderQulPageHtml = ({page, lines}) => {
  const lineHtml = lines
    .map((line) => {
      const classes = ['line'];
      if (line.centered && line.type === 'ayah') classes.push('line--center');
      if (line.type === 'basmallah') classes.push('line--center', 'line--bismillah');
      if (line.type === 'surah_name') classes.push('line--surah-name');
      let inner = '';
      if (line.type === 'surah_name') {
        inner = `\n          <div class="surah-name">\n  <div class="quran-icon surah-header relative">header\n      <div class="surah-icon absolute">\n         <span class="surah-name-v4-icon me-2">\n           surah${String(line.surah).padStart(3, '0')}\n         </span>\n        <span class="surah-name-v4-icon">surah-icon</span>\n      </div>\n  </div>\n</div>\n`;
      } else if (line.type === 'basmallah') {
        inner = `\n          <div class="bismillah">\n  ﷽\n</div>\n`;
      } else {
        const byAyah = new Map();
        for (const w of line.words) {
          const key = `${w.surah}:${w.ayah}`;
          if (!byAyah.has(key)) byAyah.set(key, []);
          byAyah.get(key).push(w);
        }
        for (const [key, words] of byAyah) {
          const verseId = key.split(':').map(Number).reduce((a, b) => a * 1000 + b, 0);
          inner += `\n                  <div class="ayah-container">\n                    <div class="ayah" data-ayah="${verseId}">\n`;
          for (const w of words) {
            inner += `                        <span class="char  char-${w.kind} "\n                              id="word-${w.wordId}"\n                              data-word-id="${w.wordId}"\n                              data-location="${w.surah}:${w.ayah}:${w.position}"\n                              data-ayah="${w.surah}:${w.ayah}"\n                              data-position="${w.position}"\n                              data-id="${900000 + w.wordId}">\n                      <a href="/cms/mushaf_words/${900000 + w.wordId}" target="_blank">\n                          ${w.text}\n                      </a>\n                    </span>\n`;
          }
          inner += `                      </div>\n                  </div>\n`;
        }
      }
      return `            <div class="line-container" data-line="${line.line}">\n              <div class="${classes.join(' ')}" id="line-${line.line}">${inner}                </div>\n            </div>\n`;
    })
    .join('');
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><meta name="csrf-token" content="x"><title>QUL</title></head>\n<body>\n<turbo-frame id="page">\n<div class="page-wrapper container max-w-7xl mx-auto px-4 page-section">\n<div class="mushaf-wrapper"><div class="mushaf-layout v4-tajweed">\n<div class="mushaf mushaf-v4-tajweed v4-tajweed " data-controller="mushaf-page tajweed-highlight">\n      <div class="page-wrapper container max-w-7xl mx-auto px-4 flex">\n        <div id="page-${page}" data-controller="tajweed-font" class="theme-light page p${page}-v4-tajweed ">\n${lineHtml}          </div>\n    </div>\n    </div>\n<style>@font-face { font-family: 'p${page}-v4-tajweed'; src: url('https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v4-tajweed/woff2/p${page}.woff2?v=3.1'); }</style>\n</div></div></div></turbo-frame></body></html>\n`;
};
