// @vitest-environment jsdom
// The panel's two languages: every key in both, the same placeholders in both, the plural forms,
// and the dock switching to Arabic, right to left, remembered with the panel layout.
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const env = vi.hoisted(() => ({
  isStudio: true,
  isRendering: false,
  isPlayer: false,
  isClientSideRendering: false,
  isReadOnlyStudio: false,
}));
vi.mock('remotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('remotion')>()),
  getRemotionEnvironment: () => env,
  useRemotionEnvironment: () => env,
  useVideoConfig: () => ({width: 1920, height: 1080, fps: 30, durationInFrames: 900, id: 'MushafRecitation'}),
  useCurrentFrame: () => 0,
  Sequence: () => null,
  staticFile: (path: string) => `/static/${path}`,
}));
vi.mock('@remotion/studio', () => ({
  writeStaticFile: vi.fn(),
  saveDefaultProps: vi.fn(),
  reevaluateComposition: vi.fn(),
  getStaticFiles: vi.fn(() => []),
  watchPublicFolder: vi.fn(() => ({cancel: vi.fn()})),
  seek: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  toggle: vi.fn(),
}));
vi.mock('../../../src/qud', () => ({listRecitations: vi.fn(async () => []), DEFAULT_CONFIDENCE_THRESHOLD: 0.8}));

const {MESSAGES, translate, directionOf, isStudioLanguage, STUDIO_LANGUAGES} = await import('../../../src/studio/i18n');
const {MushafStudioPanel} = await import('../../../src/studio');
const {defaultMushafRecitationProps} = await import('../../../src/compositions/recitation/schema');
const {resetStudioStore, getStudioState, setStudioState, t} = await import('../../../src/studio/store');
const {surahLabel} = await import('../../../src/studio/surahs');
type Message = import('../../../src/studio/i18n').Message;

const forms = (message: Message): readonly string[] =>
  typeof message === 'string' ? [message] : Object.values(message).filter((v): v is string => typeof v === 'string');
const placeholders = (message: Message): readonly string[] =>
  [...new Set(forms(message).flatMap((form) => [...form.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)))].sort();

const dock = () => document.body.querySelector<HTMLElement>('[data-mushaf-studio="panel"]')!;

beforeEach(() => resetStudioStore());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetStudioStore();
});

describe('the dictionary', () => {
  it('has every key in both languages, none empty, plural messages with an `other` form', () => {
    const en = Object.keys(MESSAGES.en).sort();
    const ar = Object.keys(MESSAGES.ar).sort();
    expect(ar).toEqual(en);
    expect(en.length).toBeGreaterThan(200);
    for (const language of ['en', 'ar'] as const)
      for (const [key, message] of Object.entries(MESSAGES[language])) {
        expect(forms(message).length, `${language} ${key}`).toBeGreaterThan(0);
        for (const form of forms(message)) expect(form.trim(), `${language} ${key}`).not.toBe('');
        if (typeof message !== 'string') expect(typeof message.other, `${language} ${key}`).toBe('string');
      }
  });

  it('fills the same placeholders in both languages', () => {
    for (const key of Object.keys(MESSAGES.en) as (keyof typeof MESSAGES.en)[])
      expect(placeholders(MESSAGES.ar[key]), key).toEqual(placeholders(MESSAGES.en[key]));
  });

  it('writes the Arabic in Arabic, keeping the technical names', () => {
    const arabic = /[؀-ۿ]/;
    const technical = new Set([
      'panel.title',
      'review.captionsJson',
      'review.editEntry',
      'project.badProps',
      'unit.seconds',
    ]);
    for (const [key, message] of Object.entries(MESSAGES.ar))
      if (!technical.has(key)) for (const form of forms(message)) expect(arabic.test(form), key).toBe(true);
    expect(translate('ar', 'align.consent')).toContain('QUD');
    expect(translate('ar', 'align.consent')).toContain('aligner.qud.dev');
    expect(translate('ar', 'review.exportNote')).toContain('JSON');
    expect(translate('ar', 'text.noJson')).toContain('public/');
  });

  it('fills placeholders, picks the plural form of the language, and leaves an unknown placeholder', () => {
    expect(translate('en', 'review.apply', {count: 3})).toBe('Apply edits (3)');
    expect(translate('en', 'review.wordCount', {count: 1})).toBe('1 word');
    expect(translate('en', 'review.wordCount', {count: 0})).toBe('0 words');
    expect(translate('en', 'review.wordCount', {count: 2})).toBe('2 words');
    expect(translate('ar', 'review.wordCount', {count: 2})).toBe('الكلمات: 2');
    expect(translate('en', 'text.now')).toBe('Now: {file}');
    expect(translate('en', 'status.retryIn', {seconds: 42})).toBe('Retry in 42 s.');
  });

  it('knows its languages and their direction', () => {
    expect(STUDIO_LANGUAGES.map((l) => l.id)).toEqual(['en', 'ar']);
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
    expect(isStudioLanguage('ar')).toBe(true);
    expect(isStudioLanguage('fr')).toBe(false);
  });

  it('follows the store outside components too', () => {
    expect(t('tab.review')).toBe('Review');
    setStudioState({language: 'ar'});
    expect(t('tab.review')).toBe('المراجعة');
    expect(surahLabel(2, 'ar')).toBe('2. البقرة');
    expect(surahLabel(2)).toBe('2. Al-Baqarah (البقرة)');
  });
});

describe('the language switch', () => {
  it('turns the dock to Arabic, right to left, and remembers it', async () => {
    render(<MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} />);
    expect(dock().getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('button', {name: 'English'}).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', {name: 'العربية'}));
    expect(dock().getAttribute('dir')).toBe('rtl');
    expect(dock().getAttribute('lang')).toBe('ar');
    expect(dock().getAttribute('aria-label')).toBe('استوديو المصحف');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'المصدر',
      'المظهر',
      'المحاذاة',
      'المراجعة',
      'الأسطر',
      'النص',
    ]);
    await screen.findByText('استخدم هذه التلاوة');
    await screen.findByText('جاهز.');
    expect(screen.queryByText('Use this recitation')).toBeNull();
    expect(JSON.parse(localStorage.getItem('mushaf-studio.panel')!).language).toBe('ar');
    // Every tab renders in Arabic.
    for (const name of ['المظهر', 'المحاذاة', 'المراجعة', 'الأسطر', 'النص']) {
      fireEvent.click(screen.getByRole('tab', {name}));
      expect(getStudioState().error).toBeNull();
    }
    expect(screen.getByText('نص القرآن')).toBeTruthy();
    vi.resetModules();
    const fresh = await import('../../../src/studio/store');
    expect(fresh.getStudioState().language).toBe('ar');
    fireEvent.click(screen.getByRole('button', {name: 'English'}));
    expect(dock().getAttribute('dir')).toBe('ltr');
    await waitFor(() => expect(screen.getByRole('tab', {name: 'Text'})).toBeTruthy());
  });

  it('opens in the stored language', () => {
    setStudioState({language: 'ar'});
    render(
      <MushafStudioPanel compositionId="MushafRecitation" props={defaultMushafRecitationProps} initialTab="review" />,
    );
    expect(dock().getAttribute('dir')).toBe('rtl');
    expect(screen.getByText(/لا شيء للمراجعة بعد/)).toBeTruthy();
  });
});
