// Server-Sent Events, as the aligner's streaming routes write them: `event:` and `data:` fields,
// one event per block, blocks separated by a blank line, `: keepalive` comments in between. Pure
// functions over text, so the client feeds them whatever chunks the network delivers.

/** One event of the stream: its type (`'message'` when the stream names none) and its data lines joined by `\n`. */
export type SseEvent = {readonly event: string; readonly data: string};

/** What `parseSseChunk()` returns: the events the chunk completed, and the text to pass back with the next chunk. */
export type SseChunk = {readonly events: readonly SseEvent[]; readonly rest: string};

const toEvents = (block: string): SseEvent[] => {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  // As in the EventSource spec, a block without data (a lone comment, an `event:` alone) dispatches nothing.
  return data.length === 0 ? [] : [{event, data: data.join('\n')}];
};

/**
 * Parses the next chunk of an event stream. Pure: `rest` is the previous call's `rest` (`''` at the
 * start), so a chunk may end anywhere, in the middle of a line or of a CRLF.
 *
 * ```ts
 * parseSseChunk('', 'event: progress\ndata: {"st'); // {events: [], rest: 'event: progress\ndata: {"st'}
 * ```
 */
export const parseSseChunk = (rest: string, chunk: string): SseChunk => {
  const text = rest + chunk;
  // A trailing CR may be the first half of a CRLF that the next chunk completes.
  const held = text.endsWith('\r') ? '\r' : '';
  const blocks = (held ? text.slice(0, -1) : text).replace(/\r\n?/g, '\n').split('\n\n');
  const pending = blocks.pop() ?? '';
  return {events: blocks.flatMap(toEvents), rest: pending + held};
};

/** The last event of a stream that ended without the closing blank line (the spec drops it; the client is lenient). */
export const flushSse = (rest: string): readonly SseEvent[] =>
  rest.replace(/\r\n?/g, '\n').split('\n\n').flatMap(toEvents);
