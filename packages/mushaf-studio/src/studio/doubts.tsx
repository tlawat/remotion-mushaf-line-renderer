// The doubtful segments as clips on the Studio's own timeline. The panel component is rendered in
// the composition tree (only its dock is portaled), so it can register empty `<Sequence>`s there:
// the Studio draws each as a named track over the stretch it covers. Studio only, like the panel.
import type * as React from 'react';
import {Sequence, useVideoConfig} from 'remotion';
import {DEFAULT_CONFIDENCE_THRESHOLD} from '../qud';
import type {AlignmentSegment} from '../types';
import type {MessageKey, MessageParams} from './i18n';
import {useStudioState, useT} from './store';
import {isAyahTextProps, resolvedOf, type StudioCompositionProps} from './tab-props';

/** Whether the Review tab and the timeline flag a segment: under the threshold, missing words, or an error. */
export const isDoubtfulSegment = (segment: AlignmentSegment, threshold: number): boolean =>
  segment.confidence < threshold || segment.hasMissingWords || segment.error !== null;

/** One marker on the timeline: a `<Sequence>`'s `from`, `durationInFrames` and `name`. */
export type DoubtMarker = {
  readonly segment: number;
  readonly from: number;
  readonly durationInFrames: number;
  readonly name: string;
};

type Translate = (key: MessageKey, params?: MessageParams) => string;

/**
 * The marker's name: `⚠ 62% 1:3:1–1:3:2`, then what else is wrong (missing words, the aligner's
 * error). A segment with no match has no references to show.
 */
export const doubtMarkerName = (segment: AlignmentSegment, t: Translate): string => {
  const flags = [
    segment.hasMissingWords ? t('review.flagMissing') : null,
    segment.error !== null ? segment.error : null,
  ].filter((flag): flag is string => flag !== null);
  const refs =
    segment.refFrom === null && segment.refTo === null ? '' : ` ${segment.refFrom ?? '?'}–${segment.refTo ?? '?'}`;
  const head = `⚠ ${Math.round(segment.confidence * 100)}%${refs}`;
  return flags.length > 0 ? `${head} · ${flags.join(' · ')}` : head;
};

/**
 * The markers of the doubtful segments, in composition frames: the segments' times are already
 * composition times (`resolved.timings`, moved `audioOffsetSeconds` earlier), so a segment that
 * ends before frame 0 is dropped and one that starts before it is clipped. Every marker is at least
 * one frame long, as `<Sequence>` requires.
 */
export const doubtMarkers = (
  segments: readonly AlignmentSegment[],
  threshold: number,
  fps: number,
  t: Translate,
): readonly DoubtMarker[] =>
  segments
    .filter((segment) => isDoubtfulSegment(segment, threshold) && segment.timeTo > 0)
    .map((segment) => {
      const from = Math.max(0, Math.round(segment.timeFrom * fps));
      const end = Math.round(segment.timeTo * fps);
      return {
        segment: segment.segment,
        from,
        durationInFrames: Math.max(1, end - from),
        name: doubtMarkerName(segment, t),
      };
    });

/**
 * The doubtful segments of the composition's alignment as empty `<Sequence>`s, shown in the
 * timeline only. Rendered by the panel in the Studio's preview only, next to (not inside) the
 * dock's portal; nothing when the user turned them off in the Review tab.
 */
export const DoubtMarkers: React.FC<{readonly props: StudioCompositionProps}> = ({props}) => {
  const {showDoubts} = useStudioState();
  const t = useT();
  const {fps} = useVideoConfig();
  const segments = resolvedOf(props)?.timings.alignment?.segments ?? [];
  if (!showDoubts || segments.length === 0) return null;
  const threshold = isAyahTextProps(props) ? DEFAULT_CONFIDENCE_THRESHOLD : props.review.confidenceThreshold;
  return (
    <>
      {doubtMarkers(segments, threshold, fps, t).map((marker) => (
        <Sequence
          key={marker.segment}
          from={marker.from}
          durationInFrames={marker.durationInFrames}
          name={marker.name}
          layout="none"
          showInTimeline
        />
      ))}
    </>
  );
};
