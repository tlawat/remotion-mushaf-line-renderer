import type * as React from 'react';
import {useMemo, useState} from 'react';
import {captionsToSrt, toCaptions} from '../../captions';
import {DEFAULT_CONFIDENCE_THRESHOLD, realignSession, sessionTimestamps, splitSession, timingsFromQud} from '../../qud';
import type {AlignmentEdit, AlignmentSegment, StudioTimings} from '../../types';
import {nudgeWords, roundMs, withEdit} from '../edit-timings';
import {getHfToken, runStudioTask, type StudioSession, setStudioState, useStudioState} from '../store';
import {
  isUrl,
  patchProps,
  projectPath,
  readTimingsFile,
  reevaluate,
  seekTo,
  slugify,
  stemOf,
  writeFile,
  writeJsonFile,
} from '../studio-api';
import {colors, confidenceColor, styles} from '../styles';
import {audioOffsetOf, hasLines, isAyahTextProps, resolvedOf, type TabProps} from '../tab-props';
import {Button, Disclosure, Note, NumberInput, ProgressBar, range, Section} from '../ui';

/** A timed word as the editor shows it: `key` is `id#occurrence`, the handle `nudgeWord()` takes. */
type EditableWord = {
  readonly key: string;
  readonly id: string;
  readonly occurrence: number;
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

type Span = {readonly start: number; readonly end: number};

const keyOf = (id: string, occurrence: number): string => `${id}#${occurrence}`;

const parseKey = (key: string): {id: string; occurrence: number} => {
  const hash = key.lastIndexOf('#');
  return {id: key.slice(0, hash), occurrence: Number(key.slice(hash + 1))};
};

const TimeControl: React.FC<{
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
}> = ({label, value, onChange}) => (
  <span style={{...styles.row, gap: 2}}>
    <Button variant="ghost" title={`${label} -50 ms`} onClick={() => onChange(Math.max(0, roundMs(value - 0.05)))}>
      -
    </Button>
    <NumberInput label={label} value={value} min={0} step={0.01} width={62} onChange={(v) => onChange(roundMs(v))} />
    <Button variant="ghost" title={`${label} +50 ms`} onClick={() => onChange(roundMs(value + 0.05))}>
      +
    </Button>
  </span>
);

const WordList: React.FC<{
  readonly words: readonly EditableWord[];
  readonly pending: ReadonlyMap<string, Span>;
  readonly onChange: (key: string, span: Span) => void;
}> = ({words, pending, onChange}) => (
  // biome-ignore lint/a11y/noStaticElementInteractions: the editor swallows clicks so the row behind it does not seek
  <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
    {words.map((word) => {
      const span = pending.get(word.key) ?? word;
      const changed = pending.has(word.key);
      return (
        <div key={word.key} style={{...styles.row, padding: '3px 0', borderTop: `1px solid ${colors.border}`}}>
          <span style={{...styles.rtl, flex: '1 1 60px', color: changed ? colors.accent : colors.text}}>
            {word.text}
          </span>
          <span style={{...styles.code, color: colors.muted}}>{word.id}</span>
          <TimeControl
            label={`${word.id} start`}
            value={span.start}
            onChange={(start) => onChange(word.key, {...span, start})}
          />
          <TimeControl
            label={`${word.id} end`}
            value={span.end}
            onChange={(end) => onChange(word.key, {...span, end})}
          />
        </div>
      );
    })}
  </div>
);

const Flag: React.FC<{readonly color: string; readonly children: React.ReactNode}> = ({color, children}) => (
  <span style={styles.flag(color)}>{children}</span>
);

/** Review: the aligner's segments with their confidence, the words with their times, split and re-align. */
export const ReviewTab: React.FC<TabProps> = ({compositionId, props, project, fps}) => {
  const {session, busy} = useStudioState();
  const resolved = resolvedOf(props);
  const timings = resolved?.timings ?? null;
  const alignment = timings?.alignment ?? null;
  // An ayah text has no `review` props: it marks no doubtful word, and the list uses the default threshold.
  const threshold = isAyahTextProps(props) ? DEFAULT_CONFIDENCE_THRESHOLD : props.review.confidenceThreshold;
  const [markers, setMarkers] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<ReadonlyMap<string, Span>>(() => new Map());
  const [splitOpen, setSplitOpen] = useState(false);
  const [split, setSplit] = useState({maxVerses: 1, maxWords: 0, maxDuration: 30, stopSigns: false});
  const [realignOpen, setRealignOpen] = useState(false);
  /** The user's boundaries; `null` means "as the segments are", so a new alignment shows its own. */
  const [boundaries, setBoundaries] = useState<readonly Span[] | null>(null);

  // The sidecar's words by segment, each with its occurrence index among the words of the same id.
  const wordsBySegment = useMemo(() => {
    const map = new Map<number, EditableWord[]>();
    const seen = new Map<string, number>();
    for (const word of alignment?.words ?? []) {
      const occurrence = seen.get(word.id) ?? 0;
      seen.set(word.id, occurrence + 1);
      const list = map.get(word.segment) ?? [];
      list.push({
        key: keyOf(word.id, occurrence),
        id: word.id,
        occurrence,
        text: word.text,
        start: word.start,
        end: word.end,
      });
      map.set(word.segment, list);
    }
    return map;
  }, [alignment]);
  const textOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const word of alignment?.words ?? []) if (!map.has(word.id)) map.set(word.id, word.text);
    return map;
  }, [alignment]);

  if (!timings) {
    return <Note>Nothing to review yet: pick a recitation in Source or align a recording in Align.</Note>;
  }

  const working = busy !== null;
  const segments: readonly AlignmentSegment[] = alignment?.segments ?? [];
  const low = segments.filter((s) => s.confidence < threshold).length;
  const missing = segments.filter((s) => s.hasMissingWords).length;
  const errors = segments.filter((s) => s.error).length;
  const repeats = segments.filter((s) => s.hasRepeatedWords).length;
  const incomplete = timings.ayat.filter((a) => a.complete === false).length;
  const wordCount = alignment ? alignment.words.length : timings.ayat.reduce((n, a) => n + (a.words?.length ?? 0), 0);
  const segmentBoundaries: readonly Span[] = segments.map((s) => ({start: s.timeFrom, end: s.timeTo}));
  const shownBoundaries = boundaries ?? segmentBoundaries;
  const sessionMatches: StudioSession | null =
    session !== null && alignment?.audioId !== undefined && alignment.audioId === session.audioId ? session : null;

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const edit = (key: string, span: Span) => setPending((current) => new Map(current).set(key, span));

  /** Writes new timings where the composition reads them (or into the project when it reads a URL) and re-resolves. */
  const writeTimings = async (next: StudioTimings): Promise<void> => {
    const current = props.timingsFile;
    const target = isUrl(current) ? projectPath(project, `${stemOf(current) || 'timings'}.timings.json`) : current;
    await writeJsonFile(target, next);
    if (target === current) reevaluate();
    else await patchProps(compositionId, {timingsFile: target});
  };

  const applyEdits = () => {
    void runStudioTask('Reading the timings file...', async () => {
      const at = new Date().toISOString();
      // The tab shows composition time: the file's times moved `audioOffsetSeconds` earlier and cut to the
      // range. The edit goes into the file itself, every time moved back; the occurrences are the same
      // in both, the cut drops whole ayahs only and the move keeps the order.
      const offset = audioOffsetOf(resolved);
      const file = await readTimingsFile(props.timingsFile);
      // All at once: applied one by one, each sort would renumber the occurrences the next edit names.
      const nudges = [...pending].map(([key, span]) => {
        const {id, occurrence} = parseKey(key);
        return {id, occurrenceIndex: occurrence, start: span.start + offset, end: span.end + offset, at};
      });
      setStudioState({busy: 'Writing the timings...'});
      await writeTimings(nudgeWords(file, nudges));
      setPending(new Map());
    });
  };

  /**
   * Writes the captions of the timings file into the project: SRT, or the `Caption[]` JSON of
   * `@remotion/captions`. The file, as `applyEdits` reads it, not `resolved.timings` (cut to the
   * range, and moved for a recitation): the captions follow the audio file.
   */
  const exportCaptions = (format: 'srt' | 'json') => {
    const source = props.timingsFile;
    const withMarkers = markers;
    // An ayah text has the Unicode words of its range: a word the sidecar does not name gets them, not its id.
    const words: Readonly<Record<string, string>> = resolved !== null && !hasLines(resolved) ? resolved.text.words : {};
    void runStudioTask('Reading the timings file...', async () => {
      const file = await readTimingsFile(source);
      const captions = toCaptions(file, {markers: withMarkers, textOf: (id) => words[id] ?? null});
      const stem = slugify(stemOf(source).replace(/\.timings$/, '')) || 'timings';
      setStudioState({busy: 'Writing the captions...'});
      const path =
        format === 'srt'
          ? await writeFile(projectPath(project, `${stem}.srt`), captionsToSrt(captions))
          : await writeJsonFile(projectPath(project, `${stem}.captions.json`), captions);
      setStudioState({
        notice: `public/${path} is written: ${captions.length} ${format === 'srt' ? 'cues' : 'captions'}, timed to the audio file.`,
      });
    });
  };

  const fromSession = async (
    live: StudioSession,
    align: StudioSession['align'],
    log: Omit<AlignmentEdit, 'at'>,
  ): Promise<void> => {
    setStudioState({busy: 'Fetching the word times...', progress: null});
    const timestamps = await sessionTimestamps(live.audioId, {}, {token: getHfToken() || null});
    const converted = timingsFromQud(
      {align, timestamps},
      {audio: live.audio, model: live.model, device: live.device, riwayah: live.riwayah},
    );
    // The new alignment starts an empty log; the file keeps its history, with this step at the end.
    const kept = timings.alignment?.edits ?? [];
    const next = [...kept, {...log, at: new Date().toISOString()}].reduce(withEdit, converted);
    await writeTimings(next);
    const nudges = kept.filter((edit) => edit.kind === 'nudge').length;
    const notices = [
      align.warning,
      nudges > 0
        ? `The new alignment replaces the times of the ${nudges} nudge${nudges === 1 ? '' : 's'} made before; the edit log keeps ${nudges === 1 ? 'it' : 'them'}.`
        : null,
    ].filter((entry): entry is string => typeof entry === 'string' && entry !== '');
    setStudioState({session: {...live, align}, notice: notices.length > 0 ? notices.join(' ') : null});
    setPending(new Map());
    setBoundaries(null);
  };

  const splitNow = () => {
    if (!sessionMatches) return;
    const live = sessionMatches;
    void runStudioTask('Splitting the segments...', async () => {
      const request = {
        max_verses: split.maxVerses,
        max_words: split.maxWords > 0 ? split.maxWords : null,
        max_duration: split.maxDuration,
        require_stop_sign: split.stopSigns,
      };
      const align = await splitSession(live.audioId, request, {token: getHfToken() || null});
      await fromSession(live, align, {
        kind: 'split-segment',
        note: `max ${split.maxVerses} verse(s), ${split.maxWords > 0 ? split.maxWords : 'any'} words, ${split.maxDuration} s${split.stopSigns ? ', at stop signs' : ''}`,
      });
    });
  };

  const realignNow = () => {
    if (!sessionMatches || shownBoundaries.length === 0) return;
    const live = sessionMatches;
    const timestamps = shownBoundaries;
    void runStudioTask('Re-aligning...', async () => {
      const align = await realignSession(
        live.audioId,
        {timestamps, model_name: live.model, device: live.device, riwayah: live.riwayah},
        {onProgress: (step) => setStudioState({progress: step})},
        {token: getHfToken() || null},
      );
      await fromSession(live, align, {kind: 'realign', note: `${timestamps.length} boundaries given by hand`});
    });
  };

  const sessionHint = sessionMatches
    ? null
    : 'Align this audio in this session first: the aligner keeps a session for a few hours only.';

  return (
    <div>
      <Note>
        {segments.length} segments, {wordCount} words
        {alignment
          ? `, ${low} under ${Math.round(threshold * 100)}%, ${missing} with missing words, ${errors} with errors`
          : ''}
        , {incomplete} incomplete ayah{incomplete === 1 ? '' : 's'}
        {alignment ? `, ${repeats} with repeats` : ''}.
      </Note>
      {alignment ? (
        <Section title="Segments">
          <ul style={styles.list}>
            {segments.map((segment) => {
              const key = `s${segment.segment}`;
              const open = expanded.has(key);
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the row is a seek target; the expand button is keyboard-reachable
                <li key={key} style={styles.listRow(open)} onClick={() => seekTo(segment.timeFrom, fps)}>
                  <div style={styles.row}>
                    <Button
                      variant="ghost"
                      title={open ? 'Hide the words' : 'Show the words'}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(key);
                      }}
                    >
                      {open ? '▾' : '▸'}
                    </Button>
                    <strong>#{segment.segment}</strong>
                    <span style={{color: colors.muted}}>{range(segment.timeFrom, segment.timeTo)}</span>
                    <span style={{...styles.code, color: colors.muted}}>
                      {segment.refFrom ?? '–'} → {segment.refTo ?? '–'}
                    </span>
                  </div>
                  <div style={styles.rtl}>{segment.matchedText ?? segment.kind ?? 'no match'}</div>
                  <div style={styles.row}>
                    <ProgressBar ratio={segment.confidence} color={confidenceColor(segment.confidence, threshold)} />
                    <span
                      style={{color: confidenceColor(segment.confidence, threshold), minWidth: 34, textAlign: 'right'}}
                    >
                      {Math.round(segment.confidence * 100)}%
                    </span>
                  </div>
                  <div>
                    {segment.hasMissingWords ? <Flag color={colors.warning}>missing words</Flag> : null}
                    {segment.hasRepeatedWords ? <Flag color={colors.warning}>repeated</Flag> : null}
                    {segment.error ? <Flag color={colors.danger}>{segment.error}</Flag> : null}
                  </div>
                  {open ? (
                    <WordList words={wordsBySegment.get(segment.segment) ?? []} pending={pending} onChange={edit} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
      <Disclosure
        title={`Ayahs (${timings.ayat.length})`}
        open={alignment ? expanded.has('ayahs') : !expanded.has('ayahs')}
        onToggle={() => toggle('ayahs')}
      >
        <ul style={styles.list}>
          {timings.ayat.map((ayah) => {
            const key = `a${ayah.ayah}`;
            const open = expanded.has(key);
            const seen = new Map<string, number>();
            const words: EditableWord[] = (ayah.words ?? []).map((word) => {
              const occurrence = seen.get(word.id) ?? 0;
              seen.set(word.id, occurrence + 1);
              return {
                key: keyOf(word.id, occurrence),
                id: word.id,
                occurrence,
                text: textOf.get(word.id) ?? word.id,
                start: word.start,
                end: word.end,
              };
            });
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the row is a seek target; the expand button is keyboard-reachable
              <li key={key} style={styles.listRow(open)} onClick={() => seekTo(ayah.start, fps)}>
                <div style={styles.row}>
                  <Button
                    variant="ghost"
                    title={open ? 'Hide the words' : 'Show the words'}
                    disabled={words.length === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(key);
                    }}
                  >
                    {open ? '▾' : '▸'}
                  </Button>
                  <strong>
                    {timings.surah}:{ayah.ayah}
                  </strong>
                  <span style={{color: colors.muted}}>{range(ayah.start, ayah.end)}</span>
                  <span style={{color: colors.muted}}>{words.length} words</span>
                  {ayah.complete === false ? <Flag color={colors.warning}>incomplete</Flag> : null}
                </div>
                {open ? <WordList words={words} pending={pending} onChange={edit} /> : null}
              </li>
            );
          })}
        </ul>
      </Disclosure>
      <Section title="Edits">
        <div style={styles.row}>
          <Button variant="primary" onClick={applyEdits} disabled={working || pending.size === 0}>
            Apply edits ({pending.size})
          </Button>
          <Button onClick={() => setPending(new Map())} disabled={pending.size === 0}>
            Discard
          </Button>
        </div>
        <Note>
          Applying rewrites public/{props.timingsFile} with the new times and logs the edit in its alignment sidecar.
        </Note>
      </Section>
      <Section title="Export">
        <div style={styles.row}>
          <Button onClick={() => exportCaptions('srt')} disabled={working || !props.timingsFile}>
            SRT
          </Button>
          <Button onClick={() => exportCaptions('json')} disabled={working || !props.timingsFile}>
            Captions JSON
          </Button>
          <label style={styles.row}>
            <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
            <span style={styles.label}>include ayah markers</span>
          </label>
        </div>
        <Note>
          The captions of the whole timings file, timed to the audio file. The JSON is the Caption[] that Remotion's
          caption tooling (@remotion/captions) reads.
        </Note>
      </Section>
      <Disclosure title="Split segments..." open={splitOpen} onToggle={() => setSplitOpen((o) => !o)}>
        <div style={styles.row}>
          <span style={styles.label}>Max verses</span>
          <NumberInput
            label="Max verses"
            value={split.maxVerses}
            min={1}
            max={50}
            onChange={(maxVerses) => setSplit({...split, maxVerses})}
          />
          <span style={styles.label}>max words</span>
          <NumberInput
            label="Max words"
            value={split.maxWords}
            min={0}
            max={200}
            onChange={(maxWords) => setSplit({...split, maxWords})}
          />
        </div>
        <div style={{...styles.row, marginTop: 6}}>
          <span style={styles.label}>Max seconds (30 disables)</span>
          <NumberInput
            label="Max duration"
            value={split.maxDuration}
            min={1}
            max={30}
            onChange={(maxDuration) => setSplit({...split, maxDuration})}
          />
          <label style={styles.row}>
            <input
              type="checkbox"
              checked={split.stopSigns}
              onChange={(e) => setSplit({...split, stopSigns: e.target.checked})}
            />
            <span style={styles.label}>only at stop signs</span>
          </label>
        </div>
        <div style={{marginTop: 8}}>
          <Button
            variant="primary"
            onClick={splitNow}
            disabled={working || !sessionMatches}
            title={sessionHint ?? undefined}
          >
            Split segments
          </Button>
        </div>
        {sessionHint ? <Note>{sessionHint}</Note> : null}
      </Disclosure>
      <Disclosure
        title="Re-align with these boundaries (advanced)"
        open={realignOpen}
        onToggle={() => setRealignOpen((open) => !open)}
      >
        <Note>Each boundary is a stretch of the recording the aligner transcribes and matches on its own.</Note>
        {shownBoundaries.map((boundary, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: boundaries have no identity of their own
          <div key={index} style={{...styles.row, marginBottom: 4}}>
            <span style={{...styles.label, minWidth: 18}}>{index + 1}</span>
            <NumberInput
              label={`Boundary ${index + 1} start`}
              value={boundary.start}
              min={0}
              step={0.01}
              onChange={(start) => setBoundaries(shownBoundaries.map((x, i) => (i === index ? {...x, start} : x)))}
            />
            <NumberInput
              label={`Boundary ${index + 1} end`}
              value={boundary.end}
              min={0}
              step={0.01}
              onChange={(end) => setBoundaries(shownBoundaries.map((x, i) => (i === index ? {...x, end} : x)))}
            />
            <Button
              variant="ghost"
              title="Remove this boundary"
              onClick={() => setBoundaries(shownBoundaries.filter((_, i) => i !== index))}
            >
              ×
            </Button>
          </div>
        ))}
        <div style={styles.row}>
          <Button
            onClick={() => {
              const last = shownBoundaries[shownBoundaries.length - 1];
              const start = last ? last.end : 0;
              setBoundaries([...shownBoundaries, {start, end: roundMs(start + 1)}]);
            }}
          >
            Add boundary
          </Button>
          <Button onClick={() => setBoundaries(null)} disabled={boundaries === null}>
            Reset from segments
          </Button>
          <Button
            variant="primary"
            onClick={realignNow}
            disabled={working || !sessionMatches || shownBoundaries.length === 0}
            title={sessionHint ?? undefined}
          >
            Re-align
          </Button>
        </div>
        {sessionHint ? <Note>{sessionHint}</Note> : null}
        {timings.alignment?.edits.length ? (
          <Note>
            Edit log:{' '}
            {timings.alignment.edits
              .map((e) => `${e.kind} at ${e.at.slice(0, 19).replace('T', ' ')} (${e.note})`)
              .join('; ')}
          </Note>
        ) : null}
      </Disclosure>
      <Note>
        Click a segment or an ayah to play it from its start;{' '}
        {isAyahTextProps(props)
          ? `the threshold is the default ${Math.round(threshold * 100)}% (this composition has no review props).`
          : `the threshold (${Math.round(threshold * 100)}%) is the composition's review.confidenceThreshold in the Props sidebar.`}
      </Note>
    </div>
  );
};
