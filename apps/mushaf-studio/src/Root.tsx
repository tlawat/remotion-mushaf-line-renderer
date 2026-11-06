// The fonts packages: importing them is what puts their files in the bundle (as assets); nothing is
// downloaded unless a line needs a page from them.
import plainFonts from '@tlawat/mushaf-fonts-qpc-v4';
import tajweedFonts from '@tlawat/mushaf-fonts-qpc-v4-tajweed';
import {
  calculateMushafAyahTextMetadata,
  calculateMushafPageMetadata,
  calculateMushafPassageMetadata,
  calculateMushafRecitationMetadata,
  calculateMushafThumbnailMetadata,
  MushafAyahText,
  MushafPage,
  MushafPassage,
  MushafRecitation,
  MushafThumbnail,
  mushafAyahTextSchema,
  mushafPageSchema,
  mushafPassageSchema,
  mushafRecitationSchema,
  mushafThumbnailSchema,
  registerMushafFonts,
} from '@tlawat/mushaf-studio';
import type * as React from 'react';
import {Composition, Still} from 'remotion';
import {
  calculateMushafInTemplateMetadata,
  MushafInTemplate,
  mushafInTemplateSchema,
  TEMPLATE_FPS,
} from './MushafInTemplate';

// The compositions fall back to these when QUL's CDN fails (`fonts: 'fallback'`) or use them alone
// (`fonts: 'package'`). Registered once, here, so the studio package never imports them itself.
registerMushafFonts({plain: plainFonts, tajweed: tajweedFonts});

/**
 * The defaultProps below are written out in full, as literals, on purpose: the Studio's Props
 * sidebar and the Mushaf panel save edits back into this file (`saveDefaultProps()`), which they
 * can only do for an inline object. They start as the package's `defaultMushafRecitationProps`,
 * `defaultMushafAyahTextProps`, `defaultMushafPageProps`, `defaultMushafPassageProps` and
 * `defaultMushafThumbnailProps` (the template's `mushaf` as `defaultMushafRecitationSlotProps`, in
 * light ink); width, height and duration are replaced by `calculateMetadata`. A template's slot
 * can also start as `mushaf: null`, but never as an identifier or a spread: the Studio could not
 * save into it.
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
          audioFile: 'mushaf-studio/fatiha/audio.mp3',
          timingsFile: 'mushaf-studio/fatiha/timings.json',
          fromAyah: 0,
          toAyah: 0,
          slice: true,
          splits: [],
          header: 'none',
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
            offsetY: 0,
          },
          background: {
            kind: 'color',
            color: '#fbf7ee',
            src: '',
            fit: 'cover',
            videoSeconds: 0,
            blur: 0,
            dim: 0,
            kenBurns: 'none',
            kenBurnsScale: 1.1,
            gradient: {
              from: '#0f2027',
              to: '#2c5364',
              angle: 180,
            },
            glow: {
              enabled: false,
              color: '#c8a45c',
              strength: 0.5,
            },
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
          memorize: {
            mode: 'off',
            repeat: 3,
            pauseSeconds: 0.5,
            revealAfterRepeats: 1,
          },
          text: {
            translationFile: '',
            translationPosition: 'below',
            translationFont: 'Georgia, "Noto Serif", serif',
            translationSize: 40,
            translationColor: '#4a4a4a',
            translationDirection: 'ltr',
            translationOffsetY: 0,
            glossFile: '',
            transliterationFile: '',
            glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
            glossSize: 34,
            glossColor: '#6a6a6a',
            translations: [],
            glossPosition: 'strip',
          },
          overlay: {
            title: 'none',
            introSeconds: 3,
            reciter: '',
            color: '#1b1b1b',
            font: 'Georgia, "Noto Serif", serif',
            corner: 'top-right',
            cornerSize: 28,
          },
          legend: {
            show: false,
            position: 'bottom-left',
            orientation: 'column',
            names: 'both',
          },
          endCard: {
            show: 'none',
            seconds: 5,
            tafsirFile: '',
            chapterInfoFile: '',
          },
          audio: {
            normalize: true,
            targetLufs: -14,
            fadeInSeconds: 0.3,
            fadeOutSeconds: 1,
            trimSilence: false,
            volume: 1,
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
          header: 'none',
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
            offsetY: 0,
          },
          background: {
            kind: 'color',
            color: '#fbf7ee',
            src: '',
            fit: 'cover',
            videoSeconds: 0,
            blur: 0,
            dim: 0,
            kenBurns: 'none',
            kenBurnsScale: 1.1,
            gradient: {
              from: '#0f2027',
              to: '#2c5364',
              angle: 180,
            },
            glow: {
              enabled: false,
              color: '#c8a45c',
              strength: 0.5,
            },
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
            translationOffsetY: 0,
            glossFile: '',
            transliterationFile: '',
            glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
            glossSize: 34,
            glossColor: '#6a6a6a',
            translations: [],
          },
          overlay: {
            title: 'none',
            introSeconds: 3,
            reciter: '',
            color: '#1b1b1b',
            font: 'Georgia, "Noto Serif", serif',
            corner: 'top-right',
            cornerSize: 28,
          },
          resolved: null,
        }}
      />
      {/* One ayah at a time as Unicode text in QUL's Uthmani Hafs font: the framing of reels and short clips.
          Same timings and highlighting as MushafRecitation; the text comes from the panel's Text tab. */}
      <Composition
        id="MushafAyahText"
        component={MushafAyahText}
        schema={mushafAyahTextSchema}
        calculateMetadata={calculateMushafAyahTextMetadata}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300}
        defaultProps={{
          audioFile: 'mushaf-studio/fatiha/audio.mp3',
          timingsFile: 'mushaf-studio/fatiha/timings.json',
          fromAyah: 0,
          toAyah: 0,
          textFile: 'mushaf-studio/fatiha/text-uthmani.json',
          font: 'uthmani-hafs',
          fontSize: 96,
          lineHeight: 1.9,
          layout: {
            aspect: '9:16',
            visibleLines: 3,
            neighbourOpacity: 0.45,
            marginX: 120,
            background: '#101418',
            color: '#f4efe6',
            backgroundImage: '',
            verticalAlign: 0.5,
            offsetY: 0,
          },
          background: {
            kind: 'color',
            color: '#101418',
            src: '',
            fit: 'cover',
            videoSeconds: 0,
            blur: 0,
            dim: 0,
            kenBurns: 'none',
            kenBurnsScale: 1.1,
            gradient: {
              from: '#0f2027',
              to: '#2c5364',
              angle: 180,
            },
            glow: {
              enabled: false,
              color: '#c8a45c',
              strength: 0.5,
            },
          },
          animation: {
            enter: 'slide-fade',
            exit: 'slide-fade',
            leadInSeconds: 0.4,
          },
          highlight: {
            mode: 'word',
            style: 'color',
            color: '#c8a45c',
            dimOthers: 1,
            dimUpcomingOnly: false,
            occurrence: 'first',
          },
          memorize: {
            mode: 'off',
            repeat: 3,
            pauseSeconds: 0.5,
            revealAfterRepeats: 1,
          },
          text: {
            translationFile: '',
            translationPosition: 'below',
            translationFont: 'Georgia, "Noto Serif", serif',
            translationSize: 40,
            translationColor: '#c9c1b2',
            translationDirection: 'ltr',
            translationOffsetY: 0,
            glossFile: '',
            transliterationFile: '',
            glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
            glossSize: 34,
            glossColor: '#6a6a6a',
            translations: [],
          },
          overlay: {
            title: 'none',
            introSeconds: 3,
            reciter: '',
            color: '#f4efe6',
            font: 'Georgia, "Noto Serif", serif',
            corner: 'top-right',
            cornerSize: 28,
          },
          endCard: {
            show: 'none',
            seconds: 5,
            tafsirFile: '',
            chapterInfoFile: '',
          },
          audio: {
            normalize: true,
            targetLufs: -14,
            fadeInSeconds: 0.3,
            fadeOutSeconds: 1,
            trimSilence: false,
            volume: 1,
          },
          resolved: null,
        }}
      />
      {/* The whole printed page the recitation is on, its current line marked, turning to the next page
          just before its first word. The same recitation as MushafRecitation; the panel docks here too. */}
      <Composition
        id="MushafPage"
        component={MushafPage}
        schema={mushafPageSchema}
        calculateMetadata={calculateMushafPageMetadata}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={300}
        defaultProps={{
          audioFile: 'mushaf-studio/fatiha/audio.mp3',
          timingsFile: 'mushaf-studio/fatiha/timings.json',
          fromAyah: 0,
          toAyah: 0,
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
            offsetY: 0,
          },
          background: {
            kind: 'color',
            color: '#fbf7ee',
            src: '',
            fit: 'cover',
            videoSeconds: 0,
            blur: 0,
            dim: 0,
            kenBurns: 'none',
            kenBurnsScale: 1.1,
            gradient: {
              from: '#0f2027',
              to: '#2c5364',
              angle: 180,
            },
            glow: {
              enabled: false,
              color: '#c8a45c',
              strength: 0.5,
            },
          },
          highlight: {
            mode: 'word',
            style: 'color',
            color: '#c8a45c',
            dimOthers: 1,
            dimUpcomingOnly: false,
            occurrence: 'first',
          },
          review: {
            showDoubtful: true,
            confidenceThreshold: 0.8,
            doubtColor: '#d94848',
          },
          pageView: {
            lineHighlight: 'band',
            lineHighlightColor: 'rgba(200,164,92,0.18)',
            dimOtherLines: 1,
            frame: 'simple',
            pageNumber: true,
            turn: 'slide',
            turnSeconds: 0.6,
          },
          text: {
            translationFile: '',
            translationPosition: 'auto',
            translationFont: 'Georgia, "Noto Serif", serif',
            translationSize: 40,
            translationColor: '#4a4a4a',
            translationDirection: 'ltr',
            translationOffsetY: 0,
            glossFile: '',
            transliterationFile: '',
            glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
            glossSize: 34,
            glossColor: '#6a6a6a',
            translations: [],
          },
          legend: {
            show: false,
            position: 'bottom-left',
            orientation: 'column',
            names: 'both',
          },
          endCard: {
            show: 'none',
            seconds: 5,
            tafsirFile: '',
            chapterInfoFile: '',
          },
          audio: {
            normalize: true,
            targetLufs: -14,
            fadeInSeconds: 0.3,
            fadeOutSeconds: 1,
            trimSilence: false,
            volume: 1,
          },
          resolved: null,
        }}
      />
      {/* A template of your own with the recitation dropped in (see MushafInTemplate.tsx): its title, intro
          and outro are its own props, the recitation's are under `mushaf` (null until one is picked).
          The panel saves there only, and stays docked on the intro and the outro too. */}
      <Composition
        id="MushafInTemplate"
        component={MushafInTemplate}
        schema={mushafInTemplateSchema}
        calculateMetadata={calculateMushafInTemplateMetadata}
        width={1080}
        height={1920}
        fps={TEMPLATE_FPS}
        durationInFrames={300}
        defaultProps={{
          title: 'Al-Fatihah',
          subtitle: 'The Opening',
          introSeconds: 2,
          outro: 'Subscribe for more',
          outroSeconds: 2,
          mushaf: {
            audioFile: 'mushaf-studio/fatiha/audio.mp3',
            timingsFile: 'mushaf-studio/fatiha/timings.json',
            fromAyah: 0,
            toAyah: 0,
            slice: true,
            splits: [],
            header: 'none',
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
              marginX: 40,
              background: 'transparent',
              color: '#f4efe6',
              backgroundImage: '',
              verticalAlign: 0.5,
              offsetY: 0,
            },
            background: {
              kind: 'color',
              color: 'transparent',
              src: '',
              fit: 'cover',
              videoSeconds: 0,
              blur: 0,
              dim: 0,
              kenBurns: 'none',
              kenBurnsScale: 1.1,
              gradient: {
                from: '#0f2027',
                to: '#2c5364',
                angle: 180,
              },
              glow: {
                enabled: false,
                color: '#c8a45c',
                strength: 0.5,
              },
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
              color: '#f2c14e',
              dimOthers: 1,
              dimUpcomingOnly: false,
              occurrence: 'first',
            },
            memorize: {
              mode: 'off',
              repeat: 3,
              pauseSeconds: 0.5,
              revealAfterRepeats: 1,
            },
            text: {
              translationFile: '',
              translationPosition: 'below',
              translationFont: 'Georgia, "Noto Serif", serif',
              translationSize: 40,
              translationColor: '#d9d4c7',
              translationDirection: 'ltr',
              translationOffsetY: 0,
              glossFile: '',
              transliterationFile: '',
              glossFont: '"Noto Sans", "Helvetica Neue", Arial, sans-serif',
              glossSize: 34,
              glossColor: '#6a6a6a',
              translations: [],
              glossPosition: 'strip',
            },
            overlay: {
              title: 'none',
              introSeconds: 3,
              reciter: '',
              color: '#1b1b1b',
              font: 'Georgia, "Noto Serif", serif',
              corner: 'top-right',
              cornerSize: 28,
            },
            legend: {
              show: false,
              position: 'bottom-left',
              orientation: 'column',
              names: 'both',
            },
            endCard: {
              show: 'none',
              seconds: 5,
              tafsirFile: '',
              chapterInfoFile: '',
            },
            audio: {
              normalize: true,
              targetLufs: -14,
              fadeInSeconds: 0.3,
              fadeOutSeconds: 1,
              trimSilence: false,
              volume: 1,
            },
            review: {
              showDoubtful: true,
              confidenceThreshold: 0.8,
              doubtColor: '#d94848',
            },
            resolved: null,
          },
        }}
      />
      {/* The video's thumbnail, a still: the surah's framed name, its opening line, a title and a subtitle. */}
      <Still
        id="MushafThumbnail"
        component={MushafThumbnail}
        schema={mushafThumbnailSchema}
        calculateMetadata={calculateMushafThumbnailMetadata}
        width={1280}
        height={720}
        defaultProps={{
          surah: 1,
          fromAyah: 1,
          toAyah: 7,
          title: '',
          subtitle: '',
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
          background: '#fbf7ee',
          backgroundImage: '',
          color: '#1b1b1b',
          font: 'Georgia, "Noto Serif", serif',
          titleSize: 56,
          subtitleSize: 34,
          marginX: 80,
          resolved: null,
        }}
      />
    </>
  );
};
