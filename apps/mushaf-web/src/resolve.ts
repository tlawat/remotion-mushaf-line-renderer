// The page's own `calculateMetadata()`: the package's resolvers run here, with the memory files
// behind `fetch` and `staticFile`, and the `<Player>` and the in-browser render get the props with
// `resolved` filled in and the size and length the same helpers give.
import {
  type MushafAyahTextProps,
  type MushafRecitationProps,
  type ResolvedAyahText,
  type ResolvedRecitation,
  resolveAyahText,
  resolveRecitation,
} from '@tlawat/mushaf-studio';
import type {RecitationTimings} from '@tlawat/remotion-mushaf-line';
import {memoryFetch, memoryStaticFile} from './memory-files';
import {type BuiltProps, type VideoSpec, videoSpec} from './project';

export type ResolvedVideo =
  | {
      readonly composition: 'recitation';
      readonly props: MushafRecitationProps & {readonly resolved: ResolvedRecitation};
      readonly spec: VideoSpec;
    }
  | {
      readonly composition: 'ayah-text';
      readonly props: MushafAyahTextProps & {readonly resolved: ResolvedAyahText};
      readonly spec: VideoSpec;
    };

export type ResolveOptions = {
  readonly fetch?: typeof fetch | undefined;
  readonly staticFile?: ((path: string) => string) | undefined;
  readonly signal?: AbortSignal | undefined;
};

/** The timings the video plays, for the captions: already trimmed to the range and moved to start at frame 0. */
export const playedTimings = (video: ResolvedVideo): RecitationTimings => video.props.resolved.timings;

/**
 * Resolves the built props as `calculateMetadata()` would: `resolved`, then the size from the
 * aspect and the length from the resolved timings. Reads `mem://` files from the page's store
 * unless `fetch` says otherwise.
 */
export const resolveVideo = async (built: BuiltProps, options: ResolveOptions = {}): Promise<ResolvedVideo> => {
  const io = {fetch: options.fetch ?? memoryFetch, staticFile: options.staticFile ?? memoryStaticFile};
  if (built.composition === 'recitation') {
    const resolved = await resolveRecitation(built.props, {...io, ...(options.signal ? {signal: options.signal} : {})});
    return {
      composition: 'recitation',
      props: {...built.props, resolved},
      spec: videoSpec(built.props.layout.aspect, resolved.timings),
    };
  }
  const resolved = await resolveAyahText(built.props, io);
  return {
    composition: 'ayah-text',
    props: {...built.props, resolved},
    spec: videoSpec(built.props.layout.aspect, resolved.timings),
  };
};
