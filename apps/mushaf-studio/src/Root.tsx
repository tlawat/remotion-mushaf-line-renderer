// The fonts packages: importing them is what puts their files in the bundle (as assets); nothing is
// downloaded unless a line needs a page from them.
import plainFonts from '@tlawat/mushaf-fonts-qpc-v4';
import tajweedFonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed';
import {
  calculateMushafPassageMetadata,
  calculateMushafRecitationMetadata,
  MushafPassage,
  MushafRecitation,
  mushafPassageSchema,
  mushafRecitationSchema,
  registerMushafFonts,
} from '@tlawat/mushaf-studio';
import type * as React from 'react';
import {Composition} from 'remotion';

// The compositions fall back to these when QUL's CDN fails (`fonts: 'fallback'`) or use them alone
// (`fonts: 'package'`). Registered once, here, so the studio package never imports them itself.
registerMushafFonts({plain: plainFonts, tajweed: tajweedFonts});

/**
 * The defaultProps below are written out in full, as literals, on purpose: the Studio's Props
 * sidebar and the Mushaf panel save edits back into this file (`saveDefaultProps()`), which they
 * can only do for an inline object. They start as the package's `defaultMushafRecitationProps` and
 * `defaultMushafPassageProps`; width, height and duration are replaced by `calculateMetadata`.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* A recited passage: the printed lines follow the audio, word by word. The panel (Studio only)
          picks the recitation, aligns it, and writes its files under public/mushaf-studio/. */}
      <Composition
        id="MushafRecitation"
        component={MushafRecitation}
        schema={mushafRecitationSchema}
        calculateMetadata={calculateMushafRecitationMetadata}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={{
          audioFile:
            'https://hetchyy-quranic-universal-aligner.hf.space/preload-audio/abdul_hamid_ghraio_2025_yt/1.mp3?start_ms=2909&end_ms=30695',
          timingsFile: 'mushaf-studio/fatiha/timings.json',
          fromAyah: 0,
          toAyah: 0,
          slice: true,
          splits: [],
          theme: 'plain',
          customTheme: {
            base: 'normal',
            ink: '#1b1b1b',
            silent: '#8a8a8a',
            rules: '#1b6f3f',
            frame: '#1b1b1b',
            accent: '#c8a45c',
            detail: '#c8a45c',
            background: 'transparent',
            override: {
              ink: false,
              silent: false,
              rules: false,
              frame: false,
              accent: true,
              detail: true,
              background: false,
            },
          },
          fonts: 'fallback',
          data: 'mirror',
          layout: {
            aspect: '16:9',
            visibleLines: 3,
            neighbourOpacity: 0.45,
            marginX: 120,
            background: '#fbf7ee',
            color: '#1b1b1b',
            backgroundImage: '',
            verticalAlign: 0.5,
          },
          animation: {
            enter: 'slide-fade',
            exit: 'slide-fade',
            leadInSeconds: 0.4,
            scroll: 'ease',
          },
          highlight: {
            mode: 'word',
            style: 'color',
            color: '#c8a45c',
            dimOthers: 1,
            dimUpcomingOnly: false,
            occurrence: 'first',
          },
          text: {
            translationFile: '',
            translationPosition: 'below',
            translationFont: 'Georgia, "Noto Serif", serif',
            translationSize: 40,
            translationColor: '#4a4a4a',
            translationDirection: 'ltr',
            glossFile: '',
            transliterationFile: '',
            glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
            glossSize: 34,
            glossColor: '#6a6a6a',
          },
          review: {
            showDoubtful: true,
            confidenceThreshold: 0.8,
            doubtColor: '#d94848',
          },
          resolved: null,
        }}
      />
      {/* A passage without audio: each printed line holds for a few seconds, then gives way to the next. */}
      <Composition
        id="MushafPassage"
        component={MushafPassage}
        schema={mushafPassageSchema}
        calculateMetadata={calculateMushafPassageMetadata}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={{
          surah: 9,
          fromAyah: 1,
          toAyah: 5,
          slice: true,
          holdSeconds: 4,
          theme: 'normal',
          customTheme: {
            base: 'normal',
            ink: '#1b1b1b',
            silent: '#8a8a8a',
            rules: '#1b6f3f',
            frame: '#1b1b1b',
            accent: '#c8a45c',
            detail: '#c8a45c',
            background: 'transparent',
            override: {
              ink: false,
              silent: false,
              rules: false,
              frame: false,
              accent: true,
              detail: true,
              background: false,
            },
          },
          fonts: 'fallback',
          data: 'mirror',
          layout: {
            aspect: '16:9',
            visibleLines: 3,
            neighbourOpacity: 0.45,
            marginX: 120,
            background: '#fbf7ee',
            color: '#1b1b1b',
            backgroundImage: '',
            verticalAlign: 0.5,
          },
          animation: {
            enter: 'slide-fade',
            exit: 'slide-fade',
            leadInSeconds: 0.4,
            scroll: 'ease',
          },
          text: {
            translationFile: '',
            translationPosition: 'below',
            translationFont: 'Georgia, "Noto Serif", serif',
            translationSize: 40,
            translationColor: '#4a4a4a',
            translationDirection: 'ltr',
            glossFile: '',
            transliterationFile: '',
            glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
            glossSize: 34,
            glossColor: '#6a6a6a',
          },
          resolved: null,
        }}
      />
    </>
  );
};
