// The panel's strings, in English and Arabic: every word the dock shows goes through `translate()`
// (in components through the store's `useT()`). A message is a string with `{name}` placeholders,
// or, where the count changes the words, one string per plural category of the language
// (`Intl.PluralRules`), `other` always present. Technical names (QUD, SRT, JSON, GPU, public/, the
// props' own names) stay as they are in both languages.

/** The panel's languages. */
export type StudioLanguage = 'en' | 'ar';

/** The language switch, in each language's own name. */
export const STUDIO_LANGUAGES: readonly {readonly id: StudioLanguage; readonly name: string}[] = [
  {id: 'en', name: 'English'},
  {id: 'ar', name: 'العربية'},
];

export const isStudioLanguage = (value: unknown): value is StudioLanguage => value === 'en' || value === 'ar';

/** The dock's `dir`: Arabic lays it out right to left. */
export const directionOf = (language: StudioLanguage): 'ltr' | 'rtl' => (language === 'ar' ? 'rtl' : 'ltr');

/** A message: plain, or one form per plural category (`other` is the fallback). */
export type Message = string | (Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & {readonly other: string});

const EN = {
  'panel.title': 'Mushaf Studio',
  'panel.open': 'Open the Mushaf panel',
  'panel.collapse': 'Collapse the panel',
  'panel.moveLeft': 'Move the panel to the left edge',
  'panel.moveRight': 'Move the panel to the right edge',
  'panel.tabs': 'Mushaf Studio tabs',
  'panel.language': 'Language',
  'panel.tabCrashed':
    'This tab stopped on an error (see the status line). Reload it; if it stops again, check the props.',
  'panel.reload': 'Reload',
  'panel.rolledBack':
    "Some of the panel's changes are no longer in the props ({fields}): an undo, a Reset in the Props sidebar, or a sidebar edit made while the panel was saving took them out. Restore puts them back; × keeps the props as they are.",
  'panel.rolledBackMore': '{fields} and {count} more',
  'panel.hostMoved':
    "The template's track {track} has moved: second {live} now plays at the recitation's start, but the timings start at second {saved}.",
  'panel.updateTiming': 'Update timing',
  'panel.hostGone':
    "The composition follows the template's track {track}, but no track on the timeline plays {file} any more: the highlight follows timings of a recording that is not heard.",
  'panel.followNow': 'Follow the track playing now',
  'panel.busy.timing': 'Updating the timing...',
  'panel.notice.timing': 'The timings follow {track} again, from second {offset}.',
  'panel.restore': 'Restore',
  'panel.keepAsIs': 'Keep the props as they are',
  'panel.busy.restoring': "Restoring the panel's values...",
  'panel.slot': 'Slot',
  'panel.slotPicker': 'Which slot of this template the panel edits',
  'panel.slotEmpty':
    'This template has no recitation under {key} yet. Pick a source: the first save writes complete props there, and the template keeps its own.',
  'panel.slotError': 'The {key} slot shows nothing: {message}',

  'tab.source': 'Source',
  'tab.look': 'Look',
  'tab.align': 'Align',
  'tab.review': 'Review',
  'tab.lines': 'Lines',
  'tab.text': 'Text',

  'status.ready': 'Ready.',
  'status.dismiss': 'Dismiss',
  'status.loadingCatalogue': 'Loading the catalogue...',
  'status.loadingTranslations': 'Loading the translation list...',
  'status.retryIn': 'Retry in {seconds} s.',
  'status.loadingTafsirs': 'Loading the tafsir list...',
  'status.busyRefused': 'The panel is busy ({busy}); wait for it to finish before {task}.',

  'common.none': 'none',
  'common.pickFile': 'Pick a file',
  'busy.updating': 'Updating the composition...',
  'unit.seconds': 's',

  'error.publicFile':
    'public/{path} could not be read (HTTP {status}). Pick a file that is in public/, or put the recording there through the Source tab.',
  'error.timingsFile':
    'timingsFile {path} could not be read (HTTP {status}). Check the path (under public/) or the URL.',
  'error.textAfterTimings':
    'The timings are in public/{timingsFile}, but the Quran text for {surah}:{fromAyah}-{toAyah} could not be fetched: {error}; fetch it in the Text tab, then pick the timings again.',
  'recording.notice.versioned':
    'public/{kept} has your edits or other timings, so it is kept: the new timings are public/{path}, and the composition uses them.',
  'recording.notice.cleared': {
    one: 'Cleared {files}: it is not for the new passage, {passage}. Fetch it again in the Text tab.',
    other:
      'Cleared {count} files ({files}): they are not for the new passage, {passage}. Fetch them again in the Text tab.',
  },
  'recording.notice.sameRecording': 'The same recording as before: the ayah range and the line splits are kept.',
  'recording.notice.untracked':
    "The composition no longer follows the template's track {track}: it plays {file} itself, so the template must mute that track or both play.",

  'source.modes': 'Where the audio comes from',
  'source.mode.catalogue': 'Download from the catalogue',
  'source.mode.upload': 'Upload my recording',
  'source.mode.public': 'A file already in public/',
  'source.mode.track': 'A track in this video',
  'source.now.none': 'Now: no audio yet. Pick where it comes from below.',
  'source.now.track':
    "Now: the template's track {track} plays {file}, from second {offset} at the recitation's start; the composition plays no audio of its own.",
  'source.now.trackGone':
    "Now: the composition follows the template's track {track}, but no track on the timeline plays {file}: nothing of the recitation is heard.",
  'source.now.missing': 'Now: public/{path} is missing, so the clip streams from {host} instead, in renders too.',
  'source.now.streaming': 'Now: streaming {url}. Previews and renders need {host} to be online.',
  'source.now.catalogue': "Now: public/{path}, downloaded from {host} with the catalogue's reviewed timings.",
  'source.now.catalogueNoHost': "Now: public/{path}, downloaded with the catalogue's reviewed timings.",
  'source.now.aligned': 'Now: public/{path}, timed by aligner.qud.dev.',
  'source.now.file': 'Now: public/{path}.',
  'source.now.otherTimings':
    'Now: public/{path}; its timings were made for another recording ({timings}): align this file to time its words.',
  'source.now.download': 'Download it into public/',
  'source.loadingCatalogue': 'Loading the reviewed recitations of the aligner...',
  'source.reciter': 'Reciter',
  'source.surah': 'Surah',
  'source.ayahs': 'Ayahs',
  'source.fromAyah': 'From ayah',
  'source.to': 'to',
  'source.toAyah': 'To ayah',
  'source.of': 'of {count}',
  'source.catalogue.does':
    'Downloads the word timings from aligner.qud.dev and the audio of ayahs {from}-{to} from {host} into public/{dir}/. Nothing of yours is uploaded.',
  'source.catalogue.hostUnknown': "the aligner's audio host (named in its answer)",
  'source.download': 'Download into public/',
  'source.failed':
    'The audio could not be downloaded from {host} ({error}). Nothing was saved: the composition plays what it played before.',
  'source.retry': 'Retry the download',
  'source.stream': 'Stream from {host}',
  'source.streamNote':
    "Streaming saves the clip's URL as audioFile: previews and renders then need {host} to be online. The Now line offers to download it later.",
  'source.riwayahWarning':
    'This recitation is in the {riwayah} riwayah, but the mushaf this panel renders is the Hafs print (KFGQPC V4): its words and their spelling can differ, so the words highlighted may not be the words recited, and some may stay untimed.',
  'source.riwayahConfirm': 'Use the {riwayah} recitation with the Hafs mushaf anyway',
  'source.riwayahConfirmFirst': 'Confirm using the {riwayah} recitation with the Hafs mushaf first.',
  'source.replaces.recording':
    'Replaces: the audio and the timings; a new recording also resets the ayah range and the line splits.',
  'source.replaces.nothingYet':
    'Replaces nothing yet: the composition plays what it plays until Align saves the new timings.',
  'source.replaces.audioOnly': 'Replaces: the audio only (audioFile); the timings, the ayah range and the splits stay.',
  'source.replaces.audioOnlyTrack':
    "Replaces: the audio; the composition stops following the template's track {track} and plays this file itself (the template must mute its track, or both play). The timings, the ayah range and the splits stay.",
  'source.replaces.stopsTrack':
    "It also stops following the template's track {track}: the composition plays its own audio again, so the template must mute that track, or both play.",
  'source.replaces.track':
    "Replaces: the audio (the template's track plays it); the timings stay until you align the track.",
  'source.replaces.trackSame':
    'Replaces: none of the timings (they are of this file); the composition stops playing it itself.',
  'source.replaces.trackNew': 'Replaces nothing yet: the composition follows this track, and Align times its words.',
  'source.upload.does':
    'Copies your file into public/{dir}/; it stays on this machine. Align then uploads it to aligner.qud.dev, and says so before it sends anything.',
  'source.upload.button': 'Choose a file to copy into public/',
  'source.upload.input': 'Your recording',
  'source.ready': 'public/{path} is ready. It stays on this machine until you press Align in the next tab.',
  'source.goToAlign': 'Go to Align',
  'source.noPublicAudio': 'No audio or video file in public/ yet.',
  'source.publicSelect': 'Audio or video in public/',
  'source.fileSize': '{name} ({size} kB)',
  'source.public.use': 'What to do with the file',
  'source.public.align': 'Align this file',
  'source.public.replace': 'Replace the audio only (keep the current timings)',
  'source.public.alignDoes': 'Stages the file for Align, which uploads it to aligner.qud.dev and saves its timings.',
  'source.public.stage': 'Stage it for Align',
  'source.public.replaceWarning':
    'The word highlight keeps following the current timings ({timings}): unless this file is the same recording, the words will be marked at the wrong times.',
  'source.public.replaceButton': 'Replace the audio',
  'source.public.isCurrent': 'This is the file the composition plays now: there is nothing to replace.',
  'source.track.none': 'The template has no audio or video track on the timeline.',
  'source.track.noneUsable':
    "None of the template's tracks can be followed: only a track that plays at speed 1 and does not loop can.",
  'source.track.select': 'Track',
  'source.track.option': "{label} · {kind} · second {offset} at the recitation's start",
  'source.track.optionLater': "{label} · {kind} · starts {seconds} s after the recitation's start",
  'source.track.kind.audio': 'audio',
  'source.track.kind.video': 'video',
  'source.track.limit.rate': '(another speed: not supported)',
  'source.track.limit.loop': '(loops: not supported)',
  'source.track.toPublic': 'a copy in public/',
  'source.track.does':
    "The composition plays no audio of its own and follows this track: audioFile becomes {file}, and hostAudio its timing (second {offset} at the recitation's start). Align or Review it as usual.",
  'source.track.use': 'Use this track',
  'source.track.stop': 'Play audioFile in the composition again',
  'source.busy.segments': 'Fetching the segments...',
  'source.busy.clipFrom': 'Downloading the clip from {host}...',
  'source.busy.downloadNow': 'Downloading the audio from {host} into public/...',
  'source.busy.copying': 'Copying the recording into public/...',
  'source.busy.track': 'Following the track...',
  'source.notice.copied': '{name} is now public/{path}. Nothing has been sent anywhere.',
  'source.notice.staged': 'public/{path} is staged for Align. Nothing has been sent anywhere yet.',
  'source.notice.streaming': "audioFile is now the clip's URL: previews and renders need {host} to be online.",
  'source.notice.downloaded': 'public/{path} is in place: previews and renders no longer need {host}.',
  'source.notice.tracked':
    'The composition follows {track}. Its timings are of another file: align the track in the Align tab.',
  'source.notice.trackedSame':
    'The composition follows {track}, and its timings are of this file: check them in Review.',
  'source.notice.trackedNew': 'The composition follows {track}. Align it in the Align tab to time its words.',
  'source.notice.untracked': 'The composition plays {file} itself again.',

  'look.note':
    'A look sets the style props in one click, never where you placed the lines (their vertical position, offsets and margins); change any of them in the Props sidebar afterwards. The recitation, the timings and the translation files are left as they are.',
  'look.slotNote': "In a slot the template's box decides the size: a look leaves layout.aspect as it is.",
  'look.looks': 'Looks',
  'look.active': 'The props have this look',
  'look.undo': 'Undo {name}',
  'look.undoTitle': 'Put back what {name} changed',
  'look.busy.applying': 'Applying {name}...',
  'look.busy.undoing': 'Undoing {name}...',
  'look.notice.nothingToUndo': 'Nothing of {name} is left to undo: every field it set has been changed since.',
  'look.notice.keptChanged': '{name} is undone; the fields changed since it was applied keep their new values.',
  'look.chip.page': 'Page',
  'look.chip.ink': 'Ink',
  'look.chip.currentWord': 'Current word',
  'look.chip.rosette': 'Rosette',
  'look.chip.translation': 'Translation',

  'align.audioTitle': 'Audio to align',
  'align.noAudio':
    'Nothing to align yet. Put a recording into public/ in the Source tab (upload one, or pick a file already there) to align it.',
  'align.catalogue':
    'Already timed by the catalogue (reviewed word timings): there is nothing to align. Adjust a word in Review, or pick another source in the Source tab.',
  'align.from.upload': 'Your upload, staged in Source: the composition does not play it yet.',
  'align.from.public': 'A file of public/ staged in Source: the composition does not play it yet.',
  'align.from.current': 'What the composition plays now.',
  'align.from.track': "The template's track {track}, which the composition follows.",
  'align.from.url':
    'What the composition streams. This browser fetches it to upload it; if {host} does not allow that, the aligner downloads it itself.',
  'align.stopsTrack':
    "Saving the timings also stops following the template's track {track}: the composition plays this recording itself, so the template must mute that track, or both play.",
  'align.video': 'A video: its sound is decoded in this browser and sent as a WAV file.',
  'align.busy.decoding': "Decoding the video's sound...",
  'align.busy.byUrl': 'The aligner is downloading the audio from {host}...',
  'align.options': 'Options',
  'align.model': 'Model',
  'align.device': 'Device',
  'align.riwayah': 'Riwayah',
  'align.riwayahWarning':
    'The mushaf this panel renders is the Hafs print (KFGQPC V4): a {riwayah} recitation can differ from it in words and their spelling, so the words the aligner hears may not match the words on the page, and some may stay untimed.',
  'align.riwayahConfirm': 'Align the {riwayah} recitation against the Hafs mushaf anyway',
  'align.riwayahConfirmFirst': 'Confirm aligning the {riwayah} recitation against the Hafs mushaf first.',
  'align.token': 'Hugging Face token (optional, for your own GPU quota)',
  'align.remember': 'Remember for this browser',
  'align.forget': 'Forget',
  'align.tokenSession':
    "The token is kept in this browser tab's sessionStorage only: never written to a file, to the props or to the Root file, and sent to the aligner alone. Remembered for this browser, it stays on this computer and is sent only to aligner.qud.dev.",
  'align.tokenRemembered':
    "The token is remembered in this browser's localStorage: it stays on this computer, is never written to a file, to the props or to the Root file, and is sent only to aligner.qud.dev. Forget removes it.",
  'align.title': 'Align',
  'align.consent':
    'Your audio leaves this machine only when you press Align: it is uploaded to the QUD Universal Aligner (aligner.qud.dev), which keeps it for a few hours; the alignment it returns is CC-BY-4.0. The same file aligned again within those hours reuses that session instead of being uploaded again.',
  'align.button': 'Align',
  'align.lastSession':
    'Last alignment in this session: {audio} ({model}, {device}, {riwayah}), session {id}. Split and re-align in Review use it.',
  'align.busy.reading': 'Reading the audio...',
  'align.busy.checking': 'Looking for an earlier alignment of this file...',
  'align.busy.aligning': 'Aligning...',
  'align.busy.wordTimes': 'Fetching the word times...',
  'align.notice.reused':
    'This file was aligned at {time} and the aligner still has that session: nothing was uploaded again.',
  'align.notice.device': 'The aligner ran on the {used}, the {asked} was not available.',
  'align.stage.queuedGpu': 'Queued for the GPU',
  'align.stage.queuedCpu': 'Queued for the CPU',
  'align.stage.segmenting': 'Segmenting',
  'align.stage.transcribing': 'Transcribing',
  'align.stage.matching': 'Matching to the mushaf',
  'align.stage.recovering': 'Recovering missed words',
  'align.stage.building': 'Building the segments',

  'review.nothing': 'Nothing to review yet: pick a recitation in Source or align a recording in Align.',
  'review.summary': '{segments} segments, {words} words',
  'review.summaryAlignment': ', {low} under {percent}%, {missing} with missing words, {errors} with errors',
  'review.summaryIncomplete': {one: ', {count} incomplete ayah', other: ', {count} incomplete ayahs'},
  'review.summaryRepeats': ', {repeats} with repeats',
  'review.showDoubts': 'Show doubts on the timeline',
  'review.keyboardLabel': 'Review: j and k go through the doubtful words, ? lists the keys',
  'review.keys.title': 'Keyboard shortcuts',
  'review.keys.step': 'Next / previous doubtful word: seek to it and open its segment',
  'review.keys.start': "Move the selected word's start 20 ms earlier / later",
  'review.keys.end': "Move the selected word's end 20 ms earlier / later",
  'review.keys.apply': 'Apply the pending edits',
  'review.keys.play': 'Play / pause',
  'review.keys.help': 'Show or hide this list',
  'review.keys.focus': 'The keys work while the Review tab has the focus (click in it) and no field is being typed in.',
  'review.noDoubtful': 'No doubtful word to go to.',
  'review.selectFirst': 'Select a word first: j or k, or click its text in an open segment.',
  'review.waveform': 'Waveform',
  'review.zoom': 'Zoom',
  'review.zoomAround': '±{padding} {unit} around segment #{segment}',
  'review.zoomWhole': 'The whole recording; open a segment to zoom to it.',
  'review.segments': 'Segments',
  'review.showWords': 'Show the words',
  'review.hideWords': 'Hide the words',
  'review.noMatch': 'no match',
  'review.flagMissing': 'missing words',
  'review.flagRepeated': 'repeated',
  'review.flagIncomplete': 'incomplete',
  'review.ayahs': 'Ayahs ({count})',
  'review.wordCount': {one: '{count} word', other: '{count} words'},
  'review.wordStart': '{id} start',
  'review.wordEnd': '{id} end',
  'review.edits': 'Edits',
  'review.apply': 'Apply edits ({count})',
  'review.discard': 'Discard',
  'review.applyNote': 'Applying rewrites public/{file} with the new times and logs the edit in its alignment sidecar.',
  'review.export': 'Export',
  'review.captionsJson': 'Captions JSON',
  'review.markers': 'include ayah markers',
  'review.importCaptions': 'Import captions…',
  'review.importCaptionsHint':
    'Read a Captions JSON back (the Caption[] the Captions JSON button writes, edited in a caption editor) and write its times into the timings file.',
  'review.exportNote':
    "The captions of the whole timings file, timed to the audio file. The JSON is the Caption[] that Remotion's caption tooling (@remotion/captions) reads.",
  'review.splitTitle': 'Split segments...',
  'review.maxVerses': 'Max verses',
  'review.maxVersesLabel': 'Max verses',
  'review.maxWords': 'max words',
  'review.maxWordsLabel': 'Max words',
  'review.maxSeconds': 'Max seconds (30 disables)',
  'review.maxDurationLabel': 'Max duration',
  'review.stopSigns': 'only at stop signs',
  'review.splitButton': 'Split segments',
  'review.sessionHint': 'Align this audio in this session first: the aligner keeps a session for a few hours only.',
  'review.realignTitle': 'Re-align with these boundaries (advanced)',
  'review.boundaryNote':
    "Each boundary is a stretch of the recording the aligner transcribes and matches on its own, in seconds of the recording file (not of the composition). Every segment is listed, those outside the ayah range too: a re-align replaces the whole file's alignment.",
  'review.boundaryStart': 'Boundary {n} start',
  'review.boundaryEnd': 'Boundary {n} end',
  'review.removeBoundary': 'Remove this boundary',
  'review.addBoundary': 'Add boundary',
  'review.resetBoundaries': 'Reset from segments',
  'review.realignButton': 'Re-align',
  'review.editLog': 'Edit log: {edits}',
  'review.editEntry': '{kind} at {at} ({note})',
  'review.clickHint': 'Click a segment or an ayah to play it from its start;',
  'review.thresholdDefault': 'the threshold is the default {percent}% (this composition has no review props).',
  'review.thresholdProps':
    "the threshold ({percent}%) is the composition's review.confidenceThreshold in the Props sidebar.",
  'review.busy.reading': 'Reading the timings file...',
  'review.busy.writing': 'Writing the timings...',
  'review.busy.captions': 'Writing the captions...',
  'review.busy.splitting': 'Splitting the segments...',
  'review.busy.realigning': 'Re-aligning...',
  'review.vttWords': 'VTT (words)',
  'review.vttAyahs': 'VTT (ayahs)',
  'review.copyChapters': 'Copy chapters',
  'review.copyDescription': 'Copy description',
  'review.thumbnail': 'Thumbnail',
  'review.copyArea': 'Text to copy',
  'review.closeCopy': 'Close',
  'review.publishNote':
    'Chapters and description are for YouTube, timed to the video. Thumbnail sets the {id} still to this passage, with the reciter as its title, and opens it.',
  'review.busy.thumbnail': 'Saving the thumbnail...',
  'review.notice.vtt': {
    one: 'public/{path} is written: {count} cue, timed to the audio file.',
    other: 'public/{path} is written: {count} cues, timed to the audio file.',
  },
  'review.notice.copyByHand':
    'The browser did not let the panel copy: the text is selected below, copy it with Ctrl+C (⌘C).',
  'review.notice.noChapters':
    'No chapters: the passage is too short for YouTube chapters (fewer than 3 chapters 10 s apart).',
  'review.notice.chaptersCopied': {
    one: '{count} chapter is copied: paste it into the video description.',
    other: '{count} chapters are copied: paste them into the video description.',
  },
  'review.notice.descriptionCopied': 'The description is copied: paste it into YouTube.',
  'review.notice.thumbnail': '{id} now shows {surah}:{fromAyah}-{toAyah} and is open in the Studio.',
  'review.notice.thumbnailSaved':
    '{id} now shows {surah}:{fromAyah}-{toAyah}. The Studio stays on this template: select {id} in the sidebar to see it.',
  'error.noThumbnail':
    'The Root has no {id} composition: register <MushafThumbnail> under the id {id} (see the app README), then press Thumbnail again.',
  'review.notice.srt': {
    one: 'public/{path} is written: {count} cue, timed to the audio file.',
    other: 'public/{path} is written: {count} cues, timed to the audio file.',
  },
  'review.notice.captions': {
    one: 'public/{path} is written: {count} caption, timed to the audio file.',
    other: 'public/{path} is written: {count} captions, timed to the audio file.',
  },
  'review.notice.captionsImported': {
    one: '{name} is imported: the times of its {count} caption are in the timings file, and its edit log has the import.',
    other:
      '{name} is imported: the times of its {count} captions are in the timings file, and its edit log has the import.',
  },
  'review.notice.captionsUnchanged': '{name} changes no time: the timings file is left as it is.',
  'error.captionsNotArray':
    '{name} is not a Captions JSON: expected an array of captions ({text, startMs, endMs, ...}) like the one the Captions JSON button writes. Export it, edit its times, and import it again.',
  'error.captionNotObject':
    '{name}: caption {index} is {found}, not a caption {text, startMs, endMs}. Import the Captions JSON this row writes, edited without adding or removing captions.',
  'review.notice.nudgesReplaced': {
    one: 'The new alignment replaces the times of the {count} nudge made before; the edit log keeps it.',
    other: 'The new alignment replaces the times of the {count} nudges made before; the edit log keeps them.',
  },

  'waveform.label': 'Waveform of the recording: click to seek',
  'waveform.decoding': 'Decoding the recording...',
  'waveform.failed': 'No waveform: {error}',
  'waveform.retry': 'Try again',
  'waveform.noWebAudio': 'this browser cannot decode audio here (no Web Audio).',
  'waveform.httpError': '{url} could not be read (HTTP {status}).',
  'waveform.tooLarge': 'the recording is {size} MB, too large to draw here.',

  'compare.title': 'Compare with another timings file...',
  'compare.with': 'Compare with…',
  'compare.busy': 'Reading the timings files...',
  'compare.summary':
    '{matched} words in both: median {median} {unit}, p90 {p90} {unit}, max {max} {unit} apart; {onlyA} only in this file, {onlyB} only in {other}.',
  'compare.word': 'Word',
  'compare.thisFile': 'This file',
  'compare.otherFile': 'Other',
  'compare.diffMs': 'Δ ms',
  'compare.note':
    "Each word of this file against the same word of the other (a repeated word by the order of its recitations), in each file's own times; the 50 largest differences first. Click a row to seek to the word.",

  'lines.noPrintedLines':
    'This composition has no printed lines: it shows one ayah at a time as Unicode text, timed by the ayahs of the timings file.',
  'lines.noLines': 'No lines yet: the composition resolves them from the timings file.',
  'lines.busy.splits': 'Updating the splits...',
  'lines.slots': 'Slots ({count})',
  'lines.pageLine': 'p{page} l{line}',
  'lines.slot': 'slot {n}',
  'lines.splitBefore': 'Split the line before {id}',
  'lines.splits': 'Splits ({count})',
  'lines.splitsHint': 'Click a word that is not the first of its slot to start a new timed slot at it.',
  'lines.splitAt': 'p{page} l{line} at word {word}',
  'lines.removeSplit': 'Remove this split',
  'lines.dropped': {
    one: 'A split does not fit the passage any more (the ayah range or slice changed): the preview leaves it out, and a render refuses it.',
    other:
      '{count} splits do not fit the passage any more (the ayah range or slice changed): the preview leaves them out, and a render refuses them.',
  },
  'lines.removeDropped': {
    one: 'Remove the split that does not fit',
    other: 'Remove the {count} splits that do not fit',
  },
  'lines.notApplied': 'not applied',
  'lines.noPages': 'No pages yet: the composition resolves them from the timings file.',
  'lines.pages': 'Pages ({count})',
  'lines.page': 'Page {page}',
  'lines.seekPage': 'Seek to page {page}',
  'lines.recitedLines': {one: '{count} line recited', other: '{count} lines recited'},
  'lines.pageNote': 'The page shows its lines as printed: click a page to seek to it. There are no splits to make.',

  'text.needsTimings': 'Fetching needs the timings: pick a recitation or align a recording first.',
  'text.crossesSurahs':
    'Fetching asks quran.com for one surah, and these timings cross surahs: fetch with a composition of each surah.',
  'text.quranText': 'Quran text',
  'text.now': 'Now: {file}',
  'text.recitationNeedsNoText':
    'The printed lines need no text file; a MushafAyahText composition reads this one as its textFile.',
  'text.script': 'Script',
  'text.fetchText': 'Fetch the text of this passage',
  'text.ayahTranslation': 'Ayah translation',
  'text.loadingList': "Loading quran.com's translation list...",
  'text.language': 'Language',
  'text.translation': 'Translation',
  'text.fetchForPassage': 'Fetch for this passage',
  'text.none': 'None',
  'text.wordByWord': 'Word by word',
  'text.glossNow': 'Gloss: {gloss}; transliteration: {transliteration}',
  'text.glossLanguage': 'Language (quran.com code, en, ur, id, ...)',
  'text.fetchWordTranslation': 'Fetch translation',
  'text.fetchWordTransliteration': 'Fetch transliteration',
  'text.noGloss': 'No gloss',
  'text.noTransliteration': 'No transliteration',
  'text.glossOnlyRecitation': 'Word glosses apply to MushafRecitation (an ayah text and a page show none).',
  'text.publicTitle': 'Use a file from public/',
  'text.noJson': 'No JSON file in public/ yet.',
  'text.jsonSelect': 'JSON file in public/',
  'text.asTranslation': 'As translation',
  'text.asGloss': 'As gloss',
  'text.asTransliteration': 'As transliteration',
  'text.qulNote':
    "Files downloaded from QUL (qul.tarteel.ai, login needed) can be dropped into public/ and chosen here in any of QUL's shapes: key/value, nested arrays, footnotes as tags, inline footnotes, text chunks, word by word.",
  'text.busy.checking': 'Checking the file...',
  'text.busy.fetching': 'Fetching {name}...',
  'text.busy.text': 'Fetching the {script} text...',
  'text.busy.wordTranslation': 'Fetching the word translation...',
  'text.busy.wordTransliteration': 'Fetching the word transliteration...',
  'text.notice.writtenRecitation':
    'public/{path} is written. This composition sets the printed lines and reads no Quran text; a MushafAyahText composition reads it as its textFile.',
  'text.notice.wrongScript':
    'public/{path} is written, but textFile is left as it is: font "{font}" sets {fontScript} text, not {script}.',
  'text.notice.textFileSet': "public/{path} is written and is now the composition's textFile.",
  'text.noTextGroup': 'This composition takes no translation.',
  'text.noEndCard': 'This composition has no end card, so no tafsir or surah introduction.',
  'text.layers': 'Translation layers ({count}/{max})',
  'text.noLayers': 'No translation layer yet.',
  'text.layer': '{n}. {file} (font: {font})',
  'text.layerUp': 'Move this layer up',
  'text.layerDown': 'Move this layer down',
  'text.layerFetch': 'Replace with the selected translation, fetched for this passage',
  'text.layerRemove': 'Remove this layer',
  'text.addLayer': 'Add a layer: fetch for this passage',
  'text.layersNote':
    "Up to {max} layers, shown in this order; a new one's font is picked for its script (font: auto). Size and colour are in the Props sidebar.",
  'text.asLayer': 'As a translation layer',
  'text.tafsir': 'Tafsir (end card)',
  'text.loadingTafsirs': "Loading quran.com's tafsir list...",
  'text.tafsirResource': 'Tafsir',
  'text.fetchTafsir': 'Fetch the tafsir for this passage',
  'text.surahInfo': 'Surah introduction (end card)',
  'text.surahInfoLanguage': 'Language (quran.com code, en, ar, ur, ...)',
  'text.fetchSurahInfo': 'Fetch surah info',
  'text.endCardNote': 'The end card shows: {show}. Fetching sets what it shows; its length is endCard.seconds.',
  'text.busy.tafsir': 'Fetching {name}...',
  'text.busy.surahInfo': 'Fetching the surah introduction...',
  'text.notice.endCard': 'public/{path} is written and the end card shows it.',

  'inactive.translationHidden':
    'Not shown now: text.translationPosition is none. The files are still read; pick a position in the Props sidebar to show them.',
  'inactive.glossHidden':
    'Not shown now: text.glossPosition is none. Set it to strip or interlinear in the Props sidebar to show these files.',
  'inactive.endCardFile':
    'Not shown now: endCard.show is {show}. Fetching again sets it to {kind}, or pick {kind} in the Props sidebar.',
  'inactive.pageColour':
    "background.kind is {kind}, so a look's page colour shows only on what the composition paints itself (the title card, the counter, the end card).",
  'inactive.pageColourLegacy':
    'layout.backgroundImage (a legacy field) puts an image over the page colour. The looks that set colours empty it; a frame look keeps it.',

  'project.menu': 'Project',
  'project.export': 'Export project',
  'project.import': 'Import project...',
  'project.busy.export': 'Exporting the project...',
  'project.busy.import': 'Importing the project...',
  'project.exported':
    'public/{path} is written and downloaded: the props and the list of the files they use. Share it with those files.',
  'project.imported': {
    one: '{name} is imported: the props are saved; its {count} file is in public/.',
    other: '{name} is imported: the props are saved; its {count} files are in public/.',
  },
  'project.invalid': 'The project file is not valid: {problem}',
  'project.notObject': 'it is not a JSON object.',
  'project.badVersion': 'version is {version}; this panel reads version 1.',
  'project.noComposition': 'compositionId is missing.',
  'project.propsNotObject': 'props is not an object.',
  'project.filesNotList': 'files is not a list of paths.',
  'project.badProps': 'props.{path}: {message}.',
  'project.otherKind':
    'The project was saved from {composition}, a composition of another kind (MushafRecitation, MushafAyahText or MushafPage): import it into one of that kind.',
  'project.missing': {
    one: 'public/ lacks the file the project needs: {files}. Put it there and import again; nothing was changed.',
    other:
      'public/ lacks {count} files the project needs: {files}. Put them there and import again; nothing was changed.',
  },
} as const satisfies Readonly<Record<string, Message>>;

/** A key of the panel's dictionary. */
export type MessageKey = keyof typeof EN;

/** What a message's `{name}` placeholders are filled with; `count` also picks the plural form. */
export type MessageParams = Readonly<Record<string, string | number>>;

const AR: Readonly<Record<MessageKey, Message>> = {
  'panel.title': 'استوديو المصحف',
  'panel.open': 'افتح لوحة المصحف',
  'panel.collapse': 'اطوِ اللوحة',
  'panel.moveLeft': 'انقل اللوحة إلى الحافة اليسرى',
  'panel.moveRight': 'انقل اللوحة إلى الحافة اليمنى',
  'panel.tabs': 'تبويبات استوديو المصحف',
  'panel.language': 'اللغة',
  'panel.tabCrashed': 'توقف هذا التبويب بسبب خطأ (انظر سطر الحالة). أعد تحميله؛ وإن توقف مرة أخرى فراجع الخصائص.',
  'panel.reload': 'إعادة التحميل',
  'panel.rolledBack':
    'لم تعد بعض تغييرات اللوحة في الخصائص ({fields}): أخرجها تراجع، أو إعادة ضبط في شريط الخصائص، أو تعديل فيه أثناء حفظ اللوحة. «استعادة» يعيدها؛ و× يُبقي الخصائص كما هي.',
  'panel.rolledBackMore': '{fields} و{count} غيرها',
  'panel.hostMoved':
    'تحرّك مسار القالب {track}: صارت الثانية {live} تُسمع عند بداية التلاوة، والتوقيتات تبدأ من الثانية {saved}.',
  'panel.updateTiming': 'حدّث التوقيت',
  'panel.hostGone':
    'يتّبع التركيب مسار القالب {track}، لكن لم يعد أي مسار على الخط الزمني يشغّل {file}: يتبع التمييز توقيتات تسجيل لا يُسمع.',
  'panel.followNow': 'اتّبع المسار الذي يعمل الآن',
  'panel.busy.timing': 'جارٍ تحديث التوقيت...',
  'panel.notice.timing': 'صارت التوقيتات تتبع {track} مرة أخرى، من الثانية {offset}.',
  'panel.restore': 'استعادة',
  'panel.keepAsIs': 'أبقِ الخصائص كما هي',
  'panel.busy.restoring': 'جارٍ استعادة قيم اللوحة...',
  'panel.slot': 'الخانة',
  'panel.slotPicker': 'أي خانة من خانات هذا القالب تعدّلها اللوحة',
  'panel.slotEmpty':
    'لا تلاوة في هذا القالب تحت {key} بعد. اختر مصدرًا: أول حفظ يكتب هناك خصائص كاملة، ويبقى للقالب ما له.',
  'panel.slotError': 'لا تعرض الخانة {key} شيئًا: {message}',

  'tab.source': 'المصدر',
  'tab.look': 'المظهر',
  'tab.align': 'المحاذاة',
  'tab.review': 'المراجعة',
  'tab.lines': 'الأسطر',
  'tab.text': 'النص',

  'status.ready': 'جاهز.',
  'status.dismiss': 'إغلاق',
  'status.loadingCatalogue': 'جارٍ تحميل الفهرس...',
  'status.loadingTranslations': 'جارٍ تحميل قائمة الترجمات...',
  'status.retryIn': 'أعد المحاولة بعد {seconds} ث.',
  'status.loadingTafsirs': 'جارٍ تحميل قائمة التفاسير...',
  'status.busyRefused': 'اللوحة مشغولة ({busy})؛ انتظر حتى تنتهي قبل: {task}.',

  'common.none': 'لا شيء',
  'common.pickFile': 'اختر ملفًا',
  'busy.updating': 'جارٍ تحديث التركيب...',
  'unit.seconds': 'ث',

  'error.publicFile':
    'تعذّرت قراءة public/{path} (HTTP {status}). اختر ملفًا موجودًا في public/، أو ضع التسجيل هناك من تبويب المصدر.',
  'error.timingsFile':
    'تعذّرت قراءة ملف التوقيتات timingsFile {path} (HTTP {status}). تحقّق من المسار (داخل public/) أو من الرابط.',
  'error.textAfterTimings':
    'التوقيتات محفوظة في public/{timingsFile}، لكن تعذّر جلب نص القرآن للآيات {surah}:{fromAyah}-{toAyah}: {error}؛ اجلبه من تبويب النص، ثم اختر التوقيتات مرة أخرى.',
  'recording.notice.versioned':
    'في public/{kept} تعديلاتك أو توقيتات أخرى، فبقي كما هو: التوقيتات الجديدة في public/{path}، ويستعملها التركيب.',
  'recording.notice.cleared':
    'أُزيلت ملفات ({count}) لا تخص المقطع الجديد {passage}: {files}. اجلبها من جديد في تبويب النص.',
  'recording.notice.sameRecording': 'هذا التسجيل نفسه: يبقى نطاق الآيات وتقسيمات الأسطر كما هي.',
  'recording.notice.untracked':
    'لم يعد التركيب يتّبع مسار القالب {track}: صار يشغّل {file} بنفسه، فيجب أن يكتم القالب ذلك المسار وإلا عمل الاثنان معًا.',

  'source.modes': 'مصدر الصوت',
  'source.mode.catalogue': 'تنزيل من الفهرس',
  'source.mode.upload': 'رفع تسجيلي',
  'source.mode.public': 'ملف موجود في public/',
  'source.mode.track': 'مسار في هذا الفيديو',
  'source.now.none': 'الآن: لا صوت بعد. اختر مصدره أدناه.',
  'source.now.track':
    'الآن: مسار القالب {track} يشغّل {file} من الثانية {offset} عند بداية التلاوة؛ ولا يشغّل التركيب صوتًا خاصًا به.',
  'source.now.trackGone':
    'الآن: يتّبع التركيب مسار القالب {track}، لكن لا مسار على الخط الزمني يشغّل {file}: لا يُسمع شيء من التلاوة.',
  'source.now.missing': 'الآن: الملف public/{path} غير موجود، لذا يُبثّ المقطع من {host} بدلًا منه، حتى عند التصيير.',
  'source.now.streaming': 'الآن: بثّ {url}. تحتاج المعاينة والتصيير إلى أن يكون {host} متاحًا.',
  'source.now.catalogue': 'الآن: public/{path}، نُزِّل من {host} مع توقيتات الفهرس المراجَعة.',
  'source.now.catalogueNoHost': 'الآن: public/{path}، نُزِّل مع توقيتات الفهرس المراجَعة.',
  'source.now.aligned': 'الآن: public/{path}، وقّته aligner.qud.dev.',
  'source.now.file': 'الآن: public/{path}.',
  'source.now.otherTimings':
    'الآن: public/{path}؛ وقد صُنعت توقيتاته لتسجيل آخر ({timings}): حاذِ هذا الملف لتوقيت كلماته.',
  'source.now.download': 'نزّله إلى public/',
  'source.loadingCatalogue': 'جارٍ تحميل التلاوات المراجَعة من أداة المحاذاة...',
  'source.reciter': 'القارئ',
  'source.surah': 'السورة',
  'source.ayahs': 'الآيات',
  'source.fromAyah': 'من الآية',
  'source.to': 'إلى',
  'source.toAyah': 'إلى الآية',
  'source.of': 'من {count}',
  'source.catalogue.does':
    'يُنزِّل توقيتات الكلمات من aligner.qud.dev وصوت الآيات {from}-{to} من {host} إلى public/{dir}/. لا يُرفع شيء من ملفاتك.',
  'source.catalogue.hostUnknown': 'خادم الصوت الذي تسمّيه أداة المحاذاة في ردّها',
  'source.download': 'نزّل إلى public/',
  'source.failed': 'تعذّر تنزيل الصوت من {host} ({error}). لم يُحفظ شيء: يشغّل التركيب ما كان يشغّله.',
  'source.retry': 'أعد محاولة التنزيل',
  'source.stream': 'بثّ من {host}',
  'source.streamNote':
    'البثّ يحفظ رابط المقطع في audioFile: فتحتاج المعاينة والتصيير بعدها إلى أن يكون {host} متاحًا. ويعرض سطر «الآن» تنزيله لاحقًا.',
  'source.riwayahWarning':
    'هذه التلاوة برواية {riwayah}، والمصحف الذي تعرضه هذه اللوحة هو طبعة حفص (KFGQPC V4): قد تختلف الكلمات ورسمها، فلا تكون الكلماتُ المظلَّلة هي الكلماتِ المتلوّة، وقد يبقى بعضها بلا توقيت.',
  'source.riwayahConfirm': 'استخدم تلاوة {riwayah} مع مصحف حفص على أي حال',
  'source.riwayahConfirmFirst': 'أكّد أولًا استخدام تلاوة {riwayah} مع مصحف حفص.',
  'source.replaces.recording': 'يستبدل: الصوت والتوقيتات؛ ويعيد التسجيل الجديد ضبط نطاق الآيات وتقسيمات الأسطر.',
  'source.replaces.nothingYet': 'لا يستبدل شيئًا بعد: يشغّل التركيب ما يشغّله حتى تحفظ المحاذاة التوقيتات الجديدة.',
  'source.replaces.audioOnly': 'يستبدل: الصوت وحده (audioFile)؛ وتبقى التوقيتات ونطاق الآيات والتقسيمات.',
  'source.replaces.audioOnlyTrack':
    'يستبدل: الصوت؛ ويكفّ التركيب عن اتّباع مسار القالب {track} ويشغّل هذا الملف بنفسه (يجب أن يكتم القالب مساره وإلا عمل الاثنان معًا). وتبقى التوقيتات ونطاق الآيات والتقسيمات.',
  'source.replaces.stopsTrack':
    'ويكفّ أيضًا عن اتّباع مسار القالب {track}: يعود التركيب إلى تشغيل صوته بنفسه، فيجب أن يكتم القالب ذلك المسار وإلا عمل الاثنان معًا.',
  'source.replaces.track': 'يستبدل: الصوت (يشغّله مسار القالب)؛ وتبقى التوقيتات حتى تحاذي المسار.',
  'source.replaces.trackSame': 'لا يستبدل شيئًا من التوقيتات (فهي لهذا الملف)؛ ويكفّ التركيب عن تشغيله بنفسه.',
  'source.replaces.trackNew': 'لا يستبدل شيئًا بعد: يتّبع التركيب هذا المسار، وتوقّت المحاذاةُ كلماته.',
  'source.upload.does':
    'ينسخ ملفك إلى public/{dir}/؛ ويبقى على هذا الجهاز. ثم ترفعه المحاذاة إلى aligner.qud.dev، وتقول ذلك قبل أن ترسل أي شيء.',
  'source.upload.button': 'اختر ملفًا لنسخه إلى public/',
  'source.upload.input': 'تسجيلك',
  'source.ready': 'الملف public/{path} جاهز. يبقى على هذا الجهاز حتى تضغط «محاذاة» في التبويب التالي.',
  'source.goToAlign': 'انتقل إلى المحاذاة',
  'source.noPublicAudio': 'لا يوجد ملف صوت أو فيديو في public/ بعد.',
  'source.publicSelect': 'الصوت أو الفيديو في public/',
  'source.fileSize': '{name} ({size} ك.ب)',
  'source.public.use': 'ماذا تفعل بالملف',
  'source.public.align': 'حاذِ هذا الملف',
  'source.public.replace': 'استبدل الصوت وحده (مع إبقاء التوقيتات الحالية)',
  'source.public.alignDoes': 'يجهّز الملف للمحاذاة، التي ترفعه إلى aligner.qud.dev وتحفظ توقيتاته.',
  'source.public.stage': 'جهّزه للمحاذاة',
  'source.public.replaceWarning':
    'يبقى تظليل الكلمات تابعًا للتوقيتات الحالية ({timings}): فإن لم يكن هذا الملف التسجيلَ نفسه ظُلِّلت الكلمات في غير أوقاتها.',
  'source.public.replaceButton': 'استبدل الصوت',
  'source.public.isCurrent': 'هذا هو الملف الذي يشغّله التركيب الآن: لا شيء لاستبداله.',
  'source.track.none': 'ليس للقالب مسار صوت أو فيديو على الخط الزمني.',
  'source.track.noneUsable': 'لا يمكن اتّباع أي مسار من مسارات القالب: لا يُتّبع إلا مسار يعمل بالسرعة 1 ولا يتكرّر.',
  'source.track.select': 'المسار',
  'source.track.option': '{label} · {kind} · الثانية {offset} عند بداية التلاوة',
  'source.track.optionLater': '{label} · {kind} · يبدأ بعد بداية التلاوة بـ{seconds} ث',
  'source.track.kind.audio': 'صوت',
  'source.track.kind.video': 'فيديو',
  'source.track.limit.rate': '(سرعة أخرى: غير مدعوم)',
  'source.track.limit.loop': '(يتكرّر: غير مدعوم)',
  'source.track.toPublic': 'نسخة في public/',
  'source.track.does':
    'لا يشغّل التركيب صوتًا خاصًا به ويتّبع هذا المسار: يصير audioFile هو {file}، ويحفظ hostAudio توقيته (الثانية {offset} عند بداية التلاوة). ثم حاذِه أو راجعه كالمعتاد.',
  'source.track.use': 'استخدم هذا المسار',
  'source.track.stop': 'أعد تشغيل audioFile في التركيب',
  'source.busy.segments': 'جارٍ جلب المقاطع...',
  'source.busy.clipFrom': 'جارٍ تنزيل المقطع الصوتي من {host}...',
  'source.busy.downloadNow': 'جارٍ تنزيل الصوت من {host} إلى public/...',
  'source.busy.copying': 'جارٍ نسخ التسجيل إلى public/...',
  'source.busy.track': 'جارٍ اتّباع المسار...',
  'source.notice.copied': 'أصبح {name} الآن public/{path}. لم يُرسَل شيء إلى أي مكان.',
  'source.notice.staged': 'الملف public/{path} جاهز للمحاذاة. لم يُرسَل شيء إلى أي مكان بعد.',
  'source.notice.streaming': 'صار audioFile رابط المقطع: تحتاج المعاينة والتصيير إلى أن يكون {host} متاحًا.',
  'source.notice.downloaded': 'الملف public/{path} في مكانه: لم تعد المعاينة والتصيير بحاجة إلى {host}.',
  'source.notice.tracked': 'يتّبع التركيب {track}. وتوقيتاته لملف آخر: حاذِ المسار في تبويب المحاذاة.',
  'source.notice.trackedSame': 'يتّبع التركيب {track}، وتوقيتاته لهذا الملف: راجعها في تبويب المراجعة.',
  'source.notice.trackedNew': 'يتّبع التركيب {track}. حاذِه في تبويب المحاذاة لتوقيت كلماته.',
  'source.notice.untracked': 'يشغّل التركيب {file} بنفسه مرة أخرى.',

  'look.note':
    'يضبط المظهر خصائص التنسيق بنقرة واحدة، ولا يغيّر موضع الأسطر الذي ضبطته (موضعها العمودي وإزاحاتها وهوامشها)؛ ويمكنك تغيير أيٍّ منها بعد ذلك في الشريط الجانبي للخصائص (Props). أما التلاوة والتوقيتات وملفات الترجمة فتبقى كما هي.',
  'look.slotNote': 'في خانة القالب يحدّد صندوقُ القالب المقاسَ: لا يغيّر المظهر layout.aspect.',
  'look.looks': 'المظاهر',
  'look.active': 'الخصائص مطابقة لهذا المظهر',
  'look.undo': 'تراجع عن {name}',
  'look.undoTitle': 'أعد ما غيّره {name}',
  'look.busy.applying': 'جارٍ تطبيق {name}...',
  'look.busy.undoing': 'جارٍ التراجع عن {name}...',
  'look.notice.nothingToUndo': 'لم يبقَ من {name} ما يُتراجع عنه: تغيّر كل حقل ضبطه منذ تطبيقه.',
  'look.notice.keptChanged': 'تم التراجع عن {name}؛ وتحتفظ الحقول التي تغيّرت منذ تطبيقه بقيمها الجديدة.',
  'look.chip.page': 'الصفحة',
  'look.chip.ink': 'الحبر',
  'look.chip.currentWord': 'الكلمة الحالية',
  'look.chip.rosette': 'الزخرفة',
  'look.chip.translation': 'الترجمة',

  'align.audioTitle': 'الصوت المراد محاذاته',
  'align.noAudio':
    'لا شيء للمحاذاة بعد. ضع تسجيلًا في public/ من تبويب المصدر (ارفع تسجيلًا، أو اختر ملفًا موجودًا هناك) لمحاذاته.',
  'align.catalogue':
    'وقّته الفهرس من قبل (توقيتات كلمات مراجَعة): فلا شيء للمحاذاة. عدّل كلمةً في المراجعة، أو اختر مصدرًا آخر في تبويب المصدر.',
  'align.from.upload': 'ملفك المرفوع، جُهِّز في المصدر: لا يشغّله التركيب بعد.',
  'align.from.public': 'ملف من public/ جُهِّز في المصدر: لا يشغّله التركيب بعد.',
  'align.from.current': 'ما يشغّله التركيب الآن.',
  'align.from.track': 'مسار القالب {track}، الذي يتّبعه التركيب.',
  'align.from.url': 'ما يبثّه التركيب. يجلبه هذا المتصفح ليرفعه؛ فإن لم يسمح {host} بذلك نزّلته أداة المحاذاة بنفسها.',
  'align.stopsTrack':
    'ويكفّ حفظ التوقيتات أيضًا عن اتّباع مسار القالب {track}: يشغّل التركيب هذا التسجيل بنفسه، فيجب أن يكتم القالب ذلك المسار وإلا عمل الاثنان معًا.',
  'align.video': 'فيديو: يُفكّ صوته في هذا المتصفح ويُرسَل ملفَّ WAV.',
  'align.busy.decoding': 'جارٍ فكّ صوت الفيديو...',
  'align.busy.byUrl': 'تنزّل أداة المحاذاة الصوت من {host}...',
  'align.options': 'الخيارات',
  'align.model': 'النموذج',
  'align.device': 'الجهاز',
  'align.riwayah': 'الرواية',
  'align.riwayahWarning':
    'المصحف الذي تعرضه هذه اللوحة هو طبعة حفص (KFGQPC V4): قد تختلف تلاوة {riwayah} عنها في الكلمات ورسمها، فلا تطابق الكلماتُ التي يسمعها المُحاذي كلماتِ الصفحة، وقد يبقى بعضها بلا توقيت.',
  'align.riwayahConfirm': 'حاذِ تلاوة {riwayah} على مصحف حفص على أي حال',
  'align.riwayahConfirmFirst': 'أكّد أولًا محاذاة تلاوة {riwayah} على مصحف حفص.',
  'align.token': 'رمز Hugging Face (اختياري، لاستخدام حصتك الخاصة من GPU)',
  'align.remember': 'تذكّره في هذا المتصفح',
  'align.forget': 'انسَه',
  'align.tokenSession':
    'يُحفظ الرمز في sessionStorage لهذا التبويب من المتصفح فقط: لا يُكتب أبدًا في ملف ولا في الخصائص ولا في ملف Root، ولا يُرسَل إلا إلى أداة المحاذاة. وإذا طلبت تذكّره في هذا المتصفح بقي على هذا الحاسوب ولم يُرسَل إلا إلى aligner.qud.dev.',
  'align.tokenRemembered':
    'الرمز محفوظ في localStorage لهذا المتصفح: يبقى على هذا الحاسوب، ولا يُكتب أبدًا في ملف ولا في الخصائص ولا في ملف Root، ولا يُرسَل إلا إلى aligner.qud.dev. زر «انسَه» يحذفه.',
  'align.title': 'المحاذاة',
  'align.consent':
    'لا يغادر صوتك هذا الجهاز إلا حين تضغط «محاذاة»: إذ يُرفع إلى أداة المحاذاة الشاملة QUD (aligner.qud.dev) التي تحتفظ به بضع ساعات؛ والمحاذاة التي تعيدها مرخّصة بـ CC-BY-4.0. وإذا حاذيت الملف نفسه مرة أخرى خلال تلك الساعات أُعيد استخدام الجلسة نفسها بدلًا من رفعه من جديد.',
  'align.button': 'محاذاة',
  'align.lastSession':
    'آخر محاذاة في هذه الجلسة: {audio} ({model}، {device}، {riwayah})، الجلسة {id}. يعتمد عليها التقسيم وإعادة المحاذاة في تبويب المراجعة.',
  'align.busy.reading': 'جارٍ قراءة الصوت...',
  'align.busy.checking': 'جارٍ البحث عن محاذاة سابقة لهذا الملف...',
  'align.busy.aligning': 'جارٍ المحاذاة...',
  'align.busy.wordTimes': 'جارٍ جلب توقيتات الكلمات...',
  'align.notice.reused':
    'سبقت محاذاة هذا الملف في الساعة {time}، وما زالت أداة المحاذاة تحتفظ بتلك الجلسة: لم يُرفع شيء من جديد.',
  'align.notice.device': 'عملت أداة المحاذاة على {used}، إذ لم يكن {asked} متاحًا.',
  'align.stage.queuedGpu': 'في الانتظار على GPU',
  'align.stage.queuedCpu': 'في الانتظار على CPU',
  'align.stage.segmenting': 'التقطيع إلى مقاطع',
  'align.stage.transcribing': 'التفريغ النصي',
  'align.stage.matching': 'المطابقة مع المصحف',
  'align.stage.recovering': 'استدراك الكلمات الفائتة',
  'align.stage.building': 'بناء المقاطع',

  'review.nothing': 'لا شيء للمراجعة بعد: اختر تلاوة في تبويب المصدر أو حاذِ تسجيلًا في تبويب المحاذاة.',
  'review.summary': 'المقاطع: {segments}، الكلمات: {words}',
  'review.summaryAlignment': '، دون {percent}%: {low}، فيها كلمات ناقصة: {missing}، فيها أخطاء: {errors}',
  'review.summaryIncomplete': '، آيات غير مكتملة: {count}',
  'review.summaryRepeats': '، فيها تكرار: {repeats}',
  'review.showDoubts': 'أظهر مواضع الشك على الخط الزمني',
  'review.keyboardLabel': 'المراجعة: j وk للتنقل بين الكلمات المشكوك فيها، و? لعرض المفاتيح',
  'review.keys.title': 'اختصارات لوحة المفاتيح',
  'review.keys.step': 'الكلمة المشكوك فيها التالية / السابقة: الانتقال إليها وفتح مقطعها',
  'review.keys.start': 'تقديم بداية الكلمة المحددة / تأخيرها 20 م.ث',
  'review.keys.end': 'تقديم نهاية الكلمة المحددة / تأخيرها 20 م.ث',
  'review.keys.apply': 'تطبيق التعديلات المعلّقة',
  'review.keys.play': 'تشغيل / إيقاف مؤقت',
  'review.keys.help': 'إظهار هذه القائمة أو إخفاؤها',
  'review.keys.focus': 'تعمل المفاتيح ما دام تبويب المراجعة في موضع التركيز (انقر داخله) ولم تكن تكتب في حقل.',
  'review.noDoubtful': 'لا توجد كلمة مشكوك فيها للانتقال إليها.',
  'review.selectFirst': 'حدّد كلمة أولًا: بالمفتاح j أو k، أو بالنقر على نصها في مقطع مفتوح.',
  'review.waveform': 'الشكل الموجي',
  'review.zoom': 'التكبير',
  'review.zoomAround': '±{padding} {unit} حول المقطع #{segment}',
  'review.zoomWhole': 'التسجيل كاملًا؛ افتح مقطعًا لتكبير العرض عليه.',
  'review.segments': 'المقاطع',
  'review.showWords': 'أظهر الكلمات',
  'review.hideWords': 'أخفِ الكلمات',
  'review.noMatch': 'لا مطابقة',
  'review.flagMissing': 'كلمات ناقصة',
  'review.flagRepeated': 'تكرار',
  'review.flagIncomplete': 'غير مكتملة',
  'review.ayahs': 'الآيات ({count})',
  'review.wordCount': 'الكلمات: {count}',
  'review.wordStart': 'بداية {id}',
  'review.wordEnd': 'نهاية {id}',
  'review.edits': 'التعديلات',
  'review.apply': 'طبّق التعديلات ({count})',
  'review.discard': 'تجاهل',
  'review.applyNote': 'يعيد التطبيق كتابة public/{file} بالتوقيتات الجديدة ويسجّل التعديل في ملحق المحاذاة الخاص به.',
  'review.export': 'التصدير',
  'review.captionsJson': 'Captions JSON',
  'review.markers': 'تضمين علامات نهاية الآيات',
  'review.importCaptions': 'استيراد النصوص المصاحبة…',
  'review.importCaptionsHint':
    'يقرأ ملف Captions JSON (مصفوفة Caption[] التي يكتبها زر Captions JSON، بعد تحريرها في محرر النصوص المصاحبة) ويكتب توقيتاته في ملف التوقيتات.',
  'review.exportNote':
    'النصوص المصاحبة لملف التوقيتات كاملًا، موقّتة على ملف الصوت. وملف JSON هو مصفوفة Caption[] التي تقرؤها أدوات Remotion للنصوص المصاحبة (@remotion/captions).',
  'review.splitTitle': 'تقسيم المقاطع...',
  'review.maxVerses': 'أقصى عدد للآيات',
  'review.maxVersesLabel': 'أقصى عدد للآيات',
  'review.maxWords': 'أقصى عدد للكلمات',
  'review.maxWordsLabel': 'أقصى عدد للكلمات',
  'review.maxSeconds': 'أقصى عدد للثواني (30 تعني بلا حد)',
  'review.maxDurationLabel': 'أقصى مدة',
  'review.stopSigns': 'عند علامات الوقف فقط',
  'review.splitButton': 'قسّم المقاطع',
  'review.sessionHint': 'حاذِ هذا الصوت في هذه الجلسة أولًا: فأداة المحاذاة لا تحتفظ بالجلسة إلا بضع ساعات.',
  'review.realignTitle': 'إعادة المحاذاة بهذه الحدود (متقدم)',
  'review.boundaryNote':
    'كل حدّ هو امتداد من التسجيل تفرّغه أداة المحاذاة وتطابقه مستقلًّا، بثواني ملف التسجيل (لا التركيب). تُذكر المقاطع كلها، ومنها ما يقع خارج نطاق الآيات: إعادة المحاذاة تستبدل محاذاة الملف كله.',
  'review.boundaryStart': 'بداية الحد {n}',
  'review.boundaryEnd': 'نهاية الحد {n}',
  'review.removeBoundary': 'احذف هذا الحد',
  'review.addBoundary': 'أضف حدًّا',
  'review.resetBoundaries': 'أعد الضبط من المقاطع',
  'review.realignButton': 'أعد المحاذاة',
  'review.editLog': 'سجل التعديلات: {edits}',
  'review.editEntry': '{kind} في {at} ({note})',
  'review.clickHint': 'انقر على مقطع أو آية لتشغيله من بدايته؛',
  'review.thresholdDefault': 'والعتبة هي القيمة الافتراضية {percent}% (لا خصائص مراجعة لهذا التركيب).',
  'review.thresholdProps':
    'والعتبة ({percent}%) هي الخاصية review.confidenceThreshold للتركيب في الشريط الجانبي للخصائص.',
  'review.busy.reading': 'جارٍ قراءة ملف التوقيتات...',
  'review.busy.writing': 'جارٍ كتابة التوقيتات...',
  'review.busy.captions': 'جارٍ كتابة النصوص المصاحبة...',
  'review.busy.splitting': 'جارٍ تقسيم المقاطع...',
  'review.busy.realigning': 'جارٍ إعادة المحاذاة...',
  'review.vttWords': 'VTT (كلمات)',
  'review.vttAyahs': 'VTT (آيات)',
  'review.copyChapters': 'انسخ الفصول',
  'review.copyDescription': 'انسخ الوصف',
  'review.thumbnail': 'الصورة المصغّرة',
  'review.copyArea': 'النص المراد نسخه',
  'review.closeCopy': 'أغلق',
  'review.publishNote':
    'الفصول والوصف ليوتيوب، موقّتة على الفيديو. وزر الصورة المصغّرة يضبط الصورة الثابتة {id} على هذا المقطع، واسم القارئ عنوانًا لها، ثم يفتحها.',
  'review.busy.thumbnail': 'جارٍ حفظ الصورة المصغّرة...',
  'review.notice.vtt': 'كُتب public/{path}: عدد المقاطع النصية {count}، موقّتة على ملف الصوت.',
  'review.notice.copyByHand': 'لم يسمح المتصفح للوحة بالنسخ: النص محدَّد أدناه، انسخه بـ Ctrl+C (⌘C).',
  'review.notice.noChapters': 'لا فصول: المقطع أقصر من أن يُقسَّم إلى فصول يوتيوب (أقل من 3 فصول بين كل منها 10 ث).',
  'review.notice.chaptersCopied': 'نُسخت الفصول ({count}): الصقها في وصف الفيديو.',
  'review.notice.descriptionCopied': 'نُسخ الوصف: الصقه في يوتيوب.',
  'review.notice.thumbnail': 'تعرض {id} الآن {surah}:{fromAyah}-{toAyah} وهي مفتوحة في الاستوديو.',
  'review.notice.thumbnailSaved':
    'تعرض {id} الآن {surah}:{fromAyah}-{toAyah}. يبقى الاستوديو على هذا القالب: اختر {id} من الشريط الجانبي لتراها.',
  'error.noThumbnail':
    'لا يحتوي الجذر على التركيب {id}: سجّل <MushafThumbnail> بالمعرّف {id} (انظر README التطبيق)، ثم اضغط زر الصورة المصغّرة مرة أخرى.',
  'review.notice.srt': 'كُتب public/{path}: عدد المقاطع النصية {count}، موقّتة على ملف الصوت.',
  'review.notice.captions': 'كُتب public/{path}: عدد النصوص المصاحبة {count}، موقّتة على ملف الصوت.',
  'review.notice.captionsImported':
    'استُورد {name}: صارت توقيتات نصوصه المصاحبة ({count}) في ملف التوقيتات، وسُجّل الاستيراد في سجل تعديلاته.',
  'review.notice.captionsUnchanged': 'لا يغيّر {name} أي توقيت: بقي ملف التوقيتات كما هو.',
  'error.captionsNotArray':
    'ليس {name} ملف Captions JSON: المتوقع مصفوفة من النصوص المصاحبة ({text, startMs, endMs, ...}) مثل التي يكتبها زر Captions JSON. صدّره، وحرّر توقيتاته، ثم استورده مرة أخرى.',
  'error.captionNotObject':
    '{name}: النص المصاحب {index} هو {found}، وليس نصًا مصاحبًا {text, startMs, endMs}. استورد ملف Captions JSON الذي يكتبه هذا الصف، محرَّرًا دون إضافة نصوص أو حذفها.',
  'review.notice.nudgesReplaced':
    'تحلّ المحاذاة الجديدة محلّ توقيتات التعديلات الطفيفة السابقة (عددها {count})؛ ويحتفظ سجل التعديلات بها.',

  'waveform.label': 'الشكل الموجي للتسجيل: انقر للانتقال',
  'waveform.decoding': 'جارٍ فك ترميز التسجيل...',
  'waveform.failed': 'لا يتوفر شكل موجي: {error}',
  'waveform.retry': 'أعد المحاولة',
  'waveform.noWebAudio': 'لا يستطيع هذا المتصفح فك ترميز الصوت هنا (لا يتوفر Web Audio).',
  'waveform.httpError': 'تعذّرت قراءة {url} (HTTP {status}).',
  'waveform.tooLarge': 'حجم التسجيل {size} م.ب، وهو أكبر من أن يُرسم هنا.',

  'compare.title': 'المقارنة بملف توقيتات آخر...',
  'compare.with': 'قارن مع…',
  'compare.busy': 'جارٍ قراءة ملفَّي التوقيتات...',
  'compare.summary':
    'كلمات في الملفين: {matched}؛ الفرق: الوسيط {median} {unit}، والمئين التسعون {p90} {unit}، والأقصى {max} {unit}؛ في هذا الملف وحده: {onlyA}، وفي {other} وحده: {onlyB}.',
  'compare.word': 'الكلمة',
  'compare.thisFile': 'هذا الملف',
  'compare.otherFile': 'الآخر',
  'compare.diffMs': 'الفرق (م.ث)',
  'compare.note':
    'تُقابَل كل كلمة في هذا الملف بالكلمة نفسها في الآخر (والكلمة المكررة بترتيب تكرارها)، بتوقيت كل ملف؛ وتُعرض أكبر 50 فرقًا أولًا. انقر على صف للانتقال إلى الكلمة.',

  'lines.noPrintedLines':
    'لا أسطر مطبوعة في هذا التركيب: فهو يعرض آية واحدة في كل مرة نصًّا بترميز Unicode، موقّتة بآيات ملف التوقيتات.',
  'lines.noLines': 'لا أسطر بعد: يستخرجها التركيب من ملف التوقيتات.',
  'lines.busy.splits': 'جارٍ تحديث التقسيمات...',
  'lines.slots': 'الفترات ({count})',
  'lines.pageLine': 'ص{page} س{line}',
  'lines.slot': 'الفترة {n}',
  'lines.splitBefore': 'اقسم السطر قبل {id}',
  'lines.splits': 'التقسيمات ({count})',
  'lines.splitsHint': 'انقر على كلمة ليست الأولى في فترتها لتبدأ عندها فترة موقّتة جديدة.',
  'lines.splitAt': 'ص{page} س{line} عند الكلمة {word}',
  'lines.removeSplit': 'احذف هذا التقسيم',
  'lines.dropped':
    'لم تعد تقسيمات ({count}) تناسب المقطع (تغيّر نطاق الآيات أو القصّ): تتركها المعاينة، ويرفضها التصيير.',
  'lines.removeDropped': 'احذف التقسيمات التي لا تناسب ({count})',
  'lines.notApplied': 'غير مطبَّق',
  'lines.noPages': 'لا صفحات بعد: يستخرجها التركيب من ملف التوقيتات.',
  'lines.pages': 'الصفحات ({count})',
  'lines.page': 'الصفحة {page}',
  'lines.seekPage': 'انتقل إلى الصفحة {page}',
  'lines.recitedLines': 'الأسطر المتلوّة: {count}',
  'lines.pageNote': 'تعرض الصفحة أسطرها كما طُبعت: انقر على صفحة للانتقال إليها. لا تقسيم هنا.',

  'text.needsTimings': 'يحتاج الجلب إلى التوقيتات: اختر تلاوة أو حاذِ تسجيلًا أولًا.',
  'text.crossesSurahs':
    'يطلب الجلب من quran.com سورةً واحدة، وهذه التوقيتات تمتد عبر أكثر من سورة: اجلب من تركيب لكل سورة على حدة.',
  'text.quranText': 'نص القرآن',
  'text.now': 'الحالي: {file}',
  'text.recitationNeedsNoText':
    'لا تحتاج الأسطر المطبوعة إلى ملف نص؛ أما تركيب MushafAyahText فيقرأ هذا الملف بوصفه textFile.',
  'text.script': 'الرسم',
  'text.fetchText': 'اجلب نص هذا المقطع',
  'text.ayahTranslation': 'ترجمة الآيات',
  'text.loadingList': 'جارٍ تحميل قائمة ترجمات quran.com...',
  'text.language': 'اللغة',
  'text.translation': 'الترجمة',
  'text.fetchForPassage': 'اجلبها لهذا المقطع',
  'text.none': 'بلا ترجمة',
  'text.wordByWord': 'كلمة بكلمة',
  'text.glossNow': 'الترجمة الحرفية: {gloss}؛ النقحرة: {transliteration}',
  'text.glossLanguage': 'اللغة (رمز quran.com: en وur وid...)',
  'text.fetchWordTranslation': 'اجلب الترجمة',
  'text.fetchWordTransliteration': 'اجلب النقحرة',
  'text.noGloss': 'بلا ترجمة حرفية',
  'text.noTransliteration': 'بلا نقحرة',
  'text.glossOnlyRecitation': 'الترجمة الحرفية للكلمات خاصة بتركيب MushafRecitation (لا يعرضها نص الآيات ولا الصفحة).',
  'text.publicTitle': 'استخدم ملفًا من public/',
  'text.noJson': 'لا يوجد ملف JSON في public/ بعد.',
  'text.jsonSelect': 'ملف JSON في public/',
  'text.asTranslation': 'ترجمةً',
  'text.asGloss': 'ترجمةً حرفية',
  'text.asTransliteration': 'نقحرةً',
  'text.qulNote':
    'يمكن وضع الملفات المنزَّلة من QUL (qul.tarteel.ai، ويلزم تسجيل الدخول) في public/ واختيارها هنا بأيٍّ من صيغ QUL: مفتاح/قيمة، أو مصفوفات متداخلة، أو حواشٍ في وسوم، أو حواشٍ مضمّنة، أو أجزاء نصية، أو كلمة بكلمة.',
  'text.busy.checking': 'جارٍ فحص الملف...',
  'text.busy.fetching': 'جارٍ جلب {name}...',
  'text.busy.text': 'جارٍ جلب النص بالرسم {script}...',
  'text.busy.wordTranslation': 'جارٍ جلب الترجمة الحرفية للكلمات...',
  'text.busy.wordTransliteration': 'جارٍ جلب نقحرة الكلمات...',
  'text.notice.writtenRecitation':
    'كُتب public/{path}. هذا التركيب يعرض الأسطر المطبوعة ولا يقرأ نص القرآن؛ أما تركيب MushafAyahText فيقرؤه بوصفه textFile.',
  'text.notice.wrongScript':
    'كُتب public/{path}، لكن textFile بقي كما هو: الخط "{font}" يعرض الرسم {fontScript} لا {script}.',
  'text.notice.textFileSet': 'كُتب public/{path} وأصبح الآن ملف textFile للتركيب.',
  'text.noTextGroup': 'لا يأخذ هذا التركيب ترجمة.',
  'text.noEndCard': 'لا بطاقة ختامية لهذا التركيب، فلا تفسير ولا تعريف بالسورة.',
  'text.layers': 'طبقات الترجمة ({count}/{max})',
  'text.noLayers': 'لا طبقة ترجمة بعد.',
  'text.layer': '{n}. {file} (الخط: {font})',
  'text.layerUp': 'انقل هذه الطبقة إلى أعلى',
  'text.layerDown': 'انقل هذه الطبقة إلى أسفل',
  'text.layerFetch': 'استبدل بها الترجمة المختارة، مجلوبة لهذا المقطع',
  'text.layerRemove': 'احذف هذه الطبقة',
  'text.addLayer': 'أضف طبقة: اجلب لهذا المقطع',
  'text.layersNote':
    'حتى {max} طبقات، تُعرض بهذا الترتيب؛ ويُختار خط الطبقة الجديدة بحسب كتابتها (font: auto). والحجم واللون في الشريط الجانبي للخصائص.',
  'text.asLayer': 'كطبقة ترجمة',
  'text.tafsir': 'التفسير (البطاقة الختامية)',
  'text.loadingTafsirs': 'جارٍ تحميل قائمة التفاسير من quran.com...',
  'text.tafsirResource': 'التفسير',
  'text.fetchTafsir': 'اجلب التفسير لهذا المقطع',
  'text.surahInfo': 'التعريف بالسورة (البطاقة الختامية)',
  'text.surahInfoLanguage': 'اللغة (رمز quran.com: en، ar، ur، ...)',
  'text.fetchSurahInfo': 'اجلب التعريف بالسورة',
  'text.endCardNote': 'تعرض البطاقة الختامية: {show}. الجلب يضبط ما تعرضه؛ ومدتها endCard.seconds.',
  'text.busy.tafsir': 'جارٍ جلب {name}...',
  'text.busy.surahInfo': 'جارٍ جلب التعريف بالسورة...',
  'text.notice.endCard': 'كُتب public/{path} وتعرضه البطاقة الختامية.',

  'inactive.translationHidden':
    'لا تظهر الآن: قيمة text.translationPosition هي none. ما زالت الملفات تُقرأ؛ اختر موضعًا في شريط الخصائص لإظهارها.',
  'inactive.glossHidden':
    'لا تظهر الآن: قيمة text.glossPosition هي none. اجعلها strip أو interlinear في شريط الخصائص لإظهار هذه الملفات.',
  'inactive.endCardFile':
    'لا يظهر الآن: قيمة endCard.show هي {show}. الجلب من جديد يجعلها {kind}، أو اختر {kind} في شريط الخصائص.',
  'inactive.pageColour':
    'قيمة background.kind هي {kind}، فلا يظهر لون الصفحة الذي يضبطه المظهر إلا فيما يرسمه التركيب بنفسه (بطاقة العنوان والعدّاد والبطاقة الختامية).',
  'inactive.pageColourLegacy':
    'الحقل layout.backgroundImage (حقل قديم) يضع صورةً فوق لون الصفحة. المظاهر التي تضبط الألوان تُفرغه؛ ومظهر الإطار يُبقيه.',

  'project.menu': 'المشروع',
  'project.export': 'تصدير المشروع',
  'project.import': 'استيراد مشروع...',
  'project.busy.export': 'جارٍ تصدير المشروع...',
  'project.busy.import': 'جارٍ استيراد المشروع...',
  'project.exported': 'كُتب public/{path} ونُزِّل: الخصائص وقائمة الملفات التي تستخدمها. شاركه مع تلك الملفات.',
  'project.imported': 'استُورد {name}: حُفظت الخصائص، والملفات المطلوبة موجودة في public/ (عددها {count}).',
  'project.invalid': 'ملف المشروع غير صالح: {problem}',
  'project.notObject': 'ليس كائن JSON.',
  'project.badVersion': 'الإصدار هو {version}؛ وهذه اللوحة تقرأ الإصدار 1.',
  'project.noComposition': 'المعرّف compositionId مفقود.',
  'project.propsNotObject': 'الحقل props ليس كائنًا.',
  'project.filesNotList': 'الحقل files ليس قائمة مسارات.',
  'project.badProps': 'props.{path}: {message}.',
  'project.otherKind':
    'حُفظ المشروع من {composition}، وهو تركيب من نوع آخر (MushafRecitation أو MushafAyahText أو MushafPage): استورده في تركيب من ذلك النوع.',
  'project.missing':
    'تنقص public/ ملفات يحتاجها المشروع (عددها {count}): {files}. ضعها هناك ثم أعد الاستيراد؛ لم يُغيَّر شيء.',
};

/** The dictionaries, by language: English is the reference, every Arabic key is required by its type. */
export const MESSAGES: Readonly<Record<StudioLanguage, Readonly<Record<MessageKey, Message>>>> = {en: EN, ar: AR};

const pluralRules = new Map<StudioLanguage, Intl.PluralRules>();

const pluralOf = (language: StudioLanguage, count: number): Intl.LDMLPluralRule => {
  let rules = pluralRules.get(language);
  if (!rules) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }
  return rules.select(count);
};

/**
 * A panel string: the message of `key` in `language` (English where Arabic has none), the plural
 * form `params.count` picks, `{name}` placeholders filled from `params` (one without a value is
 * left as it is). `translate('en', 'review.apply', {count: 3})` is `'Apply edits (3)'`.
 */
export const translate = (language: StudioLanguage, key: MessageKey, params: MessageParams = {}): string => {
  const message = MESSAGES[language][key] ?? EN[key];
  const text =
    typeof message === 'string' ? message : (message[pluralOf(language, Number(params.count ?? 0))] ?? message.other);
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
};
