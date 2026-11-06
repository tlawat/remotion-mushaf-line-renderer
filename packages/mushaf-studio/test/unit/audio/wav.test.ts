// The WAV file the panel sends the aligner for a video's sound: the header byte by byte, the
// samples as 16-bit PCM (clipped), the mixdown, and the errors a file without sound gives.
import {describe, expect, it, vi} from 'vitest';
import {type AudioDecoder, audioToWav, encodeWav, WAV_SAMPLE_RATE} from '../../../src/audio';

const ascii = (view: DataView, at: number, length: number): string =>
  String.fromCharCode(...Array.from({length}, (_, i) => view.getUint8(at + i)));

describe('encodeWav()', () => {
  it('writes a mono 16-bit PCM RIFF header for the rate given', () => {
    const view = new DataView(encodeWav(new Float32Array(3), 16_000));
    expect(view.byteLength).toBe(44 + 6);
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('is the bare header for no samples', () => {
    const view = new DataView(encodeWav(new Float32Array(0), 8000));
    expect(view.byteLength).toBe(44);
    expect(view.getUint32(40, true)).toBe(0);
  });

  it('writes each sample little-endian, full scale at ±1, clipped beyond', () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -3]), 16_000));
    const samples = Array.from({length: 6}, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 32767, -32768, 16384, 32767, -32768]);
  });

  it('refuses a rate that is not a whole positive number, naming it', () => {
    expect(() => encodeWav(new Float32Array(1), 0)).toThrow(/sample rate 0: give a whole number/);
    expect(() => encodeWav(new Float32Array(1), 44_100.5)).toThrow(
      expect.objectContaining({code: 'AUDIO_ANALYSIS_FAILED'}),
    );
  });
});

describe('audioToWav()', () => {
  it('decodes at 16 kHz, mixes the channels down and encodes them', async () => {
    const decode = vi.fn<AudioDecoder>(async () => ({
      channels: [new Float32Array([1, 0.5]), new Float32Array([0, -0.5])],
      sampleRate: WAV_SAMPLE_RATE,
    }));
    const wav = await audioToWav(new Blob([new Uint8Array([1, 2])]), 'clip.mp4', decode);
    expect(decode).toHaveBeenCalledWith(expect.any(ArrayBuffer), 16_000);
    expect(wav.type).toBe('audio/wav');
    const view = new DataView(await wav.arrayBuffer());
    expect(view.getUint32(24, true)).toBe(16_000);
    expect([view.getInt16(44, true), view.getInt16(46, true)]).toEqual([16384, 0]);
  });

  it('names the file the browser could not decode, or that has no sound', async () => {
    const broken: AudioDecoder = async () => {
      throw new Error('EncodingError');
    };
    await expect(audioToWav(new Blob([]), 'clip.mov', broken)).rejects.toThrow(
      /The audio of "clip\.mov" could not be decoded in the browser \(EncodingError\)/,
    );
    const silent: AudioDecoder = async () => ({channels: [new Float32Array(0)], sampleRate: 16_000});
    await expect(audioToWav(new Blob([]), 'clip.mp4', silent)).rejects.toMatchObject({
      code: 'AUDIO_ANALYSIS_FAILED',
      message: '"clip.mp4" has no sound to align: pick a track with audio.',
    });
  });
});
