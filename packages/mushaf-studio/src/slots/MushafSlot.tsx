// The drop-in slots: a composition of the package inside a box of a template's own composition, its
// props under one key of the template's props, with the Mushaf panel docked beside the box's
// `<Sequence>` so it stays on every frame of the template (the intro and the outro included).
import type * as React from 'react';
import {Sequence, useVideoConfig} from 'remotion';
import {MushafRecitation} from '../compositions/recitation/MushafRecitation';
import type {MushafRecitationProps} from '../compositions/recitation/schema';
import {MushafStudioError} from '../errors';
import {MushafPage} from '../page/MushafPage';
import type {MushafPageProps} from '../page/schema';
import {MushafStudioPanel, type MushafStudioPanelProps} from '../studio';
import {useInStudio} from '../studio/environment';
import {useOwnSequenceStart} from '../studio/remotion-internals';
import {MushafAyahText} from '../unicode/MushafAyahText';
import type {MushafAyahTextProps} from '../unicode/schema';
import {slotDurationOf, slotErrorOf, unresolvedSlotErrorOf} from './resolve';
import type {MushafSlotKind} from './schema';

/** What every slot takes besides its props: where it sits in the template, when, and its panel. */
export type MushafSlotOptions = {
  /**
   * The key of the template's `defaultProps` the props live under (`'mushaf'` for
   * `defaultProps={{title: '...', mushaf: null}}`): the panel saves there and nowhere else.
   */
  readonly propsKey: string;
  /** The template frame the recitation starts at (its intro's length, say). Default 0. */
  readonly from?: number | undefined;
  /**
   * How many frames the recitation lasts. Default: what its resolver left in
   * `resolved.durationInFrames` (the end card included): the end card and the fade-out end there,
   * not at the template's end.
   */
  readonly durationInFrames?: number | undefined;
  /** The box's left edge in template pixels. Default 0. */
  readonly left?: number | undefined;
  /** The box's top edge in template pixels. Default 0. */
  readonly top?: number | undefined;
  /** The box's width: the composition lays itself out for it. Default: the template's width. */
  readonly width?: number | undefined;
  /** The box's height. Default: the template's height. */
  readonly height?: number | undefined;
  /** Frames the box mounts before `from`, so the fonts are in by its first frame (`<Sequence premountFor>`). */
  readonly premountFor?: number | undefined;
  /** The box's name on the Studio's timeline. */
  readonly name?: string | undefined;
  /** More style for the box (a border radius, a clip); `left` and `top` are the props'. */
  readonly style?: React.CSSProperties | undefined;
  /** Whether the Mushaf panel is docked in the Studio (default `true`). */
  readonly panel?: boolean | undefined;
  /** The panel's folder under `public/mushaf-studio/`. Default: `<template id>-<propsKey>`. */
  readonly project?: string | undefined;
  /** Which tab the panel opens first. */
  readonly initialTab?: MushafStudioPanelProps['initialTab'];
};

/** `<MushafRecitationSlot>`'s props: the template's field (`mushafRecitationSlotSchema`) and the slot's options. */
export type MushafRecitationSlotProps = MushafSlotOptions & {readonly props: MushafRecitationProps | null};
/** `<MushafAyahTextSlot>`'s props. */
export type MushafAyahTextSlotProps = MushafSlotOptions & {readonly props: MushafAyahTextProps | null};
/** `<MushafPageSlot>`'s props. */
export type MushafPageSlotProps = MushafSlotOptions & {readonly props: MushafPageProps | null};

const NAMES: Readonly<Record<MushafSlotKind, string>> = {
  recitation: 'Mushaf recitation',
  'ayah-text': 'Mushaf ayah text',
  page: 'Mushaf page',
};

const isResolved = (props: {readonly resolved?: unknown}): boolean =>
  typeof props.resolved === 'object' && props.resolved !== null && 'timings' in props.resolved;

type SlotOf<P> = MushafSlotOptions & {
  readonly props: P | null;
  readonly kind: MushafSlotKind;
  readonly children: (props: P) => React.ReactNode;
};

const Slot = <P extends MushafRecitationProps | MushafAyahTextProps | MushafPageProps>({
  props,
  kind,
  children,
  propsKey,
  from = 0,
  left = 0,
  top = 0,
  premountFor,
  name,
  style,
  panel = true,
  project,
  initialTab,
  ...box
}: SlotOf<P>): React.ReactElement => {
  const inStudio = useInStudio();
  const {id, width: templateWidth, height: templateHeight} = useVideoConfig();
  const start = useOwnSequenceStart();
  // What the Studio's preview reports in the panel, anything else refuses: a render, a <Player>,
  // the Studio's in-browser render (which resolves on the Studio's page, as the preview does).
  // Props no resolver filled in would leave an empty box in a finished video.
  const error = slotErrorOf(props) ?? unresolvedSlotErrorOf(kind, props, propsKey);
  if (error !== null && !inStudio)
    throw new MushafStudioError('BAD_STUDIO_PROP', `${propsKey}: ${error}`, {prop: propsKey});
  const frames = box.durationInFrames ?? slotDurationOf(props);
  const shown = props !== null && isResolved(props) && frames > 0;
  // The box's length reaches the panel: its doubt markers end where the box does.
  const options = {
    compositionId: id,
    propsKey,
    frameOffset: start + from,
    durationInFrames: frames,
    project,
    initialTab,
  };
  return (
    <>
      {shown ? (
        <Sequence
          from={from}
          durationInFrames={frames}
          width={box.width ?? templateWidth}
          height={box.height ?? templateHeight}
          name={name ?? NAMES[kind]}
          style={{...style, left, top}}
          {...(premountFor === undefined ? {} : {premountFor})}
        >
          {children(props)}
        </Sequence>
      ) : null}
      {/* Beside the Sequence, not in it: the dock stays mounted on the template's every frame. */}
      {inStudio && panel ? (
        props === null ? (
          <MushafStudioPanel {...options} props={null} kind={kind} />
        ) : (
          <MushafStudioPanel {...options} props={props} kind={kind} />
        )
      ) : null}
    </>
  );
};

/**
 * `<MushafRecitation>` dropped into a template: a `<Sequence from durationInFrames width height>`
 * at `left`/`top` with the composition inside (its own panel off), and, in the Studio, the Mushaf
 * panel beside it, saving under `propsKey` of the template's props, its seeks and timeline markers
 * placed at the slot's start. `props` is what `resolveMushafRecitationSlot()` put back under the
 * key; `null` (no recitation yet) shows nothing in the box and the panel on Source. A slot whose
 * props could not be resolved, or were never given to the resolver, shows nothing in the Studio (the
 * panel says why) and throws `BAD_STUDIO_PROP` anywhere else.
 *
 * ```tsx
 * <MushafRecitationSlot props={props.mushaf} propsKey="mushaf" from={45} left={60} top={640} width={960} height={640} />
 * ```
 */
export const MushafRecitationSlot: React.FC<MushafRecitationSlotProps> = (slot) => (
  <Slot<MushafRecitationProps> {...slot} kind="recitation">
    {(props) => <MushafRecitation {...props} panel={false} />}
  </Slot>
);

/** `<MushafRecitationSlot>` for `<MushafAyahText>`: its props from `resolveMushafAyahTextSlot()`. */
export const MushafAyahTextSlot: React.FC<MushafAyahTextSlotProps> = (slot) => (
  <Slot<MushafAyahTextProps> {...slot} kind="ayah-text">
    {(props) => <MushafAyahText {...props} panel={false} />}
  </Slot>
);

/** `<MushafRecitationSlot>` for `<MushafPage>`: its props from `resolveMushafPageSlot()`. */
export const MushafPageSlot: React.FC<MushafPageSlotProps> = (slot) => (
  <Slot<MushafPageProps> {...slot} kind="page">
    {(props) => <MushafPage {...props} panel={false} />}
  </Slot>
);
