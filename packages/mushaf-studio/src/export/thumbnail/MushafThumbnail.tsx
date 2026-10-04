import {fontSizeForWidth, lineHeightForFontSize, MushafLine, MushafSurahName} from '@tlawat/remotion-mushaf-line';
import type * as React from 'react';
import {AbsoluteFill, Img, staticFile, useVideoConfig} from 'remotion';
import {BACKGROUND_IMAGE_STYLE, fileUrl} from '../../compositions/shared';
import {MushafStudioError} from '../../errors';
import {fontPropsFrom} from '../../schema';
import {type ResolvedThumbnail, thumbnailSubtitle} from './calculate-metadata';
import type {MushafThumbnailProps} from './schema';

/** The surah name's frame spans this share of the measure: the hero line under it spans all of it. */
const NAME_SHARE = 0.75;

/**
 * The video's thumbnail, a still: over the background colour (and image), centred top to bottom,
 * the surah's name in its printed frame (`<MushafSurahName framed>`), the first printed line of
 * `fromAyah` across the measure (`<MushafLine>`), the title and the subtitle. The fonts load behind
 * `delayRender()` in the package's components. Pure in its props.
 */
export const MushafThumbnail: React.FC<MushafThumbnailProps> = (props) => {
  const {width} = useVideoConfig();
  const resolved = props.resolved as ResolvedThumbnail | null;
  if (!resolved) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      'MushafThumbnail: `resolved` is null. calculateMetadata fills it in: pass calculateMushafThumbnailMetadata to <Still calculateMetadata>, or resolve the props with resolveThumbnail().',
      {prop: 'resolved'},
    );
  }
  const measure = Math.max(1, width - 2 * props.marginX);
  const lineFontSize = fontSizeForWidth(measure);
  const lineHeight = lineHeightForFontSize(lineFontSize);
  const nameWidth = Math.round(measure * NAME_SHARE);
  const nameFontSize = fontSizeForWidth(nameWidth);
  const nameLineHeight = lineHeightForFontSize(nameFontSize);
  const fontProps = fontPropsFrom(props.fonts, resolved.line.fontSet, staticFile).props;
  const subtitle = thumbnailSubtitle(props);
  return (
    <AbsoluteFill style={{backgroundColor: props.background, color: props.color}}>
      {props.backgroundImage !== '' && (
        <Img src={fileUrl(props.backgroundImage, staticFile)} style={BACKGROUND_IMAGE_STYLE} />
      )}
      <div
        data-mushaf-thumbnail=""
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Math.round(props.subtitleSize * 0.4),
          fontFamily: props.font,
          textAlign: 'center',
        }}
      >
        <div data-mushaf-thumbnail-part="surah-name" style={{width: nameWidth, height: nameLineHeight}}>
          <MushafSurahName
            surah={props.surah}
            framed
            fontSize={nameFontSize}
            lineHeight={nameLineHeight}
            {...fontProps}
          />
        </div>
        <div data-mushaf-thumbnail-part="line" style={{width: measure, height: lineHeight}}>
          <MushafLine line={resolved.line} fontSize={lineFontSize} lineHeight={lineHeight} {...fontProps} />
        </div>
        {props.title !== '' && (
          <div
            data-mushaf-thumbnail-part="title"
            dir="auto"
            style={{fontSize: props.titleSize, lineHeight: 1.2, fontWeight: 600}}
          >
            {props.title}
          </div>
        )}
        {subtitle !== '' && (
          <div
            data-mushaf-thumbnail-part="subtitle"
            dir="auto"
            style={{fontSize: props.subtitleSize, lineHeight: 1.3, opacity: 0.8}}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
