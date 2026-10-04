// Step 4's caption files: the played timings through the package's converters. Pure.
import {captionsToSrt, captionsToVtt, type StudioTimings, toCaptionCues, toCaptions} from '@tlawat/mushaf-studio';

/** A file the page offers for download. */
export type DownloadFile = {
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly text: string;
};

/**
 * The captions of the video: SRT word by word, WebVTT ayah by ayah (right-aligned, for the Arabic)
 * and Remotion's `Caption[]` as JSON. Times are the video's: the played timings start at frame 0.
 */
export const captionFiles = (timings: StudioTimings, stem: string): readonly DownloadFile[] => {
  const captions = toCaptions(timings);
  return [
    {label: 'SRT', name: `${stem}.srt`, type: 'application/x-subrip', text: captionsToSrt(captions)},
    {
      label: 'WebVTT',
      name: `${stem}.vtt`,
      type: 'text/vtt',
      text: captionsToVtt(toCaptionCues(timings), {lines: 'ayah', align: 'start'}),
    },
    {
      label: 'Captions JSON',
      name: `${stem}.captions.json`,
      type: 'application/json',
      text: `${JSON.stringify(captions, null, 1)}\n`,
    },
  ];
};
