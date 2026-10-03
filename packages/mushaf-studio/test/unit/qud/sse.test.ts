import {describe, expect, it} from 'vitest';
import {flushSse, parseSseChunk, type SseEvent} from '../../../src/qud/sse';

// What the aligner's streaming routes write: progress, a keepalive comment, then the result.
const STREAM = [
  'event: progress\ndata: {"stage":"queued_cpu","step":1,"steps":6}\n\n',
  ': keepalive\n\n',
  'event: progress\ndata: {"stage":"segmenting","step":2,"steps":6}\n\n',
  'event: result\ndata: {"audio_id":"18dc30e0546544699e75a6c3afe69b05","segments":[]}\n\n',
].join('');

const EXPECTED: SseEvent[] = [
  {event: 'progress', data: '{"stage":"queued_cpu","step":1,"steps":6}'},
  {event: 'progress', data: '{"stage":"segmenting","step":2,"steps":6}'},
  {event: 'result', data: '{"audio_id":"18dc30e0546544699e75a6c3afe69b05","segments":[]}'},
];

/** Feeds the chunks one after the other, as the client does, and collects every event. */
const parseAll = (chunks: readonly string[]): {events: SseEvent[]; rest: string} => {
  const events: SseEvent[] = [];
  let rest = '';
  for (const chunk of chunks) {
    const parsed = parseSseChunk(rest, chunk);
    events.push(...parsed.events);
    rest = parsed.rest;
  }
  return {events, rest};
};

describe('parseSseChunk', () => {
  it('returns nothing for empty input', () => {
    expect(parseSseChunk('', '')).toEqual({events: [], rest: ''});
  });

  it('parses a whole stream in one chunk, skipping comments', () => {
    expect(parseSseChunk('', STREAM)).toEqual({events: EXPECTED, rest: ''});
  });

  it('keeps an unfinished event as rest until its blank line arrives', () => {
    const first = parseSseChunk('', 'event: result\ndata: {"audio');
    expect(first).toEqual({events: [], rest: 'event: result\ndata: {"audio'});
    expect(parseSseChunk(first.rest, '_id":"x"}\n\n')).toEqual({
      events: [{event: 'result', data: '{"audio_id":"x"}'}],
      rest: '',
    });
  });

  it('gives the same events wherever the stream is cut in two, mid-line included', () => {
    for (let at = 0; at <= STREAM.length; at++) {
      expect(parseAll([STREAM.slice(0, at), STREAM.slice(at)])).toEqual({events: EXPECTED, rest: ''});
    }
  });

  it('gives the same events fed one character at a time', () => {
    expect(parseAll([...STREAM])).toEqual({events: EXPECTED, rest: ''});
  });

  it('reads CRLF and CR line endings, a CRLF cut between its two characters included', () => {
    const crlf = STREAM.replace(/\n/g, '\r\n');
    for (let at = 0; at <= crlf.length; at++) {
      expect(parseAll([crlf.slice(0, at), crlf.slice(at)]).events).toEqual(EXPECTED);
    }
    // A final CR may still turn out to be half a CRLF: the last event waits for the flush.
    const cr = parseAll([STREAM.replace(/\n/g, '\r')]);
    expect(cr.events).toEqual(EXPECTED.slice(0, 2));
    expect(flushSse(cr.rest)).toEqual(EXPECTED.slice(2));
    expect(parseAll(['data: a\r', '\n', '\r\n']).events).toEqual([{event: 'message', data: 'a'}]);
  });

  it('follows the field rules: default type, joined data lines, one optional space, no-data blocks dropped', () => {
    const text = [
      'data: plain\n\n',
      'event: progress\ndata: line one\ndata:line two\n\n',
      'data:  two spaces\n\n',
      'event: lonely\n\n',
      'id: 7\nretry: 1000\ndata\n\n',
      '\n\n\n',
    ].join('');
    expect(parseSseChunk('', text).events).toEqual([
      {event: 'message', data: 'plain'},
      {event: 'progress', data: 'line one\nline two'},
      {event: 'message', data: ' two spaces'},
      {event: 'message', data: ''},
    ]);
  });
});

describe('flushSse', () => {
  it('returns the last event of a stream that ended without its blank line', () => {
    expect(flushSse('event: result\ndata: {}\n')).toEqual([{event: 'result', data: '{}'}]);
    expect(flushSse('event: result\r\ndata: {}')).toEqual([{event: 'result', data: '{}'}]);
  });

  it('returns nothing for an empty or comment-only rest', () => {
    expect(flushSse('')).toEqual([]);
    expect(flushSse(': keepalive\n')).toEqual([]);
  });
});
