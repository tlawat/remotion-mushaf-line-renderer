// A recording turned into a WAV file in the browser: what the Mushaf panel sends to the aligner for
// the audio of a template's video track (the aligner takes audio files). Decoded by Web Audio at
// 16 kHz, mixed down to mono and written as 16-bit PCM, about 1.9 MB a minute.
import {describeValue, MushafStudioError} from '../errors';
import {mixDown} from './loudness';

/** The rate the panel decodes a video's audio at for the aligner: speech needs no more. */
export const WAV_SAMPLE_RATE = 16_000;

const writeAscii = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
};

/**
 * `samples` (mono, -1 to 1) as a RIFF/WAVE file of 16-bit PCM at `sampleRate`: a 44-byte header,
 * then two bytes per sample, little-endian, clipped to the range. `encodeWav(new Float32Array(0), 16000)`
 * is the bare header.
 */
export const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      `Cannot write a WAV file at sample rate ${describeValue(sampleRate)}: give a whole number of samples per second, such as 16000.`,
      {sampleRate},
    );
  }
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // the fmt chunk's size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, 'data');
  view.setUint32(40, bytes, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), true);
  }
  return buffer;
};

/** What `audioToWav()` decodes with: the bytes to one array per channel at `sampleRate`. */
export type AudioDecoder = (
  bytes: ArrayBuffer,
  sampleRate: number,
) => Promise<{readonly channels: readonly Float32Array[]; readonly sampleRate: number}>;

/** Web Audio's decoder: `OfflineAudioContext.decodeAudioData()`, which resamples to the context's rate. */
const webAudioDecoder: AudioDecoder = async (bytes, sampleRate) => {
  if (typeof OfflineAudioContext === 'undefined') {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      'Cannot decode the audio of the video here: there is no Web Audio. Align it in the Studio, in a browser.',
    );
  }
  const buffer = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return {channels, sampleRate: buffer.sampleRate};
};

/**
 * A recording (an audio or video file's bytes) as a mono 16-bit WAV at `WAV_SAMPLE_RATE`: decoded
 * by `decode` (Web Audio by default), mixed down (`mixDown()`), encoded (`encodeWav()`). A file the
 * browser cannot decode, or one without sound, is `AUDIO_ANALYSIS_FAILED`, naming `name`.
 */
export const audioToWav = async (blob: Blob, name: string, decode: AudioDecoder = webAudioDecoder): Promise<Blob> => {
  let decoded: Awaited<ReturnType<AudioDecoder>>;
  try {
    decoded = await decode(await blob.arrayBuffer(), WAV_SAMPLE_RATE);
  } catch (error) {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      `The audio of ${describeValue(name)} could not be decoded in the browser (${error instanceof Error ? error.message : String(error)}): use a video with an AAC, Opus or MP3 sound track, or extract its audio into public/ and upload that.`,
      {name},
    );
  }
  if (decoded.channels.length === 0 || (decoded.channels[0]?.length ?? 0) === 0) {
    throw new MushafStudioError(
      'AUDIO_ANALYSIS_FAILED',
      `${describeValue(name)} has no sound to align: pick a track with audio.`,
      {name},
    );
  }
  return new Blob([encodeWav(mixDown([...decoded.channels]), decoded.sampleRate)], {type: 'audio/wav'});
};
