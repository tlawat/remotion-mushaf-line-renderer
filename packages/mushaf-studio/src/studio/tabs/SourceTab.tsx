import type * as React from 'react';
import {useEffect, useMemo, useState} from 'react';
import {getChapterSegments, listRecitations, timingsFromCatalogue} from '../../qud';
import type {QudRecitation} from '../../qud/types';
import {saveRecording} from '../recording';
import {describeError, loadOnce, runStudioTask, setStudioState, t as tNow, useStudioState, useT} from '../store';
import {AUDIO_EXTENSIONS, fileNameFor, isUrl, patchProps, projectPath, slugify, writeFile} from '../studio-api';
import {styles} from '../styles';
import {ayahCount, surahLabel} from '../surahs';
import type {TabProps} from '../tab-props';
import {Button, Field, Note, NumberInput, Section} from '../ui';
import {usePublicFiles} from '../use-public-files';

const groupByReciter = (catalogue: readonly QudRecitation[]): readonly [string, readonly QudRecitation[]][] => {
  const groups = new Map<string, QudRecitation[]>();
  for (const recitation of catalogue) {
    const list = groups.get(recitation.reciter.name_en) ?? [];
    list.push(recitation);
    groups.set(recitation.reciter.name_en, list);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

/** Source: a reviewed recitation from the aligner's catalogue, an own recording, or a file already in `public/`. */
export const SourceTab: React.FC<TabProps> = ({compositionId, props, project}) => {
  const {catalogue, uploadedAudio, busy, language} = useStudioState();
  const t = useT();
  useEffect(() => {
    void loadOnce('catalogue', () => listRecitations());
  }, []);
  const [slug, setSlug] = useState('');
  const [chapterChoice, setChapterChoice] = useState(0);
  const [verses, setVerses] = useState<{readonly from: number; readonly to: number} | null>(null);
  const [publicChoice, setPublicChoice] = useState('');
  const audioFiles = usePublicFiles(AUDIO_EXTENSIONS);
  const groups = useMemo(() => groupByReciter(catalogue ?? []), [catalogue]);

  const recitation = catalogue?.find((entry) => entry.slug === slug) ?? catalogue?.[0];
  const chapter = recitation?.chapters.includes(chapterChoice) ? chapterChoice : (recitation?.chapters[0] ?? 1);
  const count = ayahCount(chapter);
  const from = Math.max(1, Math.min(verses?.from ?? 1, count));
  const to = Math.max(from, Math.min(verses?.to ?? count, count));
  const working = busy !== null;

  const useRecitation = () => {
    if (!recitation) return;
    const query = {slug: recitation.slug, chapter, verseFrom: from, verseTo: to};
    void runStudioTask(tNow('source.busy.segments'), async () => {
      const segments = await getChapterSegments(query);
      const base = slugify(`${recitation.slug}-${chapter}-${from}-${to}`);
      let audio = segments.audio_url;
      setStudioState({busy: tNow('source.busy.clip')});
      try {
        const response = await fetch(segments.audio_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        audio = await writeFile(projectPath(project, `${base}.mp3`), await response.arrayBuffer());
      } catch (error) {
        setStudioState({notice: tNow('source.notice.clipFailed', {error: describeError(error)})});
      }
      const timings = timingsFromCatalogue(segments, {audio});
      await saveRecording({
        compositionId,
        props,
        project,
        audioFile: audio,
        timings,
        timingsName: `${base}.timings.json`,
      });
      // The clip is what Align works on now, not an earlier upload.
      setStudioState({uploadedAudio: null});
    });
  };

  const upload = (file: File) => {
    void runStudioTask(tNow('source.busy.copying'), async () => {
      const path = await writeFile(projectPath(project, fileNameFor(file.name)), await file.arrayBuffer());
      setStudioState({uploadedAudio: path, notice: tNow('source.notice.copied', {name: file.name, path})});
    });
  };

  const pickPublic = (path: string) => {
    void runStudioTask(tNow('busy.updating'), async () => {
      await patchProps(compositionId, {audioFile: path});
      setStudioState({uploadedAudio: null});
    });
  };

  return (
    <div>
      <Section title={t('source.catalogue')}>
        {catalogue === null ? (
          <Note>{t('source.loadingCatalogue')}</Note>
        ) : (
          <>
            <Field label={t('source.reciter')}>
              {(id) => (
                <select
                  id={id}
                  style={styles.input}
                  value={recitation?.slug ?? ''}
                  onChange={(e) => setSlug(e.target.value)}
                >
                  {groups.map(([name, entries]) => (
                    <optgroup key={name} label={name}>
                      {entries.map((entry) => (
                        <option key={entry.slug} value={entry.slug}>
                          {entry.riwayah} · {entry.style} · {entry.channel} · {entry.slug}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('source.surah')}>
              {(id) => (
                <select
                  id={id}
                  style={styles.input}
                  value={chapter}
                  onChange={(e) => {
                    setChapterChoice(Number(e.target.value));
                    setVerses(null);
                  }}
                >
                  {(recitation?.chapters ?? []).map((number) => (
                    <option key={number} value={number}>
                      {surahLabel(number, language)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div style={styles.row}>
              <span style={styles.label}>{t('source.ayahs')}</span>
              <NumberInput
                label={t('source.fromAyah')}
                value={from}
                min={1}
                max={count}
                onChange={(value) => setVerses({from: value, to: Math.max(value, to)})}
              />
              <span style={styles.label}>{t('source.to')}</span>
              <NumberInput
                label={t('source.toAyah')}
                value={to}
                min={from}
                max={count}
                onChange={(value) => setVerses({from, to: value})}
              />
              <span style={styles.label}>{t('source.of', {count})}</span>
            </div>
            <Note>{t('source.catalogueNote')}</Note>
            <Button variant="primary" onClick={useRecitation} disabled={working || !recitation}>
              {t('source.use')}
            </Button>
          </>
        )}
      </Section>
      <Section title={t('source.own')}>
        <input
          type="file"
          accept="audio/*"
          aria-label={t('source.own')}
          disabled={working}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = '';
          }}
        />
        {uploadedAudio ? (
          <>
            <Note>{t('source.ready', {path: uploadedAudio})}</Note>
            <Button onClick={() => setStudioState({tab: 'align'})}>{t('source.goToAlign')}</Button>
          </>
        ) : (
          <Note>{t('source.ownNote')}</Note>
        )}
      </Section>
      <Section title={t('source.publicTitle')}>
        {audioFiles.length === 0 ? (
          <Note>{t('source.noPublicAudio')}</Note>
        ) : (
          <div style={styles.row}>
            <select
              style={{...styles.input, flex: '1 1 auto', width: 'auto'}}
              aria-label={t('source.publicSelect')}
              value={publicChoice || (isUrl(props.audioFile) ? '' : props.audioFile)}
              onChange={(e) => setPublicChoice(e.target.value)}
            >
              <option value="">{t('common.pickFile')}</option>
              {audioFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {t('source.fileSize', {name: file.name, size: Math.round(file.sizeInBytes / 1024)})}
                </option>
              ))}
            </select>
            <Button onClick={() => publicChoice && pickPublic(publicChoice)} disabled={working || !publicChoice}>
              {t('source.useAsAudio')}
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
};
