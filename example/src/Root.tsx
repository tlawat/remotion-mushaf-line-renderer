import type * as React from 'react';
import {Composition} from 'remotion';
import {calculateLineHarnessMetadata, defaultLineHarnessProps, LineHarness} from './harness/LineHarness';
import {calculateRecitationMetadata, defaultRecitationProps, Recitation} from './Recitation';
import {calculateThreeLinesMetadata, defaultThreeLinesProps, ThreeLines} from './ThreeLines';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Three consecutive lines of one page: in 'replace' mode each line leaves as the next enters (one slot);
          in 'stack' mode they stack down the page. A different entrance/exit pair per line. */}
      <Composition
        id="ThreeLines"
        component={ThreeLines}
        calculateMetadata={calculateThreeLinesMetadata}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={180}
        defaultProps={defaultThreeLinesProps}
      />
      {/* A recited passage: the printed lines follow the audio from a timings JSON (see tools/align-recitation.py). */}
      <Composition
        id="Recitation"
        component={Recitation}
        calculateMetadata={calculateRecitationMetadata}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={30}
        defaultProps={defaultRecitationProps}
      />
      {/* Test harness used by the browser and render suites: explicit lines, one entrance for all. */}
      <Composition
        id="LineHarness"
        component={LineHarness}
        calculateMetadata={calculateLineHarnessMetadata}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={120}
        defaultProps={defaultLineHarnessProps}
      />
    </>
  );
};
