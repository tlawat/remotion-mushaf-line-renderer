import {stripFootnotes} from '../translations/parse';

// Where one paragraph ends and the next begins: the close of a block element, or a line break.
const BLOCK_END = /<\/(?:p|h[1-6]|div|li|blockquote|section|article|tr|ul|ol|table)\s*>|<br\s*\/?>/gi;
const BREAK = '\u0000';

/**
 * quran.com's HTML (a tafsir's text, a chapter's info) as plain paragraphs: split at the end of
 * every block element (`</p>`, `</h2>`, `</div>`, `</li>`, ...) and at `<br>`, each piece stripped
 * of its markup by `stripFootnotes()` (tags dropped, `<sup>` footnote references dropped with their
 * content, entities decoded, whitespace collapsed), empty pieces left out. Headings stay, as
 * paragraphs of their own. Pure; the text is never rendered as HTML.
 *
 * ```ts
 * htmlToParagraphs('<h2>Name</h2><p>Named <b>Al-Fatihah</b> &amp; Umm al-Kitab</p>') // ['Name', 'Named Al-Fatihah & Umm al-Kitab']
 * ```
 */
export const htmlToParagraphs = (html: string): readonly string[] =>
  html
    .replace(BLOCK_END, BREAK)
    .split(BREAK)
    .map(stripFootnotes)
    .filter((paragraph) => paragraph.length > 0);
