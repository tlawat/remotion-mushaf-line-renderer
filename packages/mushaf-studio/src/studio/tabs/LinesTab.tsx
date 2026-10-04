import {type MushafLineData, type MushafWord, sliceWords} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {useMemo} from 'react';
import type {LineSplit} from '../../types';
import {runStudioTask, t as tNow, useStudioState, useT} from '../store';
import {patchProps, seekTo} from '../studio-api';
import {colors, styles} from '../styles';
import {hasLines, isAyahTextProps, resolvedOf, type TabProps} from '../tab-props';
import {Button, Note, range, Section} from '../ui';

const MARKERS: Readonly<Record<MushafWord['kind'], string>> = {
  word: '',
  end: '۝',
  pause: 'ۖ',
  sajdah: '۩',
  'rub-el-hizb': '۞',
};

const sameSplit = (a: LineSplit, b: LineSplit): boolean =>
  a.page === b.page && a.line === b.line && a.atWordId === b.atWordId;

/** Lines: every scheduled slot with its words as chips; click a word to start a new slot there. */
export const LinesTab: React.FC<TabProps> = ({compositionId, props, fps}) => {
  const {busy} = useStudioState();
  const t = useT();
  const resolved = resolvedOf(props);
  const textOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const word of resolved?.timings.alignment?.words ?? []) if (!map.has(word.id)) map.set(word.id, word.text);
    return map;
  }, [resolved]);
  if (isAyahTextProps(props)) return <Note>{t('lines.noPrintedLines')}</Note>;
  if (!resolved || !hasLines(resolved)) return <Note>{t('lines.noLines')}</Note>;

  const working = busy !== null;
  const splits: readonly LineSplit[] = props.splits;
  const save = (next: readonly LineSplit[]) =>
    void runStudioTask(tNow('lines.busy.splits'), () => patchProps(compositionId, {splits: next}));
  const addSplit = (line: MushafLineData, word: MushafWord) => {
    const split: LineSplit = {page: line.page, line: line.line, atWordId: word.wordId};
    if (splits.some((s) => sameSplit(s, split))) return;
    save([...splits, split]);
  };
  const label = (word: MushafWord): string =>
    word.kind === 'word' ? (textOf.get(word.id) ?? word.id) : `${MARKERS[word.kind]} ${word.id}`;

  return (
    <div>
      <Section title={t('lines.slots', {count: resolved.schedule.length})}>
        <ul style={styles.list}>
          {resolved.schedule.map((slot) => {
            const line = resolved.lines[slot.index];
            if (!line) return null;
            const kept = sliceWords(line);
            const keptIds = new Set(kept.map((w) => w.wordId));
            const firstKept = kept[0]?.wordId;
            const lineSplits = splits.filter((s) => s.page === line.page && s.line === line.line);
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the row is a seek target; its chips are buttons
              <li key={`${slot.index}`} style={styles.listRow(false)} onClick={() => seekTo(slot.start, fps)}>
                <div style={styles.row}>
                  <strong>{t('lines.pageLine', {page: line.page, line: line.line})}</strong>
                  <span style={{color: colors.muted}}>{range(slot.start, slot.end, t('unit.seconds'))}</span>
                  <span style={{color: colors.muted}}>{t('lines.slot', {n: slot.index + 1})}</span>
                </div>
                <div style={{display: 'flex', flexWrap: 'wrap', direction: 'rtl', alignItems: 'center'}}>
                  {line.words.map((word) => {
                    const isKept = keptIds.has(word.wordId);
                    const clickable = isKept && word.wordId !== firstKept && !working;
                    const marked = lineSplits.some((s) => s.atWordId === word.wordId);
                    return (
                      <span key={word.wordId} style={{display: 'contents'}}>
                        {marked ? <span style={styles.splitMarker}>|</span> : null}
                        <button
                          type="button"
                          data-word-id={word.wordId}
                          style={styles.chip(isKept, clickable, word.kind !== 'word')}
                          disabled={!clickable}
                          title={clickable ? t('lines.splitBefore', {id: word.id}) : word.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            addSplit(line, word);
                          }}
                        >
                          {label(word)}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title={t('lines.splits', {count: splits.length})}>
        {splits.length === 0 ? (
          <Note>{t('lines.splitsHint')}</Note>
        ) : (
          <ul style={styles.list}>
            {splits.map((split) => (
              <li key={`${split.page}-${split.line}-${split.atWordId}`} style={{...styles.row, padding: '3px 0'}}>
                <span>{t('lines.splitAt', {page: split.page, line: split.line, word: split.atWordId})}</span>
                <Button
                  variant="ghost"
                  title={t('lines.removeSplit')}
                  disabled={working}
                  onClick={() => save(splits.filter((s) => !sameSplit(s, split)))}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
