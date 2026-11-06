// The slot resolvers: what a template's `calculateMetadata()` calls for the props it keeps under a
// key. Unlike the compositions' own `calculateMetadata()`, they never throw in the Studio's preview
// (the panel that fixes the props must stay on screen), compute the durations at the template's
// frame rate, and return no size (the slot's box decides it).
import {isMushafError} from '@tlawat/remotion-mushaf-line';
import {
  previewsLeniently,
  type ResolvedProps,
  resolveRecitationProps,
} from '../compositions/recitation/calculate-metadata';
import type {MushafRecitationProps} from '../compositions/recitation/schema';
import {isMushafStudioError} from '../errors';
import {resolvePageProps} from '../page/calculate-metadata';
import type {MushafPageProps} from '../page/schema';
import {resolveAyahTextProps} from '../unicode/calculate-metadata';
import type {MushafAyahTextProps} from '../unicode/schema';

/** What a slot resolver takes from the template's `calculateMetadata()`. */
export type ResolveSlotOptions = {
  /** The template's frame rate: the slot's durations, the audio's trim and the glow's levels are at it. */
  readonly fps: number;
  /** `calculateMetadata()`'s `abortSignal`: reaches every fetch. */
  readonly abortSignal?: AbortSignal | undefined;
  /** `calculateMetadata()`'s `isRendering`: a render rethrows what the Studio's preview reports in `error`. */
  readonly isRendering?: boolean | undefined;
};

/**
 * What a slot resolver returns: the props to put back under the template's key (`resolved` filled,
 * `resolved.durationInFrames` included), the slot's length in frames of the template's fps (0 when
 * there is nothing to show yet), and, in the Studio's preview, why the props could not be resolved.
 */
export type ResolvedSlot<P> = {
  /** `null` when the template holds `null`; else the props with `resolved` (`null` while there is nothing to resolve). */
  readonly props: P | null;
  readonly durationInFrames: number;
  /** The message of the `MushafStudioError` (or `MushafError`) the props raised; `null` when they resolved. */
  readonly error: string | null;
};

/**
 * What `resolved` holds when a slot's props could not be resolved in the Studio's preview: the
 * message the panel shows. Never in a render (the resolver rethrows there).
 */
export type SlotResolutionError = {readonly error: string; readonly durationInFrames: 0};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The message a slot resolver left in `props.resolved` when the props could not be resolved in the
 * Studio's preview (`SlotResolutionError`), else `null`: what the panel shows over its tabs.
 */
export const slotErrorOf = (props: {readonly resolved?: unknown} | null | undefined): string | null => {
  const resolved = props?.resolved;
  return isRecord(resolved) && typeof resolved.error === 'string' && !('timings' in resolved) ? resolved.error : null;
};

/**
 * The slot's length in frames as its resolver left it (`resolved.durationInFrames`); 0 for `null`
 * props, props not resolved yet, or props that could not be resolved.
 */
export const slotDurationOf = (props: {readonly resolved?: unknown} | null | undefined): number => {
  const resolved = props?.resolved;
  if (!isRecord(resolved) || !('timings' in resolved)) return 0;
  const frames = resolved.durationInFrames;
  return typeof frames === 'number' && Number.isFinite(frames) ? Math.max(0, Math.round(frames)) : 0;
};

const resolveSlot = async <P extends {readonly resolved?: unknown}>(
  props: P | null,
  options: ResolveSlotOptions,
  empty: (props: P) => boolean,
  resolve: (
    props: P,
    options: {readonly fps: number; readonly signal?: AbortSignal | undefined; readonly lenientSplits: boolean},
  ) => Promise<ResolvedProps<P>>,
): Promise<ResolvedSlot<P>> => {
  if (props === null) return {props: null, durationInFrames: 0, error: null};
  if (empty(props)) return {props: {...props, resolved: null}, durationInFrames: 0, error: null};
  const lenient = previewsLeniently(options.isRendering ?? false);
  try {
    const resolved = await resolve(props, {fps: options.fps, signal: options.abortSignal, lenientSplits: lenient});
    const withLength = {...(resolved.props.resolved as object), durationInFrames: resolved.durationInFrames};
    return {props: {...resolved.props, resolved: withLength}, durationInFrames: resolved.durationInFrames, error: null};
  } catch (error) {
    // Only the package's own errors: they name the value and the fix. An abort or a bug passes through.
    if (!lenient || !(isMushafStudioError(error) || isMushafError(error))) throw error;
    const failed: SlotResolutionError = {error: error.message, durationInFrames: 0};
    return {props: {...props, resolved: failed}, durationInFrames: 0, error: error.message};
  }
};

/**
 * Resolves the `<MushafRecitation>` props a template keeps under a key, for the template's
 * `calculateMetadata()`: `resolveRecitationProps()` at the template's `fps`, with the length in
 * `resolved.durationInFrames` for `<MushafRecitationSlot>`. `null` props (no recitation picked) and
 * an empty `timingsFile` give 0 frames and no error. In the Studio's preview a `MushafStudioError`
 * gives `error` (and the panel shows it) instead of throwing, and a split that no longer fits is
 * left out; a render (`isRendering`, or anywhere outside the Studio) rethrows it. Returns no size.
 *
 * ```ts
 * calculateMetadata: async ({props, abortSignal, isRendering}) => {
 *   const mushaf = await resolveMushafRecitationSlot(props.mushaf, {fps: 30, abortSignal, isRendering});
 *   return {props: {...props, mushaf: mushaf.props}, durationInFrames: INTRO + mushaf.durationInFrames + OUTRO};
 * },
 * ```
 */
export const resolveMushafRecitationSlot = (
  props: MushafRecitationProps | null,
  options: ResolveSlotOptions,
): Promise<ResolvedSlot<MushafRecitationProps>> =>
  resolveSlot(props, options, (p) => p.timingsFile === '', resolveRecitationProps);

/**
 * `resolveMushafRecitationSlot()` for `<MushafAyahText>` props (`<MushafAyahTextSlot>`): an empty
 * `timingsFile` or `textFile` gives 0 frames and no error.
 */
export const resolveMushafAyahTextSlot = (
  props: MushafAyahTextProps | null,
  options: ResolveSlotOptions,
): Promise<ResolvedSlot<MushafAyahTextProps>> =>
  resolveSlot(props, options, (p) => p.timingsFile === '' || p.textFile === '', resolveAyahTextProps);

/** `resolveMushafRecitationSlot()` for `<MushafPage>` props (`<MushafPageSlot>`). */
export const resolveMushafPageSlot = (
  props: MushafPageProps | null,
  options: ResolveSlotOptions,
): Promise<ResolvedSlot<MushafPageProps>> => resolveSlot(props, options, (p) => p.timingsFile === '', resolvePageProps);
