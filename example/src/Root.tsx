import * as React from 'react';
import {Composition} from 'remotion';
import {LineHarness, calculateLineHarnessMetadata, defaultLineHarnessProps} from './harness/LineHarness';
import {ThreeLines, calculateThreeLinesMetadata} from './ThreeLines';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Three consecutive lines of one page, staggered, each with a different entrance. */}
      <Composition
        id="ThreeLines"
        component={ThreeLines}
        calculateMetadata={calculateThreeLinesMetadata}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={180}
        defaultProps={{
          mushaf: 'qpc-v4-tajweed',
          page: 10,
          lineNumbers: [3, 4, 5],
          lines: null,
          // Set to e.g. 'fonts/qpc-v4-tajweed/p10.woff2' (downloaded by `node scripts/fetch-qul.mjs --fonts 10`)
          // to serve the font from the public folder instead of QUL's CDN.
          fontFile: null,
        }}
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
