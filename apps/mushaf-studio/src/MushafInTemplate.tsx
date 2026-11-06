// An example of a template of your own with a recitation dropped into it: a 1080x1920 reel with its
// own title, intro and outro, its own Zod schema, its own audio track, and the recitation's props
// under one key (`mushaf`). The Mushaf panel saves there and leaves the template's own props alone;
// it stays docked on every frame, the intro and the outro included. The recitation follows the
// template's track (`mushaf.hostAudio`) instead of playing its audio itself: the panel's Source tab
// lists the track under "A track in this video".
import {
  MushafRecitationSlot,
  mushafRecitationSlotSchema,
  resolveMushafRecitationSlot,
  slotDurationOf,
} from '@tlawat/mushaf-studio';
import type * as React from 'react';
import {
  AbsoluteFill,
  Audio,
  type CalculateMetadataFunction,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {z} from 'zod';

/** The template's frame rate: the recitation is resolved at it, so its frames are the template's. */
export const TEMPLATE_FPS = 30;

/** The name of the template's own `<Audio>`: what the Studio's timeline and the Mushaf panel call the track. */
export const TEMPLATE_AUDIO_NAME = 'Template audio';

/** Where the recitation sits, in template pixels. */
const BOX = {left: 60, top: 600, width: 960, height: 720} as const;

export const mushafInTemplateSchema = z.object({
  title: z.string().describe('The title the intro shows'),
  subtitle: z.string().describe('The line under the title'),
  introSeconds: z.number().min(0).max(10).describe('Seconds of intro before the recitation'),
  outro: z.string().describe('What the outro says'),
  outroSeconds: z.number().min(0).max(10).describe('Seconds of outro after the recitation'),
  soundtrack: z
    .string()
    .describe("The template's own audio track, a path in public/ (empty: none), from the recitation's start"),
  // The recitation, nested under one key so it never collides with the template's own props; `null`
  // until a recitation is picked in the Mushaf panel.
  mushaf: mushafRecitationSlotSchema,
});

export type MushafInTemplateProps = z.infer<typeof mushafInTemplateSchema>;

const framesOf = (seconds: number): number => Math.round(seconds * TEMPLATE_FPS);

/**
 * The template's `calculateMetadata()`: the recitation resolved at the template's fps
 * (`resolveMushafRecitationSlot()`, which never throws in the Studio, so the panel can fix what is
 * wrong), and the template as long as its intro, the recitation and its outro.
 */
export const calculateMushafInTemplateMetadata: CalculateMetadataFunction<MushafInTemplateProps> = async ({
  props,
  abortSignal,
  isRendering,
}) => {
  const mushaf = await resolveMushafRecitationSlot(props.mushaf, {fps: TEMPLATE_FPS, abortSignal, isRendering});
  return {
    props: {...props, mushaf: mushaf.props},
    durationInFrames: Math.max(
      1,
      framesOf(props.introSeconds) + mushaf.durationInFrames + framesOf(props.outroSeconds),
    ),
  };
};

/** The template: its own background, title card and outro, and the recitation in a box. */
export const MushafInTemplate: React.FC<MushafInTemplateProps> = ({
  title,
  subtitle,
  introSeconds,
  outro,
  outroSeconds,
  soundtrack,
  mushaf,
}) => {
  const frame = useCurrentFrame();
  const intro = framesOf(introSeconds);
  const recitation = slotDurationOf(mushaf);
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill
      data-template="MushafInTemplate"
      style={{background: 'linear-gradient(180deg, #0f2027 0%, #203a43 55%, #2c5364 100%)', color: '#f4efe6'}}
    >
      <div
        data-template-part="title"
        style={{
          position: 'absolute',
          top: 220,
          width: '100%',
          textAlign: 'center',
          fontFamily: 'Georgia, "Noto Serif", serif',
          opacity: titleOpacity,
        }}
      >
        <div style={{fontSize: 84}}>{title}</div>
        <div style={{fontSize: 40, opacity: 0.75, marginTop: 16}}>{subtitle}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          ...BOX,
          borderRadius: 36,
          background: 'rgba(255, 255, 255, 0.06)',
          border: '2px solid rgba(255, 255, 255, 0.22)',
        }}
      />
      {/* The template's own track, from the recitation's start: the slot's `hostAudio` follows it,
          so the recitation plays nothing itself and its words keep time with this. */}
      {soundtrack !== '' ? (
        <Sequence from={intro} name={TEMPLATE_AUDIO_NAME} layout="none">
          <Audio src={staticFile(soundtrack)} name={TEMPLATE_AUDIO_NAME} />
        </Sequence>
      ) : null}
      <MushafRecitationSlot
        props={mushaf}
        propsKey="mushaf"
        from={intro}
        {...BOX}
        premountFor={TEMPLATE_FPS}
        name="Recitation"
      />
      {outroSeconds > 0 ? (
        <Sequence from={intro + recitation} durationInFrames={framesOf(outroSeconds)} name="Outro">
          <AbsoluteFill
            data-template-part="outro"
            style={{
              top: 1440,
              height: 200,
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Georgia, "Noto Serif", serif',
              fontSize: 56,
            }}
          >
            {outro}
          </AbsoluteFill>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
