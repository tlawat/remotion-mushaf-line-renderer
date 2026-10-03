// The QUD Universal Aligner's vocabulary (https://aligner.qud.dev/api/v1/openapi.json), as the
// client receives it. Field names are the API's own (snake_case) so a response can be kept verbatim.

/** One entry of `GET /recitations` and `GET /audio-recitations`. */
export type QudRecitation = {
  readonly slug: string;
  /** "Reciter · riwayah · style · channel". */
  readonly label: string;
  readonly reciter: {readonly reciter_id: string; readonly name_en: string; readonly name_ar: string};
  readonly riwayah: string;
  readonly style: string;
  readonly channel: string;
  readonly source: string;
  /** Chapters (1-114) the recitation covers. */
  readonly chapters: readonly number[];
};

/** One word of a segment, times relative to the segment's `time_from`. */
export type QudWord = {
  readonly word: string;
  readonly location: string;
  readonly start: number;
  readonly end: number;
};

/** One segment of an alignment: a stretch between two pauses and the words it was matched to. */
export type QudSegment = {
  readonly segment: number;
  readonly time_from: number;
  readonly time_to: number;
  /** "surah:ayah:word" of the first and last matched word; empty for isti'adha, basmala or no match. */
  readonly ref_from: string;
  readonly ref_to: string;
  readonly matched_text?: string | null;
  readonly confidence: number;
  readonly has_missing_words?: boolean;
  readonly has_repeated_words?: boolean;
  readonly kind?: string;
  readonly special_type?: string | null;
  readonly error?: string | null;
  /** Present on catalogue segments with `include_timestamps=true` and on `/timestamps` answers. */
  readonly words?: readonly QudWord[];
  readonly timing_status?: string;
};

/** `POST /align/audio`, `/align/url`, `/sessions/{id}/realign`, `/sessions/{id}/split`. */
export type QudAlignResponse = {
  readonly audio_id: string;
  readonly segments: readonly QudSegment[];
  readonly device?: 'GPU' | 'CPU' | null;
  readonly warning?: string | null;
};

/** `POST /sessions/{id}/timestamps` and `POST /timestamps`: the words of every segment. Older answers carry `[location, start, end]` triples. */
export type QudTimestampsResponse = {
  readonly audio_id?: string;
  readonly segments: readonly (Pick<QudSegment, 'segment' | 'timing_status'> & {
    readonly words?: readonly (QudWord | readonly [string, number, number])[];
  })[];
};

/** `GET /recitations/{slug}/chapters/{n}/segments`. Times are relative to the clip (`clip_start` into the chapter). */
export type QudChapterSegments = {
  readonly recitation: string;
  readonly chapter: number;
  readonly verse_from: number;
  readonly verse_to: number;
  /** A Range-capable, CORS-enabled URL of exactly this verse range. */
  readonly audio_url: string;
  readonly clip_start: number;
  readonly segments: readonly QudSegment[];
};

/** The stages the streaming routes (align, realign) report. */
export type QudStage =
  | 'queued_gpu'
  | 'queued_cpu'
  | 'segmenting'
  | 'transcribing'
  | 'matching'
  | 'recovering'
  | 'building';

export type QudProgress = {readonly stage: QudStage; readonly step: number; readonly steps: number};

export type QudModel = 'Base' | 'Large';
export type QudDevice = 'GPU' | 'CPU';
export type QudRiwayah = 'hafs' | 'warsh' | 'qalun' | 'shuba';

export type QudAlignOptions = {
  readonly model?: QudModel | undefined;
  readonly device?: QudDevice | undefined;
  readonly riwayah?: QudRiwayah | undefined;
  readonly padLeftMs?: number | undefined;
  readonly padRightMs?: number | undefined;
  /** Called on every progress event of the streaming route. */
  readonly onProgress?: ((progress: QudProgress) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
};

/** `POST /sessions/{id}/split`. */
export type QudSplitRequest = {
  /** Max verses per segment (default 1). */
  readonly max_verses?: number | null;
  readonly max_words?: number | null;
  /** Seconds; 30 disables. */
  readonly max_duration?: number | null;
  /** Split only where a waqf mark allows it. */
  readonly require_stop_sign?: boolean;
};

/** `POST /sessions/{id}/realign`: boundaries in seconds, recording-relative. */
export type QudRealignRequest = {
  readonly timestamps: readonly {readonly start: number; readonly end: number}[];
  readonly model_name?: QudModel;
  readonly device?: QudDevice;
  readonly riwayah?: QudRiwayah;
};

/** Every non-2xx body. */
export type QudErrorBody = {
  readonly code: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>> | null;
};

export type QudClientOptions = {
  /** Default `DEFAULT_QUD_API`. */
  readonly api?: string | undefined;
  /** A Hugging Face token to spend the caller's own GPU quota (sent as a Bearer token). Never persisted by the client. */
  readonly token?: string | null | undefined;
  /** For tests. Default: the global `fetch`. */
  readonly fetch?: typeof fetch | undefined;
};
