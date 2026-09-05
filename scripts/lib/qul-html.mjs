// Parser for QUL's public mushaf-layout preview markup
// (app/views/shared/_mushaf_page.html.erb in TarteelAI/quranic-universal-library):
//
//   <div class="line-container" data-line="N">
//     <div class="line [line--center] [line--surah-name] [line--bismillah]" id="line-N">
//       <div class="surah-name">…<span class="surah-name-v4-icon">surah001</span>…</div>   (headers)
//       <div class="bismillah">﷽</div>                                                  (basmallah)
//       <div class="ayah-container"><div class="ayah" data-ayah="VERSE_ID">
//         <span class="char char-word" id="word-P" data-word-id="ID" data-location="s:a:w"
//               data-ayah="s:a" data-position="w" data-id="…"><a href="…">GLYPH</a></span>
//       …
//
// The parser is deliberately regex-based and defensive: it fails loudly on anything unexpected
// instead of guessing, because a wrong word silently becomes a wrong Quran line.

import {KNOWN_KINDS} from './datasets.mjs';

const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi;

export const decodeEntities = (s) =>
  s.replace(ENTITY, (m, e) => {
    const lower = e.toLowerCase();
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '}[lower] ?? m;
  });

const attrs = (tag) => {
  const out = {};
  for (const m of tag.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

const codePoints = (s) => Array.from(s).map((c) => c.codePointAt(0));

export class QulParseError extends Error {}

/**
 * @param {string} html  full HTML of `/mushaf_layouts/<id>?page_number=<page>`
 * @param {number} page  expected page number
 * @returns {{page:number, lines:Array<{line:number,type:'ayah'|'surah_name'|'basmallah',centered:boolean,surah?:number,words:Array<{wordId:number,surah:number,ayah:number,position:number,kind:string,text:string}>}>}}
 */
export const parsePageHtml = (html, page) => {
  if (typeof html !== 'string' || html.length === 0) {
    throw new QulParseError(`page ${page}: empty response`);
  }
  if (/name="csrf-token"/.test(html) === false && /line-container/.test(html) === false) {
    throw new QulParseError(`page ${page}: response does not look like a QUL page (no line-container)`);
  }
  const chunks = html.split(/(?=<div class="line-container")/);
  const lines = [];
  for (const chunk of chunks) {
    if (!chunk.startsWith('<div class="line-container"')) continue;
    const head = chunk.match(/^<div class="line-container"\s+data-line="(\d+)"/);
    if (!head) throw new QulParseError(`page ${page}: line-container without data-line`);
    const lineNumber = Number(head[1]);
    const lineTag = chunk.match(/<div class="line((?:\s[^"]*)?)"/); // `.line`, not `.line-container`
    if (!lineTag) throw new QulParseError(`page ${page} line ${lineNumber}: no .line element`);
    const classes = lineTag[1].split(/\s+/).filter(Boolean);
    const isHeader = classes.includes('line--surah-name');
    const isBasmallah = classes.includes('line--bismillah');
    const isCenter = classes.includes('line--center');

    let type = 'ayah';
    let surah;
    if (isHeader) {
      type = 'surah_name';
      const icon = chunk.match(/surah-name-v4-icon[^>]*>\s*surah(\d{3})\s*</);
      if (!icon) throw new QulParseError(`page ${page} line ${lineNumber}: surah header without surahNNN icon`);
      surah = Number(icon[1]);
      if (surah < 1 || surah > 114) throw new QulParseError(`page ${page} line ${lineNumber}: bad surah ${surah}`);
    } else if (isBasmallah) {
      type = 'basmallah';
    }

    const words = [];
    const spanRe = /<span class="char([^"]*)"([^>]*)>([\s\S]*?)<\/span>/g;
    for (const m of chunk.matchAll(spanRe)) {
      const spanClasses = m[1].split(/\s+/).filter(Boolean);
      if (spanClasses.includes('word--missing')) {
        throw new QulParseError(`page ${page} line ${lineNumber}: QUL marks a word as missing`);
      }
      const kindClass = spanClasses.find((c) => c.startsWith('char-'));
      if (!kindClass) throw new QulParseError(`page ${page} line ${lineNumber}: span.char without char-<type> class`);
      const kind = kindClass.slice('char-'.length);
      if (!(kind in KNOWN_KINDS)) {
        throw new QulParseError(`page ${page} line ${lineNumber}: unknown char type "${kind}" (known: ${Object.keys(KNOWN_KINDS).join(', ')})`);
      }
      const a = attrs(m[2]);
      const wordId = Number(a['data-word-id']);
      const location = a['data-location'] ?? '';
      const loc = location.match(/^(\d+):(\d+):(\d+)$/);
      if (!Number.isInteger(wordId) || wordId < 1 || !loc) {
        throw new QulParseError(`page ${page} line ${lineNumber}: word with invalid id/location (${a['data-word-id']}, ${location})`);
      }
      const position = Number(a['data-position'] ?? loc[3]);
      const inner = m[3].match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const rawText = inner ? inner[1] : m[3];
      const text = decodeEntities(rawText).replace(/\s+/gu, '');
      const cps = codePoints(text);
      if (cps.length < 1 || cps.length > 2) {
        throw new QulParseError(`page ${page} line ${lineNumber}: word ${location} has ${cps.length} code points ("${text}")`);
      }
      words.push({wordId, surah: Number(loc[1]), ayah: Number(loc[2]), position, kind, text});
    }
    if (type !== 'ayah' && words.length > 0) {
      throw new QulParseError(`page ${page} line ${lineNumber}: ${type} line contains ${words.length} words`);
    }
    if (type === 'ayah' && words.length === 0) {
      throw new QulParseError(`page ${page} line ${lineNumber}: ayah line without words`);
    }
    // Document order must equal id order (the notes warn about ordering by position instead).
    for (let i = 1; i < words.length; i++) {
      if (words[i].wordId <= words[i - 1].wordId) {
        throw new QulParseError(`page ${page} line ${lineNumber}: words not in id order at ${words[i].wordId}`);
      }
    }
    lines.push({line: lineNumber, type, centered: isCenter || type !== 'ayah', ...(surah ? {surah} : {}), words});
  }
  if (lines.length === 0) throw new QulParseError(`page ${page}: no lines found`);
  lines.sort((a, b) => a.line - b.line);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].line !== i + 1) throw new QulParseError(`page ${page}: line numbers are not 1..n (got ${lines.map((l) => l.line).join(',')})`);
  }
  return {page, lines};
};
