// The right column: the switch between the two compositions and the `<Player>`, fed the props the
// page resolved (it never runs `calculateMetadata()`).
import {Player} from '@remotion/player';
import {MushafAyahText, MushafRecitation} from '@tlawat/mushaf-studio';
import type * as React from 'react';
import type {WebComposition} from './project';
import type {ResolvedVideo} from './resolve';

export type PreviewProps = {
  readonly composition: WebComposition;
  readonly onComposition: (composition: WebComposition) => void;
  readonly video: ResolvedVideo | null;
  /** What the preview waits for, or `null`. */
  readonly waiting: string | null;
  readonly error: string | null;
};

const errorFallback = ({error}: {error: Error}): React.ReactNode => (
  <div className="player-message error" role="alert">
    {error.message}
  </div>
);

const CHOICES: readonly {readonly value: WebComposition; readonly label: string; readonly hint: string}[] = [
  {value: 'recitation', label: 'Mushaf lines', hint: 'The printed lines of the mushaf'},
  {value: 'ayah-text', label: 'Ayah text', hint: 'One ayah at a time, a 9:16 reel'},
];

export const Preview: React.FC<PreviewProps> = ({composition, onComposition, video, waiting, error}) => {
  const shown = video && video.composition === composition ? video : null;
  const aspect = shown
    ? `${shown.spec.width} / ${shown.spec.height}`
    : composition === 'recitation'
      ? '16 / 9'
      : '9 / 16';
  return (
    <section className="preview" aria-label="Preview">
      <fieldset className="switch">
        <legend className="visually-hidden">Composition</legend>
        {CHOICES.map((choice) => (
          <label key={choice.value} title={choice.hint}>
            <input
              type="radio"
              name="composition"
              value={choice.value}
              checked={composition === choice.value}
              onChange={() => onComposition(choice.value)}
            />
            <span>{choice.label}</span>
          </label>
        ))}
      </fieldset>
      <div className="player-frame" style={{aspectRatio: aspect}} data-composition={composition}>
        {shown?.composition === 'recitation' && (
          <Player
            key="recitation"
            component={MushafRecitation}
            inputProps={shown.props}
            durationInFrames={shown.spec.durationInFrames}
            compositionWidth={shown.spec.width}
            compositionHeight={shown.spec.height}
            fps={shown.spec.fps}
            controls
            acknowledgeRemotionLicense
            errorFallback={errorFallback}
            style={{width: '100%', height: '100%'}}
          />
        )}
        {shown?.composition === 'ayah-text' && (
          <Player
            key="ayah-text"
            component={MushafAyahText}
            inputProps={shown.props}
            durationInFrames={shown.spec.durationInFrames}
            compositionWidth={shown.spec.width}
            compositionHeight={shown.spec.height}
            fps={shown.spec.fps}
            controls
            acknowledgeRemotionLicense
            errorFallback={errorFallback}
            style={{width: '100%', height: '100%'}}
          />
        )}
        {!shown && (
          <div className={error ? 'player-message error' : 'player-message'} role={error ? 'alert' : 'status'}>
            {error ?? waiting ?? 'Preparing the preview…'}
          </div>
        )}
      </div>
      {shown && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
};
