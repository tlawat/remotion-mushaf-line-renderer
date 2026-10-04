import type * as React from 'react';
import {useMemo, useState} from 'react';
import {DEFAULT_CONFIDENCE_THRESHOLD, realignSession, sessionTimestamps, splitSession, timingsFromQud} from '../../qud';
import type {AlignmentEdit, AlignmentSegment, StudioTimings} from '../../types';
import {CompareTimings} from '../Compare';
import {isDoubtfulSegment} from '../doubts';
import {nudgeWords, roundMs, withEdit} from '../edit-timings';
import {
  doubtfulReviewWords,
  parseWordKey,
  REVIEW_SHORTCUTS,
  type ReviewWord,
  reviewKeyAction,
  reviewWords,
  stepDoubt,
} from '../review-words';
import {
  getHfToken,
  getStudioState,
  runStudioTask,
  type StudioSession,
  setStudioState,
  t as tNow,
  useStudioState,
  useT,
} from '../store';
import {
  isUrl,
  patchProps,
  projectPath,
  readTimingsFile,
  reevaluate,
  seekTo,
  seekToTime,
  stemOf,
  togglePlayback,
  writeJsonFile,
} from '../studio-api';
import {colors, confidenceColor, styles} from '../styles';
import {audioOffsetOf, isAyahTextProps, resolvedOf, type TabProps} from '../tab-props';
import {Button, Disclosure, Note, NumberInput, ProgressBar, range, Section} from '../ui';
import {Waveform, type WaveformView} from '../Waveform';
import {ExportRow} from './ExportRow';

type Span = {readonly start: number; readonly end: number};

/** Seconds around the selected segment the waveform shows by default. */
const DEFAULT_ZOOM_PADDING = 2;

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
  readonly words: readonly ReviewWord[];
  readonly pending: ReadonlyMap<string, Span>;
  readonly selected: string | null;
  readonly onChange: (key: string, span: Span) => void;
  readonly onSelect: (word: ReviewWord) => void;
  readonly startLabel: (id: string) => string;
  readonly endLabel: (id: string) => string;
}> = ({words, pending, selected, onChange, onSelect, startLabel, endLabel}) => (
  // biome-ignore lint/a11y/noStaticElementInteractions: the editor swallows clicks so the row behind it does not seek
  <div onClick={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
    {words.map((word) => {
      const span = pending.get(word.key) ?? word;
      const changed = pending.has(word.key);
      const isSelected = word.key === selected;
      return (
        <div
          key={word.key}
          data-word-key={word.key}
          data-selected={isSelected ? 'true' : 'false'}
          style={{
            ...styles.row,
            padding: '3px 0',
            borderTop: `1px solid ${colors.border}`,
            boxShadow: isSelected ? `inset 2px 0 0 ${colors.accent}` : 'none',
          }}
        >
          <button
            type="button"
            style={{
              ...styles.rtl,
              flex: '1 1 60px',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: changed ? colors.accent : colors.text,
            }}
            onClick={() => onSelect(word)}
          >
            {word.text}
          </button>
          <span style={{...styles.code, color: colors.muted}}>{word.id}</span>
          <TimeControl
            label={startLabel(word.id)}
            value={span.start}
            onChange={(start) => onChange(word.key, {...span, start})}
          />
          <TimeControl
            label={endLabel(word.id)}
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

/** A key typed into a field is the field's, not a shortcut. */
const isTyping = (target: EventTarget): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));

/**
 * Review: the aligner's segments with their confidence, the words with their times, the waveform,
 * a comparison with another timings file, split and re-align; and a keyboard for going through the
 * doubtful words (see `REVIEW_SHORTCUTS`).
 */
export const ReviewTab: React.FC<TabProps> = ({compositionId, props, project, fps}) => {
  const {session, busy, showDoubts} = useStudioState();
  const t = useT();
  const resolved = resolvedOf(props);
  const timings = resolved?.timings ?? null;
  const alignment = timings?.alignment ?? null;
  // An ayah text has no `review` props: it marks no doubtful word, and the list uses the default threshold.
  const threshold = isAyahTextProps(props) ? DEFAULT_CONFIDENCE_THRESHOLD : props.review.confidenceThreshold;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<ReadonlyMap<string, Span>>(() => new Map());
  const [splitOpen, setSplitOpen] = useState(false);
  const [split, setSplit] = useState({maxVerses: 1, maxWords: 0, maxDuration: 30, stopSigns: false});
  const [realignOpen, setRealignOpen] = useState(false);
  /** The user's boundaries; `null` means "as the segments are", so a new alignment shows its own. */
  const [boundaries, setBoundaries] = useState<readonly Span[] | null>(null);
  /** The word the keyboard edits (`ReviewWord.key`), and the segment the waveform zooms to. */
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null);
  const [zoomPadding, setZoomPadding] = useState(DEFAULT_ZOOM_PADDING);
  const [help, setHelp] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const words = useMemo(() => (timings ? reviewWords(timings) : []), [timings]);
  const byGroup = useMemo(() => {
    const map = new Map<string, ReviewWord[]>();
    for (const word of words) map.set(word.group, [...(map.get(word.group) ?? []), word]);
    return map;
  }, [words]);
  // The ayahs list names every word by its sidecar text where there is one.
  const textOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const word of alignment?.words ?? []) if (!map.has(word.id)) map.set(word.id, word.text);
    return map;
  }, [alignment]);
  const doubtful = useMemo(
    () => (timings ? doubtfulReviewWords(words, timings, threshold) : []),
    [words, timings, threshold],
  );

  if (!timings) return <Note>{t('review.nothing')}</Note>;

  const working = busy !== null;
  const offset = audioOffsetOf(resolved);
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
  const unit = t('unit.seconds');
  const startLabel = (id: string) => t('review.wordStart', {id});
  const endLabel = (id: string) => t('review.wordEnd', {id});

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // The waveform follows the segment opened last.
    if (key.startsWith('s')) {
      const number = Number(key.slice(1));
      setSelectedSegment((current) => (expanded.has(key) && current === number ? null : number));
    }
  };
  const edit = (key: string, span: Span) => setPending((current) => new Map(current).set(key, span));

  /** Selects a word: the keyboard edits it, its row opens, the waveform zooms to its segment, the playhead moves to it. */
  const select = (word: ReviewWord, seek: boolean) => {
    setSelectedWord(word.key);
    setExpanded((current) => (current.has(word.group) ? current : new Set(current).add(word.group)));
    if (word.group.startsWith('s')) setSelectedSegment(Number(word.group.slice(1)));
    if (seek) seekToTime(word.start, fps);
  };

  /** Writes new timings where the composition reads them (or into the project when it reads a URL) and re-resolves. */
  const writeTimings = async (next: StudioTimings): Promise<void> => {
    const current = props.timingsFile;
    const target = isUrl(current) ? projectPath(project, `${stemOf(current) || 'timings'}.timings.json`) : current;
    await writeJsonFile(target, next);
    if (target === current) reevaluate();
    else await patchProps(compositionId, {timingsFile: target});
  };

  const applyEdits = () => {
    const edits = pending;
    void runStudioTask(tNow('review.busy.reading'), async () => {
      const at = new Date().toISOString();
      // The tab shows composition time: the file's times moved `audioOffsetSeconds` earlier and cut to the
      // range. The edit goes into the file itself, every time moved back; the occurrences are the same
      // in both, the cut drops whole ayahs only and the move keeps the order.
      const file = await readTimingsFile(props.timingsFile);
      // All at once: applied one by one, each sort would renumber the occurrences the next edit names.
      const nudges = [...edits].map(([key, span]) => {
        const {id, occurrence} = parseWordKey(key);
        return {id, occurrenceIndex: occurrence, start: span.start + offset, end: span.end + offset, at};
      });
      setStudioState({busy: tNow('review.busy.writing')});
      await writeTimings(nudgeWords(file, nudges));
      setPending(new Map());
    });
  };

  const fromSession = async (
    live: StudioSession,
    align: StudioSession['align'],
    log: Omit<AlignmentEdit, 'at'>,
  ): Promise<void> => {
    setStudioState({busy: tNow('align.busy.wordTimes'), progress: null});
    const timestamps = await sessionTimestamps(live.audioId, {}, {token: getHfToken() || null});
    const converted = timingsFromQud(
      {align, timestamps},
      {audio: live.audio, model: live.model, device: live.device, riwayah: live.riwayah},
    );
    // The new alignment starts an empty log; the file keeps its history, with this step at the end.
    const kept = timings.alignment?.edits ?? [];
    const next = [...kept, {...log, at: new Date().toISOString()}].reduce(withEdit, converted);
    await writeTimings(next);
    const nudges = kept.filter((entry) => entry.kind === 'nudge').length;
    const notices = [align.warning, nudges > 0 ? tNow('review.notice.nudgesReplaced', {count: nudges}) : null].filter(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    );
    setStudioState({session: {...live, align}, notice: notices.length > 0 ? notices.join(' ') : null});
    setPending(new Map());
    setBoundaries(null);
  };

  const splitNow = () => {
    if (!sessionMatches) return;
    const live = sessionMatches;
    void runStudioTask(tNow('review.busy.splitting'), async () => {
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
    void runStudioTask(tNow('review.busy.realigning'), async () => {
      const align = await realignSession(
        live.audioId,
        {timestamps, model_name: live.model, device: live.device, riwayah: live.riwayah},
        {onProgress: (step) => setStudioState({progress: step})},
        {token: getHfToken() || null},
      );
      await fromSession(live, align, {kind: 'realign', note: `${timestamps.length} boundaries given by hand`});
    });
  };

  /** The keyboard of the tab: shortcuts only while focus is in it and not in a field; none reaches the Studio. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTyping(event.target)) return;
    const action = reviewKeyAction(event);
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    const current = words.find((word) => word.key === selectedWord) ?? null;
    switch (action.kind) {
      case 'step': {
        const next = stepDoubt(doubtful, current, action.direction);
        if (next) select(next, true);
        else setStudioState({notice: tNow('review.noDoubtful')});
        return;
      }
      case 'nudge': {
        if (!current) {
          setStudioState({notice: tNow('review.selectFirst')});
          return;
        }
        const span = pending.get(current.key) ?? current;
        const moved = Math.max(0, roundMs(span[action.edge] + action.seconds));
        edit(current.key, {...span, [action.edge]: moved});
        return;
      }
      case 'apply':
        if (pending.size > 0 && getStudioState().busy === null) applyEdits();
        return;
      case 'toggle-playback':
        togglePlayback();
        return;
      case 'help':
        setHelp((open) => !open);
        return;
    }
  };

  const sessionHint = sessionMatches ? null : t('review.sessionHint');
  const zoomSegment = segments.find((segment) => segment.segment === selectedSegment) ?? null;
  const lastEnd = Math.max(
    timings.ayat[timings.ayat.length - 1]?.end ?? 0,
    segments[segments.length - 1]?.timeTo ?? 0,
    0.1,
  );
  const view: WaveformView = zoomSegment
    ? {from: zoomSegment.timeFrom - zoomPadding, to: zoomSegment.timeTo + zoomPadding}
    : {from: 0, to: lastEnd + 0.5};

  return (
    <div
      data-mushaf-review=""
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the tab takes focus so its keyboard shortcuts work
      tabIndex={0}
      role="application"
      aria-label={t('review.keyboardLabel')}
      onKeyDown={onKeyDown}
      style={{outline: 'none'}}
    >
      <Note>
        {t('review.summary', {segments: segments.length, words: wordCount})}
        {alignment ? t('review.summaryAlignment', {low, percent: Math.round(threshold * 100), missing, errors}) : ''}
        {t('review.summaryIncomplete', {count: incomplete})}
        {alignment ? t('review.summaryRepeats', {repeats}) : ''}.
      </Note>
      <div style={{...styles.row, marginBottom: 8}}>
        <label style={styles.row}>
          <input
            type="checkbox"
            data-mushaf-control="show-doubts"
            checked={showDoubts}
            onChange={(e) => setStudioState({showDoubts: e.target.checked})}
          />
          <span style={styles.label}>{t('review.showDoubts')}</span>
        </label>
        <Button variant="ghost" onClick={() => setHelp((open) => !open)} title={t('review.keys.title')}>
          ?
        </Button>
      </div>
      {help ? (
        <Section title={t('review.keys.title')}>
          <ul data-mushaf-review="shortcuts" style={{...styles.list, fontSize: 11}}>
            {REVIEW_SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys} style={{...styles.row, padding: '2px 0'}}>
                <kbd style={{...styles.code, minWidth: 52}}>{shortcut.keys}</kbd>
                <span>{t(shortcut.description)}</span>
              </li>
            ))}
          </ul>
          <Note>{t('review.keys.focus')}</Note>
        </Section>
      ) : null}
      {props.audioFile ? (
        <Section title={t('review.waveform')}>
          <Waveform
            audioFile={props.audioFile}
            offset={offset}
            view={view}
            segments={segments}
            threshold={threshold}
            selected={selectedSegment}
            fps={fps}
            onSeek={(time) => seekToTime(time, fps)}
          />
          <div style={{...styles.row, marginTop: 4}}>
            <input
              type="range"
              aria-label={t('review.zoom')}
              min={0.5}
              max={30}
              step={0.5}
              value={zoomPadding}
              disabled={zoomSegment === null}
              onChange={(e) => setZoomPadding(Number(e.target.value))}
              style={{flex: '1 1 auto'}}
            />
            <span style={styles.label}>
              {zoomSegment
                ? t('review.zoomAround', {padding: zoomPadding, unit, segment: zoomSegment.segment})
                : t('review.zoomWhole')}
            </span>
          </div>
        </Section>
      ) : null}
      {alignment ? (
        <Section title={t('review.segments')}>
          <ul style={styles.list}>
            {segments.map((segment) => {
              const key = `s${segment.segment}`;
              const open = expanded.has(key);
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the row is a seek target; the expand button is keyboard-reachable
                <li
                  key={key}
                  data-segment={segment.segment}
                  data-doubtful={isDoubtfulSegment(segment, threshold) ? 'true' : 'false'}
                  style={styles.listRow(open)}
                  onClick={() => seekTo(segment.timeFrom, fps)}
                >
                  <div style={styles.row}>
                    <Button
                      variant="ghost"
                      title={open ? t('review.hideWords') : t('review.showWords')}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(key);
                      }}
                    >
                      {open ? '▾' : '▸'}
                    </Button>
                    <strong>#{segment.segment}</strong>
                    <span style={{color: colors.muted}}>{range(segment.timeFrom, segment.timeTo, unit)}</span>
                    <span style={{...styles.code, color: colors.muted}}>
                      {segment.refFrom ?? '–'} → {segment.refTo ?? '–'}
                    </span>
                  </div>
                  <div style={styles.rtl}>{segment.matchedText ?? segment.kind ?? t('review.noMatch')}</div>
                  <div style={styles.row}>
                    <ProgressBar ratio={segment.confidence} color={confidenceColor(segment.confidence, threshold)} />
                    <span
                      style={{color: confidenceColor(segment.confidence, threshold), minWidth: 34, textAlign: 'end'}}
                    >
                      {Math.round(segment.confidence * 100)}%
                    </span>
                  </div>
                  <div>
                    {segment.hasMissingWords ? <Flag color={colors.warning}>{t('review.flagMissing')}</Flag> : null}
                    {segment.hasRepeatedWords ? <Flag color={colors.warning}>{t('review.flagRepeated')}</Flag> : null}
                    {segment.error ? <Flag color={colors.danger}>{segment.error}</Flag> : null}
                  </div>
                  {open ? (
                    <WordList
                      words={byGroup.get(key) ?? []}
                      pending={pending}
                      selected={selectedWord}
                      onChange={edit}
                      onSelect={(word) => select(word, true)}
                      startLabel={startLabel}
                      endLabel={endLabel}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
      <Disclosure
        title={t('review.ayahs', {count: timings.ayat.length})}
        open={alignment ? expanded.has('ayahs') : !expanded.has('ayahs')}
        onToggle={() => toggle('ayahs')}
      >
        <ul style={styles.list}>
          {timings.ayat.map((ayah) => {
            const key = `a${ayah.ayah}`;
            const open = expanded.has(key);
            const seen = new Map<string, number>();
            const ayahWords: ReviewWord[] = (ayah.words ?? []).map((word) => {
              const occurrence = seen.get(word.id) ?? 0;
              seen.set(word.id, occurrence + 1);
              return {
                key: `${word.id}#${occurrence}`,
                id: word.id,
                occurrence,
                text: textOf.get(word.id) ?? word.id,
                start: word.start,
                end: word.end,
                group: key,
              };
            });
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the row is a seek target; the expand button is keyboard-reachable
              <li key={key} style={styles.listRow(open)} onClick={() => seekTo(ayah.start, fps)}>
                <div style={styles.row}>
                  <Button
                    variant="ghost"
                    title={open ? t('review.hideWords') : t('review.showWords')}
                    disabled={ayahWords.length === 0}
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
                  <span style={{color: colors.muted}}>{range(ayah.start, ayah.end, unit)}</span>
                  <span style={{color: colors.muted}}>{t('review.wordCount', {count: ayahWords.length})}</span>
                  {ayah.complete === false ? <Flag color={colors.warning}>{t('review.flagIncomplete')}</Flag> : null}
                </div>
                {open ? (
                  <WordList
                    words={ayahWords}
                    pending={pending}
                    selected={selectedWord}
                    onChange={edit}
                    onSelect={(word) => select(word, true)}
                    startLabel={startLabel}
                    endLabel={endLabel}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </Disclosure>
      <Section title={t('review.edits')}>
        <div style={styles.row}>
          <Button variant="primary" onClick={applyEdits} disabled={working || pending.size === 0}>
            {t('review.apply', {count: pending.size})}
          </Button>
          <Button onClick={() => setPending(new Map())} disabled={pending.size === 0}>
            {t('review.discard')}
          </Button>
        </div>
        <Note>{t('review.applyNote', {file: props.timingsFile})}</Note>
      </Section>
      <ExportRow props={props} project={project} />
      <Disclosure title={t('compare.title')} open={compareOpen} onToggle={() => setCompareOpen((o) => !o)}>
        <CompareTimings
          timingsFile={isUrl(props.timingsFile) ? '' : props.timingsFile}
          offset={offset}
          onSeek={(time) => seekToTime(time, fps)}
        />
        <Note>{t('compare.note')}</Note>
      </Disclosure>
      <Disclosure title={t('review.splitTitle')} open={splitOpen} onToggle={() => setSplitOpen((o) => !o)}>
        <div style={styles.row}>
          <span style={styles.label}>{t('review.maxVerses')}</span>
          <NumberInput
            label={t('review.maxVersesLabel')}
            value={split.maxVerses}
            min={1}
            max={50}
            onChange={(maxVerses) => setSplit({...split, maxVerses})}
          />
          <span style={styles.label}>{t('review.maxWords')}</span>
          <NumberInput
            label={t('review.maxWordsLabel')}
            value={split.maxWords}
            min={0}
            max={200}
            onChange={(maxWords) => setSplit({...split, maxWords})}
          />
        </div>
        <div style={{...styles.row, marginTop: 6}}>
          <span style={styles.label}>{t('review.maxSeconds')}</span>
          <NumberInput
            label={t('review.maxDurationLabel')}
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
            <span style={styles.label}>{t('review.stopSigns')}</span>
          </label>
        </div>
        <div style={{marginTop: 8}}>
          <Button
            variant="primary"
            onClick={splitNow}
            disabled={working || !sessionMatches}
            title={sessionHint ?? undefined}
          >
            {t('review.splitButton')}
          </Button>
        </div>
        {sessionHint ? <Note>{sessionHint}</Note> : null}
      </Disclosure>
      <Disclosure title={t('review.realignTitle')} open={realignOpen} onToggle={() => setRealignOpen((open) => !open)}>
        <Note>{t('review.boundaryNote')}</Note>
        {shownBoundaries.map((boundary, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: boundaries have no identity of their own
          <div key={index} style={{...styles.row, marginBottom: 4}}>
            <span style={{...styles.label, minWidth: 18}}>{index + 1}</span>
            <NumberInput
              label={t('review.boundaryStart', {n: index + 1})}
              value={boundary.start}
              min={0}
              step={0.01}
              onChange={(start) => setBoundaries(shownBoundaries.map((x, i) => (i === index ? {...x, start} : x)))}
            />
            <NumberInput
              label={t('review.boundaryEnd', {n: index + 1})}
              value={boundary.end}
              min={0}
              step={0.01}
              onChange={(end) => setBoundaries(shownBoundaries.map((x, i) => (i === index ? {...x, end} : x)))}
            />
            <Button
              variant="ghost"
              title={t('review.removeBoundary')}
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
            {t('review.addBoundary')}
          </Button>
          <Button onClick={() => setBoundaries(null)} disabled={boundaries === null}>
            {t('review.resetBoundaries')}
          </Button>
          <Button
            variant="primary"
            onClick={realignNow}
            disabled={working || !sessionMatches || shownBoundaries.length === 0}
            title={sessionHint ?? undefined}
          >
            {t('review.realignButton')}
          </Button>
        </div>
        {sessionHint ? <Note>{sessionHint}</Note> : null}
        {timings.alignment?.edits.length ? (
          <Note>
            {t('review.editLog', {
              edits: timings.alignment.edits
                .map((e) =>
                  t('review.editEntry', {kind: e.kind, at: e.at.slice(0, 19).replace('T', ' '), note: e.note}),
                )
                .join('; '),
            })}
          </Note>
        ) : null}
      </Disclosure>
      <Note>
        {t('review.clickHint')}{' '}
        {isAyahTextProps(props)
          ? t('review.thresholdDefault', {percent: Math.round(threshold * 100)})
          : t('review.thresholdProps', {percent: Math.round(threshold * 100)})}
      </Note>
    </div>
  );
};
