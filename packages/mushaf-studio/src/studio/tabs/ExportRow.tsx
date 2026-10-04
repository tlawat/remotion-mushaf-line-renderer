import type * as React from 'react';
import {useState} from 'react';
import {captionsToSrt, captionsToVtt, toCaptionCues, toCaptions} from '../../captions';
import {MushafStudioError} from '../../errors';
import {chaptersOf, copyToClipboard, descriptionOf, THUMBNAIL_COMPOSITION_ID, thumbnailPatchOf} from '../publish';
import {describeError, runStudioTask, setStudioState, t as tNow, useStudioState, useT} from '../store';
import {
  patchOtherComposition,
  projectPath,
  readTimingsFile,
  slugify,
  stemOf,
  writeFile,
  writeJsonFile,
} from '../studio-api';
import {styles} from '../styles';
import {isAyahTextResolved, resolvedOf, type TabProps} from '../tab-props';
import {Button, Note, Section} from '../ui';

/** What the row writes from the timings file: SRT, `Caption[]` JSON, or WebVTT by word or by ayah. */
export type CaptionsFormat = 'srt' | 'json' | 'vtt-words' | 'vtt-ayahs';

/**
 * The Review tab's export row: the captions of the timings file (SRT, `Caption[]` JSON, WebVTT by
 * word or by ayah) written into the project, the YouTube chapters and description copied to the
 * clipboard, and the thumbnail still set to the passage. Changes neither the timings nor the
 * composition's props.
 */
export const ExportRow: React.FC<Pick<TabProps, 'props' | 'project'>> = ({props, project}) => {
  const {busy} = useStudioState();
  const t = useT();
  const [markers, setMarkers] = useState(false);
  /** Text the clipboard refused, shown selected for the user to copy. */
  const [manual, setManual] = useState<string | null>(null);
  const resolved = resolvedOf(props);
  const working = busy !== null;
  const noFile = !props.timingsFile;

  /**
   * Writes the captions of the timings file into the project. The file, as the edits read it, not
   * `resolved.timings` (cut to the range, and moved for a recitation): the captions follow the audio file.
   */
  const exportCaptions = (format: CaptionsFormat) => {
    const source = props.timingsFile;
    const withMarkers = markers;
    // An ayah text has the Unicode words of its range: a word the sidecar does not name gets them, not its id.
    const unicode: Readonly<Record<string, string>> =
      resolved !== null && isAyahTextResolved(resolved) ? resolved.text.words : {};
    void runStudioTask(tNow('review.busy.reading'), async () => {
      const file = await readTimingsFile(source);
      const options = {markers: withMarkers, textOf: (id: string) => unicode[id] ?? null};
      const stem = slugify(stemOf(source).replace(/\.timings$/, '')) || 'timings';
      setStudioState({busy: tNow('review.busy.captions')});
      if (format === 'srt' || format === 'json') {
        const captions = toCaptions(file, options);
        const path =
          format === 'srt'
            ? await writeFile(projectPath(project, `${stem}.srt`), captionsToSrt(captions))
            : await writeJsonFile(projectPath(project, `${stem}.captions.json`), captions);
        setStudioState({
          notice: tNow(format === 'srt' ? 'review.notice.srt' : 'review.notice.captions', {
            path,
            count: captions.length,
          }),
        });
        return;
      }
      const cues = toCaptionCues(file, options);
      const byAyah = format === 'vtt-ayahs';
      const vtt = captionsToVtt(cues, {align: 'start', lines: byAyah ? 'ayah' : 'word'});
      const path = await writeFile(projectPath(project, byAyah ? `${stem}.ayahs.vtt` : `${stem}.vtt`), vtt);
      // The cues written: the blank line before each, after the header's.
      const count = vtt.split('\n\n').length - 2;
      setStudioState({notice: tNow('review.notice.vtt', {path, count})});
    });
  };

  const copy = async (text: string, copied: string) => {
    setManual(null);
    if (await copyToClipboard(text)) setStudioState({notice: copied, error: null});
    else {
      setManual(text);
      setStudioState({notice: tNow('review.notice.copyByHand')});
    }
  };

  const copyChapters = () => {
    if (!resolved) return;
    try {
      const chapters = chaptersOf(resolved.timings);
      if (chapters.length === 0) {
        setManual(null);
        setStudioState({notice: tNow('review.notice.noChapters')});
        return;
      }
      void copy(`${chapters.join('\n')}\n`, tNow('review.notice.chaptersCopied', {count: chapters.length}));
    } catch (error) {
      setStudioState({error: describeError(error)});
    }
  };

  const copyDescription = () => {
    if (!resolved) return;
    try {
      void copy(descriptionOf(props, resolved), tNow('review.notice.descriptionCopied'));
    } catch (error) {
      setStudioState({error: describeError(error)});
    }
  };

  /** Saves the passage into `<MushafThumbnail>`'s props and selects it; says so when the Root has none. */
  const thumbnail = () => {
    if (!resolved) return;
    const patch = thumbnailPatchOf(props, resolved.timings);
    void runStudioTask(tNow('review.busy.thumbnail'), async () => {
      const found = await patchOtherComposition(THUMBNAIL_COMPOSITION_ID, patch);
      if (!found)
        throw new MushafStudioError('BAD_STUDIO_PROP', tNow('error.noThumbnail', {id: THUMBNAIL_COMPOSITION_ID}), {
          compositionId: THUMBNAIL_COMPOSITION_ID,
        });
      setStudioState({notice: tNow('review.notice.thumbnail', {id: THUMBNAIL_COMPOSITION_ID, ...patch})});
    });
  };

  return (
    <Section title={t('review.export')}>
      <div style={styles.row} data-mushaf-control="captions-export">
        <Button onClick={() => exportCaptions('srt')} disabled={working || noFile}>
          SRT
        </Button>
        <Button onClick={() => exportCaptions('json')} disabled={working || noFile}>
          {t('review.captionsJson')}
        </Button>
        <Button onClick={() => exportCaptions('vtt-words')} disabled={working || noFile}>
          {t('review.vttWords')}
        </Button>
        <Button onClick={() => exportCaptions('vtt-ayahs')} disabled={working || noFile}>
          {t('review.vttAyahs')}
        </Button>
        <label style={styles.row}>
          <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} />
          <span style={styles.label}>{t('review.markers')}</span>
        </label>
      </div>
      <Note>{t('review.exportNote')}</Note>
      <div style={styles.row} data-mushaf-control="publish">
        <Button onClick={copyChapters} disabled={!resolved}>
          {t('review.copyChapters')}
        </Button>
        <Button onClick={copyDescription} disabled={!resolved}>
          {t('review.copyDescription')}
        </Button>
        <Button onClick={thumbnail} disabled={working || !resolved}>
          {t('review.thumbnail')}
        </Button>
      </div>
      {manual === null ? null : (
        <div>
          <textarea
            aria-label={t('review.copyArea')}
            readOnly
            value={manual}
            rows={6}
            style={{...styles.input, width: '100%', fontFamily: 'monospace'}}
            ref={(area) => area?.select()}
          />
          <Button variant="ghost" onClick={() => setManual(null)}>
            {t('review.closeCopy')}
          </Button>
        </div>
      )}
      <Note>{t('review.publishNote', {id: THUMBNAIL_COMPOSITION_ID})}</Note>
    </Section>
  );
};
