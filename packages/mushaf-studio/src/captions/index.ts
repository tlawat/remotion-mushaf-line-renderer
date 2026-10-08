// Captions interop: the word timings as Remotion `Caption[]` for the Studio's
// caption editor and back, and as SRT and WebVTT. Pure. The doc comments live on the implementations.
export {
  type Caption,
  type CaptionCue,
  fromCaptions,
  type ToCaptionsOptions,
  toCaptionCues,
  toCaptions,
} from './convert';
export {captionsToSrt} from './srt';
export {captionsToVtt, type VttAlign, type VttOptions} from './vtt';
