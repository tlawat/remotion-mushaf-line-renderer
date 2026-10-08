// The lines module (workstream 4): pure functions over line data and timings. Splitting a printed
// line is pure data on top of the package's word-range slice (`{fromWordId, toWordId}`): the line
// appears twice in the passage, each half a timed slot of its own in `scheduleLines()`.
export {doubtfulWords} from './doubtful';
export {applySplits, splitLineAt, wordIdAt} from './split';
export {wordStarts} from './word-starts';
