import type * as React from 'react';
import {useEffect, useMemo, useState} from 'react';
import {getChapterSegments, listRecitations, timingsFromCatalogue} from '../../qud';
import type {QudRecitation} from '../../qud/types';
import {describeError, loadOnce, runStudioTask, setStudioState, useStudioState} from '../store';
import {
  AUDIO_EXTENSIONS,
  fileNameFor,
  isUrl,
  patchProps,
  projectPath,
  slugify,
  writeFile,
  writeJsonFile,
} from '../studio-api';
import {styles} from '../styles';
import {ayahCount, surahLabel} from '../surahs';
import {freshRecording, type TabProps} from '../tab-props';
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
  const {catalogue, uploadedAudio, busy} = useStudioState();
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
    void runStudioTask('Fetching the segments...', async () => {
      const segments = await getChapterSegments(query);
      const base = slugify(`${recitation.slug}-${chapter}-${from}-${to}`);
      let audio = segments.audio_url;
      setStudioState({busy: 'Downloading the clip...'});
      try {
        const response = await fetch(segments.audio_url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        audio = await writeFile(projectPath(project, `${base}.mp3`), await response.arrayBuffer());
      } catch (error) {
        setStudioState({
          notice: `The clip could not be downloaded (${describeError(error)}); the composition streams it from the catalogue instead.`,
        });
      }
      const timings = timingsFromCatalogue(segments, {audio});
      const timingsFile = await writeJsonFile(projectPath(project, `${base}.timings.json`), timings);
      setStudioState({busy: 'Updating the composition...'});
      await patchProps(compositionId, {audioFile: audio, timingsFile, ...freshRecording(props)});
      // The clip is what Align works on now, not an earlier upload.
      setStudioState({uploadedAudio: null});
    });
  };

  const upload = (file: File) => {
    void runStudioTask('Copying the recording into public/...', async () => {
      const path = await writeFile(projectPath(project, fileNameFor(file.name)), await file.arrayBuffer());
      setStudioState({
        uploadedAudio: path,
        notice: `${file.name} is now public/${path}. Nothing has been sent anywhere.`,
      });
    });
  };

  const pickPublic = (path: string) => {
    void runStudioTask('Updating the composition...', async () => {
      await patchProps(compositionId, {audioFile: path});
      setStudioState({uploadedAudio: null});
    });
  };

  return (
    <div>
      <Section title="Catalogue">
        {catalogue === null ? (
          <Note>Loading the reviewed recitations of the aligner...</Note>
        ) : (
          <>
            <Field label="Reciter">
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
            <Field label="Surah">
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
                      {surahLabel(number)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div style={styles.row}>
              <span style={styles.label}>Ayahs</span>
              <NumberInput
                label="From ayah"
                value={from}
                min={1}
                max={count}
                onChange={(value) => setVerses({from: value, to: Math.max(value, to)})}
              />
              <span style={styles.label}>to</span>
              <NumberInput
                label="To ayah"
                value={to}
                min={from}
                max={count}
                onChange={(value) => setVerses({from, to: value})}
              />
              <span style={styles.label}>of {count}</span>
            </div>
            <Note>
              The clip of exactly these ayahs is downloaded into public/ with its reviewed word timings; nothing of
              yours is uploaded.
            </Note>
            <Button variant="primary" onClick={useRecitation} disabled={working || !recitation}>
              Use this recitation
            </Button>
          </>
        )}
      </Section>
      <Section title="Own recording">
        <input
          type="file"
          accept="audio/*"
          aria-label="Own recording"
          disabled={working}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = '';
          }}
        />
        {uploadedAudio ? (
          <>
            <Note>
              public/{uploadedAudio} is ready. It stays on this machine until you press Align in the next tab.
            </Note>
            <Button onClick={() => setStudioState({tab: 'align'})}>Go to Align</Button>
          </>
        ) : (
          <Note>The file is copied into public/ so renders can find it; align it in the next tab.</Note>
        )}
      </Section>
      <Section title="Audio already in public/">
        {audioFiles.length === 0 ? (
          <Note>No audio file in public/ yet.</Note>
        ) : (
          <div style={styles.row}>
            <select
              style={{...styles.input, flex: '1 1 auto', width: 'auto'}}
              aria-label="Audio in public/"
              value={publicChoice || (isUrl(props.audioFile) ? '' : props.audioFile)}
              onChange={(e) => setPublicChoice(e.target.value)}
            >
              <option value="">Pick a file</option>
              {audioFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name} ({Math.round(file.sizeInBytes / 1024)} kB)
                </option>
              ))}
            </select>
            <Button onClick={() => publicChoice && pickPublic(publicChoice)} disabled={working || !publicChoice}>
              Use as audio
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
};
