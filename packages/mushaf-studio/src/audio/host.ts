// The `hostAudio` props group: the recitation follows an audio track the template plays itself,
// instead of playing `audioFile` with its own `<Audio>`. Optional in every schema and read
// leniently (`hostAudioOf()`), so props saved before it existed keep working. Pure: a render reads
// only these saved values, never the Studio's timeline.
import {z} from 'zod';
import {describeValue, MushafStudioError} from '../errors';

/**
 * The `name` the compositions give their own `<Audio>`: the Mushaf panel leaves a track of that
 * name (or inside a sequence of that name) out of the template's tracks it offers.
 */
export const OWN_AUDIO_NAME = 'Mushaf recitation audio';

export const hostAudioSchema = z
  .object({
    /** The template plays the audio: the composition plays none of its own, and `audio`'s cleanup does nothing. */
    enabled: z
      .boolean()
      .describe(
        "The template plays the audio (its own <Audio> track): the composition plays none, and the audio cleanup (loudness, fades, trimSilence, volume) is the template's",
      ),
    /** May be negative: the track starts after the recitation's frame 0. */
    offsetSeconds: z
      .number()
      .describe(
        "Second of the template's track heard at the recitation's first frame (set by the Mushaf panel's Update timing)",
      ),
    /** Informational: what the panel matched the track by when it set the offset. */
    track: z.string().describe('The template track this follows, as the Studio timeline names it'),
  })
  .describe('Follow an audio track of the template instead of playing audioFile (wins over the audio cleanup)');

export type HostAudio = z.infer<typeof hostAudioSchema>;

/** Off: the composition plays `audioFile` itself. */
export const defaultHostAudio: HostAudio = {enabled: false, offsetSeconds: 0, track: ''};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `props.hostAudio`, read leniently: `defaultHostAudio` when it is missing (props saved before it
 * existed) or not an object, and each field's default when that field is missing or of another
 * type. `offsetSeconds` must be finite.
 */
export const hostAudioOf = (props: object): HostAudio => {
  const value = (props as {readonly hostAudio?: unknown}).hostAudio;
  if (!isRecord(value)) return defaultHostAudio;
  return {
    enabled: value.enabled === true,
    offsetSeconds:
      typeof value.offsetSeconds === 'number' && Number.isFinite(value.offsetSeconds) ? value.offsetSeconds : 0,
    track: typeof value.track === 'string' ? value.track : '',
  };
};

/** Whether the composition follows the template's track rather than playing its own audio. */
export const followsHostAudio = (props: object): boolean => hostAudioOf(props).enabled;

/**
 * Refuses `memorize` repeats under `hostAudio`: a repeat replays a clip of the recording, and the
 * template's track plays straight through. `BAD_STUDIO_PROP` when `hostAudio.enabled` and
 * `memorize.repeat` plays an ayah more than once under a mode other than `'off'`.
 */
export const assertNoHostRepeats = (
  props: object,
  memorize: {readonly mode: string; readonly repeat: number},
): void => {
  if (!followsHostAudio(props) || memorize.mode === 'off' || memorize.repeat <= 1) return;
  throw new MushafStudioError(
    'BAD_STUDIO_PROP',
    `memorize.repeat is ${describeValue(memorize.repeat)} (mode ${describeValue(memorize.mode)}), but hostAudio.enabled is true: the template's track plays straight through, so an ayah cannot be played again. Set memorize.repeat to 1 or memorize.mode to "off", or turn hostAudio off so the composition plays audioFile itself.`,
    {prop: 'memorize.repeat', repeat: memorize.repeat, mode: memorize.mode},
  );
};
