// The Review tab's "Compare with...": another timings file of public/ against the composition's,
// word by word (see compare.ts). The two files are read as they are, in their own times.
import type * as React from 'react';
import {useState} from 'react';
import {diffTimings, type TimingsDiff} from './compare';
import {runStudioTask, t as tNow, useStudioState, useT} from './store';
import {JSON_EXTENSIONS, readTimingsFile} from './studio-api';
import {colors, styles} from './styles';
import {seconds} from './ui';
import {usePublicFiles} from './use-public-files';

/** How many words the table lists, largest difference first. */
export const COMPARE_ROWS = 50;

const signedMs = (value: number): string => `${value > 0 ? '+' : ''}${Math.round(value * 1000)}`;

/**
 * Picks another timings JSON of `public/` and lists, word by word, how much later it starts each
 * word than the composition's file. A row click seeks to the word in the composition (its time in
 * the file less `offset`).
 */
export const CompareTimings: React.FC<{
  readonly timingsFile: string;
  /** Seconds the composition skips of the recording (`audioOffsetSeconds`). */
  readonly offset: number;
  readonly onSeek: (seconds: number) => void;
}> = ({timingsFile, offset, onSeek}) => {
  const t = useT();
  const {busy} = useStudioState();
  const files = usePublicFiles(JSON_EXTENSIONS).filter((file) => file.name !== timingsFile);
  const [other, setOther] = useState('');
  const [result, setResult] = useState<{readonly other: string; readonly diff: TimingsDiff} | null>(null);

  const compare = (path: string) => {
    setOther(path);
    if (!path) {
      setResult(null);
      return;
    }
    void runStudioTask(tNow('compare.busy'), async () => {
      const [mine, theirs] = await Promise.all([readTimingsFile(timingsFile), readTimingsFile(path)]);
      setResult({other: path, diff: diffTimings(mine, theirs)});
    });
  };

  const diff = result?.other === other ? result.diff : null;
  const unit = t('unit.seconds');
  return (
    <div data-mushaf-compare="">
      <select
        style={styles.input}
        aria-label={t('compare.with')}
        value={other}
        disabled={busy !== null || !timingsFile}
        onChange={(e) => compare(e.target.value)}
      >
        <option value="">{t('compare.with')}</option>
        {files.map((file) => (
          <option key={file.name} value={file.name}>
            {file.name}
          </option>
        ))}
      </select>
      {diff ? (
        <>
          <p data-mushaf-compare="summary" style={styles.note}>
            {t('compare.summary', {
              matched: diff.summary.matched,
              median: seconds(diff.summary.median),
              p90: seconds(diff.summary.p90),
              max: seconds(diff.summary.max),
              unit,
              onlyA: diff.onlyInA.length,
              onlyB: diff.onlyInB.length,
              other,
            })}
          </p>
          {diff.words.length > 0 ? (
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 11}}>
              <thead>
                <tr style={{color: colors.muted, textAlign: 'start'}}>
                  <th style={{textAlign: 'start'}}>{t('compare.word')}</th>
                  <th style={{textAlign: 'end'}}>{t('compare.thisFile')}</th>
                  <th style={{textAlign: 'end'}}>{t('compare.otherFile')}</th>
                  <th style={{textAlign: 'end'}}>{t('compare.diffMs')}</th>
                </tr>
              </thead>
              <tbody>
                {diff.words.slice(0, COMPARE_ROWS).map((word) => (
                  <tr
                    key={`${word.id}#${word.occurrence}`}
                    data-mushaf-compare="row"
                    data-word={`${word.id}#${word.occurrence}`}
                    style={{cursor: 'pointer', borderTop: `1px solid ${colors.border}`}}
                    tabIndex={0}
                    onClick={() => onSeek(word.startA - offset)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      // The row's own Enter: the Review tab's (apply the edits) must not see it.
                      event.stopPropagation();
                      onSeek(word.startA - offset);
                    }}
                  >
                    <td style={styles.code}>
                      {word.id}
                      {word.occurrence > 0 ? ` (${word.occurrence + 1})` : ''}
                    </td>
                    <td style={{textAlign: 'end'}}>{seconds(word.startA)}</td>
                    <td style={{textAlign: 'end'}}>{seconds(word.startB)}</td>
                    <td style={{textAlign: 'end', color: Math.abs(word.diff) >= 0.1 ? colors.warning : colors.text}}>
                      {signedMs(word.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
