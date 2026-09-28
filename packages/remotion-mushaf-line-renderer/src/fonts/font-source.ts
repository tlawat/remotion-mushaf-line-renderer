import {describeValue, MushafError} from '../errors';
import {fnv1a32} from '../hash';
import type {MushafDefinition} from '../mushaf/registry';
import type {MushafFontFallback, MushafFontOrigin, MushafFontPackage, MushafFontSrc} from '../types';
import type {FontTarget} from './font-file';

/** One place to fetch a font from. Package steps carry the size and hash the file must have. */
export type FontStep = {
  readonly origin: MushafFontOrigin;
  readonly url: string;
  /** For messages: "QUL's CDN", "@tlawat/mushaf-fonts-qpc-v4@1.20260912.0", "your fontSrc". */
  readonly source: string;
  readonly expect?: {readonly bytes: number; readonly sha256: string};
};

/**
 * Where one font comes from, as the loader runs it: the steps in order, the store key and the
 * family the face is registered under. Lines with the same source share one face; different
 * sources never do, so a line's font depends only on its own props.
 */
export type FontSourcePlan = {
  readonly key: string;
  readonly fontFamily: string;
  readonly steps: readonly FontStep[];
  /** For delayRender labels and errors. */
  readonly describe: string;
  /** The font set or shared font this plan is for: one fallback warning per group. */
  readonly group: string;
};

const warned = new Set<string>();
const warnOnce = (key: string, message: string): void => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
};

const SHA256 = /^[0-9a-f]{64}$/;

const packageName = (fontSet: string): string => `@tlawat/mushaf-fonts-${fontSet}`;

/** Loose check: is this value shaped like a fonts package's default export? */
export const isFontPackage = (value: unknown): value is MushafFontPackage =>
  typeof value === 'object' &&
  value !== null &&
  (value as {kind?: unknown}).kind === 'remotion-mushaf-fonts' &&
  typeof (value as {files?: unknown}).files === 'object' &&
  (value as {files?: unknown}).files !== null;

const assertPackage = (
  pkg: MushafFontPackage,
  code: 'BAD_FONT_SRC' | 'BAD_FONT_FALLBACK',
  prop: string,
  def: MushafDefinition,
): void => {
  const problem = (why: string) =>
    new MushafError(code, `${prop}: ${why}. Pass the default export of a fonts package unchanged.`, {
      name: pkg.name,
      version: pkg.version,
    });
  if (pkg.schema !== 1)
    throw problem(
      `${describeValue(pkg.name)} has package schema ${describeValue(pkg.schema)}; this version of @tlawat/remotion-mushaf-line reads schema 1 (upgrade one of the two packages)`,
    );
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string' || typeof pkg.fontSet !== 'string')
    throw problem('name, version and fontSet must be strings');
  if (pkg.mushaf !== def.id)
    throw problem(`${pkg.name} holds fonts of mushaf ${describeValue(pkg.mushaf)}, but the line is "${def.id}"`);
};

const packageStep = (
  pkg: MushafFontPackage,
  page: number,
  code: 'BAD_FONT_SRC' | 'BAD_FONT_FALLBACK',
  prop: string,
): FontStep => {
  const file = pkg.files[page];
  const source = `${pkg.name}@${pkg.version}`;
  if (
    !file ||
    typeof file.url !== 'string' ||
    file.url === '' ||
    typeof file.bytes !== 'number' ||
    !Number.isInteger(file.bytes) ||
    file.bytes <= 0 ||
    typeof file.sha256 !== 'string' ||
    !SHA256.test(file.sha256)
  ) {
    throw new MushafError(
      code,
      `${prop}: ${source} has no valid entry for page ${page} (expected {url, bytes, sha256}). Reinstall the package.`,
      {package: source, page},
    );
  }
  return {origin: 'package', url: file.url, source, expect: {bytes: file.bytes, sha256: file.sha256}};
};

const resolverUrls = (urls: unknown, label: string): readonly string[] => {
  const list = typeof urls === 'string' ? [urls] : Array.isArray(urls) ? urls : null;
  if (!list || list.length === 0 || !list.every((u) => typeof u === 'string' && u !== '')) {
    throw new MushafError(
      'BAD_FONT_SRC',
      `fontSrc: the resolver returned ${describeValue(urls)} for mushaf font ${label}; it must return a non-empty URL string, a non-empty array of them or (for a page font) a fonts package. Wrap files in public/ with staticFile().`,
      {font: label},
    );
  }
  return list as readonly string[];
};

/** The shared fonts are not in the fonts packages: says so, with the way to serve them yourself. */
const noPackageFor = (target: FontTarget, prop: string, pkg: MushafFontPackage, how: string): MushafError =>
  new MushafError(
    'BAD_FONT_SRC',
    `${prop}: ${pkg.name} holds page fonts only, and mushaf font ${target.label} (${target.file.fileName}) is not a page font. ${how} (README → Surah names and juz names).`,
    {package: pkg.name, font: target.label},
  );

const suffix = (specKey: string): string => fnv1a32(specKey).toString(36);

/**
 * Turns `fontSrc` + `fontFallback` into the steps for one font, validating both. Pure apart from
 * calling the resolver (which must itself be pure) and one-time warnings. Throws BAD_FONT_SRC or
 * BAD_FONT_FALLBACK, so a mistake shows up the first time the line renders, not during an outage.
 *
 * A fonts package holds page fonts only: as `fontSrc` for a shared font it is refused, and as a
 * fallback it simply does not apply (the shared fonts have no fallback).
 */
export const planFontSource = (
  def: MushafDefinition,
  target: FontTarget,
  fontSrc: MushafFontSrc | undefined,
  fallback: MushafFontFallback | undefined,
): FontSourcePlan => {
  const {file} = target;
  const src = fontSrc ?? 'cdn';
  const steps: FontStep[] = [];
  let primaryKey: string;
  let primaryPackage: MushafFontPackage | null = null;
  const takePackage = (pkg: MushafFontPackage, prop: string): void => {
    assertPackage(pkg, 'BAD_FONT_SRC', prop, def);
    if (target.page === null) {
      throw noPackageFor(
        target,
        prop,
        pkg,
        "Use 'cdn', or a resolver (file) => url that returns the package for file.kind === 'page' and your own URL for file.kind === 'shared'",
      );
    }
    if (pkg.fontSet !== target.page.fontSet.id) {
      throw new MushafError(
        'BAD_FONT_SRC',
        `${prop}: ${pkg.name} holds the ${pkg.fontSet} fonts, but this line uses ${target.page.fontSet.id} (its theme decides the font set). Install and pass ${packageName(target.page.fontSet.id)}.`,
        {package: pkg.name, fontSet: target.page.fontSet.id},
      );
    }
    steps.push(packageStep(pkg, target.page.page, 'BAD_FONT_SRC', prop));
    primaryKey = `pkg:${pkg.name}@${pkg.version}`;
    primaryPackage = pkg;
  };
  if (src === 'cdn') {
    steps.push({origin: 'cdn', url: file.cdnUrl, source: "QUL's CDN"});
    primaryKey = 'cdn';
  } else if (typeof src === 'function') {
    const resolved: unknown = src(file);
    if (isFontPackage(resolved)) {
      takePackage(resolved, 'fontSrc (the resolver)');
    } else {
      for (const url of resolverUrls(resolved, target.label))
        steps.push({origin: 'custom', url, source: 'your fontSrc'});
      primaryKey = `u:${steps.map((s) => s.url).join('\n')}`;
    }
  } else if (isFontPackage(src)) {
    takePackage(src, 'fontSrc');
  } else {
    throw new MushafError(
      'BAD_FONT_SRC',
      `fontSrc must be 'cdn', a fonts package (import fonts from '${packageName(target.page?.fontSet.id ?? 'qpc-v4')}') or a function (file) => url, got ${describeValue(src)}.${typeof src === 'string' ? ' For a single URL, pass () => url.' : ''}`,
      {fontSrc: src},
    );
  }

  let fallbackKey = '';
  if (fallback !== undefined) {
    const list: readonly unknown[] = Array.isArray(fallback) ? fallback : [fallback];
    for (const item of list) {
      if (!isFontPackage(item)) {
        throw new MushafError(
          'BAD_FONT_FALLBACK',
          `fontFallback must be a fonts package (import fonts from '${packageName(target.page?.fontSet.id ?? 'qpc-v4')}') or an array of them, got ${describeValue(item)}.`,
          {fontFallback: item},
        );
      }
      assertPackage(item, 'BAD_FONT_FALLBACK', 'fontFallback', def);
    }
    const packages = list as readonly MushafFontPackage[];
    if (target.page !== null) {
      const {fontSet, page} = target.page;
      const match = packages.find((p) => p.fontSet === fontSet.id);
      if (packages.length > 0 && !match) {
        throw new MushafError(
          'BAD_FONT_FALLBACK',
          `This line uses the ${fontSet.id} fonts (its theme decides the font set), but fontFallback only has ${packages.map((p) => p.name).join(', ')}. Install and pass ${packageName(fontSet.id)}.`,
          {fontSet: fontSet.id, packages: packages.map((p) => p.name)},
        );
      }
      if (match && primaryPackage) {
        warnOnce(
          `fallback-ignored:${fontSet.id}`,
          `@tlawat/remotion-mushaf-line: fontFallback is ignored because fontSrc is already a fonts package (${(primaryPackage as MushafFontPackage).name}).`,
        );
      } else if (match) {
        steps.push(packageStep(match, page, 'BAD_FONT_FALLBACK', 'fontFallback'));
        fallbackKey = `+pkg:${match.name}@${match.version}`;
      }
    }
  }

  const specKey = primaryKey! + fallbackKey;
  const base = target.baseFamily;
  return {
    key: `${target.storePrefix}#${specKey}`,
    fontFamily: specKey === 'cdn' ? base : `${base}-${suffix(specKey)}`,
    steps,
    describe: steps.map((s) => (s.origin === 'package' ? s.source : `${s.source} (${s.url})`)).join(', then '),
    group: target.group,
  };
};

/** Test hook. */
export const resetFontSourceWarnings = (): void => warned.clear();
