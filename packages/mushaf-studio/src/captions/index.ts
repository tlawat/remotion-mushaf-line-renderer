// Captions interop (roadmap item 3): the word timings as Remotion `Caption[]` for the Studio's
// caption editor and back, and as SRT. Pure. The doc comments live on the implementations.
export {type Caption, fromCaptions, type ToCaptionsOptions, toCaptions} from './convert';
export {captionsToSrt} from './srt';
