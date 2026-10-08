// Publishing a recitation video: YouTube chapters and a description with the credits the sources
// ask for, and a thumbnail still. Pure; the thumbnail resolves its line in calculateMetadata.
export {
  type ChaptersOptions,
  chaptersFromTimings,
  YOUTUBE_MIN_CHAPTER_SECONDS,
  YOUTUBE_MIN_CHAPTERS,
} from './chapters';
export {
  type AttributionOptions,
  attributionLines,
  FONTS_ATTRIBUTION,
  QUD_ATTRIBUTION,
  type YoutubeDescriptionOptions,
  youtubeDescription,
} from './description';
export * from './thumbnail';
