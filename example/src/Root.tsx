import * as React from 'react';
import {Composition} from 'remotion';
import {LineHarness, calculateLineHarnessMetadata, defaultLineHarnessProps} from './harness/LineHarness';
import {Recitation, calculateRecitationMetadata, defaultRecitationProps} from './Recitation';
import {ThreeLines, calculateThreeLinesMetadata} from './ThreeLines';

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
        defaultProps={{
          mushaf: 'qpc-v4',
          // Plain black glyphs by default; `tajweed` switches to QUL's colour font, `mandala` to the
          // same font at palette 3 (CSS-coloured text, coloured ayah rosettes).
          tajweed: false,
          mandala: false,
          page: 10,
          lineNumbers: [3, 4, 5],
          lines: null,
          // Set to 'fonts/{mushaf}/p{page}.woff2' (mirrored by `bash scripts/pull-all-assets.sh`)
          // to serve the fonts from the public folder instead of QUL's CDN.
          fontFile: null,
          dataFiles: null,
          mode: 'replace',
        }}
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
