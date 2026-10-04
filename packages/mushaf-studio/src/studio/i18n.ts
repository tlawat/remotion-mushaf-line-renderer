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

  'source.catalogue': 'Catalogue',
  'source.loadingCatalogue': 'Loading the reviewed recitations of the aligner...',
  'source.reciter': 'Reciter',
  'source.surah': 'Surah',
  'source.ayahs': 'Ayahs',
  'source.fromAyah': 'From ayah',
  'source.to': 'to',
  'source.toAyah': 'To ayah',
  'source.of': 'of {count}',
  'source.catalogueNote':
    'The clip of exactly these ayahs is downloaded into public/ with its reviewed word timings; nothing of yours is uploaded.',
  'source.use': 'Use this recitation',
  'source.own': 'Own recording',
  'source.ready': 'public/{path} is ready. It stays on this machine until you press Align in the next tab.',
  'source.goToAlign': 'Go to Align',
  'source.ownNote': 'The file is copied into public/ so renders can find it; align it in the next tab.',
  'source.publicTitle': 'Audio already in public/',
  'source.noPublicAudio': 'No audio file in public/ yet.',
  'source.publicSelect': 'Audio in public/',
  'source.fileSize': '{name} ({size} kB)',
  'source.useAsAudio': 'Use as audio',
  'source.busy.segments': 'Fetching the segments...',
  'source.busy.clip': 'Downloading the clip...',
  'source.busy.copying': 'Copying the recording into public/...',
  'source.notice.clipFailed':
    'The clip could not be downloaded ({error}); the composition streams it from the catalogue instead.',
  'source.notice.copied': '{name} is now public/{path}. Nothing has been sent anywhere.',

  'look.note':
    'A look sets the style props in one click; change any of them in the Props sidebar afterwards. The recitation, the timings and the translation files are left as they are.',
  'look.looks': 'Looks',
  'look.active': 'The props have this look',
  'look.undo': 'Undo {name}',
  'look.undoTitle': 'Put back what {name} changed',
  'look.busy.applying': 'Applying {name}...',
  'look.busy.undoing': 'Undoing {name}...',
  'look.chip.page': 'Page',
  'look.chip.ink': 'Ink',
  'look.chip.currentWord': 'Current word',
  'look.chip.rosette': 'Rosette',
  'look.chip.translation': 'Translation',

  'align.audioTitle': 'Audio to align',
  'align.noAudio':
    'The composition plays a URL or nothing yet. Put a recording into public/ in the Source tab (own recording, or a file already there) to align it.',
  'align.options': 'Options',
  'align.model': 'Model',
  'align.device': 'Device',
  'align.riwayah': 'Riwayah',
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
    'Last alignment in this session: public/{audio} ({model}, {device}, {riwayah}), session {id}. Split and re-align in Review use it.',
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
  'review.boundaryNote': 'Each boundary is a stretch of the recording the aligner transcribes and matches on its own.',
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
  'review.notice.srt': {
    one: 'public/{path} is written: {count} cue, timed to the audio file.',
    other: 'public/{path} is written: {count} cues, timed to the audio file.',
  },
  'review.notice.captions': {
    one: 'public/{path} is written: {count} caption, timed to the audio file.',
    other: 'public/{path} is written: {count} captions, timed to the audio file.',
  },
  'review.notice.nudgesReplaced': {
    one: 'The new alignment replaces the times of the {count} nudge made before; the edit log keeps it.',
    other: 'The new alignment replaces the times of the {count} nudges made before; the edit log keeps them.',
  },

  'waveform.label': 'Waveform of the recording: click to seek',
  'waveform.decoding': 'Decoding the recording...',
  'waveform.failed': 'No waveform: {error}',
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

  'text.needsTimings': 'Fetching needs the timings: pick a recitation or align a recording first.',
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
  'text.glossOnlyRecitation': 'Word glosses apply to MushafRecitation.',
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
    'The project was saved from {composition}, a composition of the other kind (MushafRecitation or MushafAyahText): import it into one of that kind.',
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

  'source.catalogue': 'الفهرس',
  'source.loadingCatalogue': 'جارٍ تحميل التلاوات المراجَعة من أداة المحاذاة...',
  'source.reciter': 'القارئ',
  'source.surah': 'السورة',
  'source.ayahs': 'الآيات',
  'source.fromAyah': 'من الآية',
  'source.to': 'إلى',
  'source.toAyah': 'إلى الآية',
  'source.of': 'من {count}',
  'source.catalogueNote': 'يُنزَّل مقطع هذه الآيات بعينها إلى public/ مع توقيتات كلماته المراجَعة؛ ولا يُرفع شيء من ملفاتك.',
  'source.use': 'استخدم هذه التلاوة',
  'source.own': 'تسجيل خاص',
  'source.ready': 'الملف public/{path} جاهز. يبقى على هذا الجهاز حتى تضغط «محاذاة» في التبويب التالي.',
  'source.goToAlign': 'انتقل إلى المحاذاة',
  'source.ownNote': 'يُنسخ الملف إلى public/ لتجده عمليات التصيير؛ ثم حاذِه في التبويب التالي.',
  'source.publicTitle': 'صوت موجود في public/',
  'source.noPublicAudio': 'لا يوجد ملف صوتي في public/ بعد.',
  'source.publicSelect': 'الصوت في public/',
  'source.fileSize': '{name} ({size} ك.ب)',
  'source.useAsAudio': 'استخدمه صوتًا',
  'source.busy.segments': 'جارٍ جلب المقاطع...',
  'source.busy.clip': 'جارٍ تنزيل المقطع الصوتي...',
  'source.busy.copying': 'جارٍ نسخ التسجيل إلى public/...',
  'source.notice.clipFailed': 'تعذّر تنزيل المقطع الصوتي ({error})؛ لذا يبثّه التركيب من الفهرس مباشرة.',
  'source.notice.copied': 'أصبح {name} الآن public/{path}. لم يُرسَل شيء إلى أي مكان.',

  'look.note':
    'يضبط المظهر خصائص التنسيق بنقرة واحدة؛ ويمكنك تغيير أيٍّ منها بعد ذلك في الشريط الجانبي للخصائص (Props). أما التلاوة والتوقيتات وملفات الترجمة فتبقى كما هي.',
  'look.looks': 'المظاهر',
  'look.active': 'الخصائص مطابقة لهذا المظهر',
  'look.undo': 'تراجع عن {name}',
  'look.undoTitle': 'أعد ما غيّره {name}',
  'look.busy.applying': 'جارٍ تطبيق {name}...',
  'look.busy.undoing': 'جارٍ التراجع عن {name}...',
  'look.chip.page': 'الصفحة',
  'look.chip.ink': 'الحبر',
  'look.chip.currentWord': 'الكلمة الحالية',
  'look.chip.rosette': 'الزخرفة',
  'look.chip.translation': 'الترجمة',

  'align.audioTitle': 'الصوت المراد محاذاته',
  'align.noAudio':
    'التركيب يشغّل رابطًا أو لا يشغّل شيئًا بعد. ضع تسجيلًا في public/ من تبويب المصدر (تسجيلًا خاصًا أو ملفًا موجودًا هناك) لمحاذاته.',
  'align.options': 'الخيارات',
  'align.model': 'النموذج',
  'align.device': 'الجهاز',
  'align.riwayah': 'الرواية',
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
    'آخر محاذاة في هذه الجلسة: public/{audio} ({model}، {device}، {riwayah})، الجلسة {id}. يعتمد عليها التقسيم وإعادة المحاذاة في تبويب المراجعة.',
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
  'review.boundaryNote': 'كل حدّ هو امتداد من التسجيل تفرّغه أداة المحاذاة وتطابقه مستقلًّا.',
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
  'review.notice.srt': 'كُتب public/{path}: عدد المقاطع النصية {count}، موقّتة على ملف الصوت.',
  'review.notice.captions': 'كُتب public/{path}: عدد النصوص المصاحبة {count}، موقّتة على ملف الصوت.',
  'review.notice.nudgesReplaced':
    'تحلّ المحاذاة الجديدة محلّ توقيتات التعديلات الطفيفة السابقة (عددها {count})؛ ويحتفظ سجل التعديلات بها.',

  'waveform.label': 'الشكل الموجي للتسجيل: انقر للانتقال',
  'waveform.decoding': 'جارٍ فك ترميز التسجيل...',
  'waveform.failed': 'لا يتوفر شكل موجي: {error}',
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

  'text.needsTimings': 'يحتاج الجلب إلى التوقيتات: اختر تلاوة أو حاذِ تسجيلًا أولًا.',
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
  'text.glossOnlyRecitation': 'الترجمة الحرفية للكلمات خاصة بتركيب MushafRecitation.',
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
    'حُفظ المشروع من {composition}، وهو تركيب من النوع الآخر (MushafRecitation أو MushafAyahText): استورده في تركيب من ذلك النوع.',
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
