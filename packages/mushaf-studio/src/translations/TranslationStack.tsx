import * as React from 'react';
import {describeValue, MushafStudioError} from '../errors';
import type {AyahTranslation} from '../types';
import {type TranslationAlign, TranslationBlock} from './TranslationBlock';

/** One translation of a `<TranslationStack>`, with its own type. */
export type TranslationLayer = {
  readonly translation: AyahTranslation;
  readonly fontFamily: string;
  /** px. */
  readonly fontSize: number;
  readonly color: string;
  readonly direction: 'ltr' | 'rtl';
};

export type TranslationStackProps = {
  /** One to three translations, top to bottom. */
  readonly layers: readonly TranslationLayer[];
  /** The ayah to show, `"surah:ayah"`; every layer shows the same one, `null` for none. */
  readonly ayahKey: string | null;
  /** Where every layer's lines sit, relative to its own direction (default `'start'`). */
  readonly align?: TranslationAlign | undefined;
  /** px between a translation and the rule, on each side (default 12). */
  readonly gap?: number | undefined;
  /** The rule's colour (default the first layer's, at `ruleOpacity`). */
  readonly ruleColor?: string | undefined;
  /** px (default 1). */
  readonly ruleThickness?: number | undefined;
  /** 0-1, the rule's own opacity (default 0.35). */
  readonly ruleOpacity?: number | undefined;
  /** 0-1: the whole stack's opacity (the composition fades it with its line). */
  readonly opacity?: number | undefined;
  readonly style?: React.CSSProperties | undefined;
  readonly className?: string | undefined;
};

/** At most this many translations in one stack: more no longer reads under a line of the mushaf. */
export const MAX_TRANSLATION_LAYERS = 3;

/**
 * Several translations of the same ayah stacked, each a `<TranslationBlock>` with its own font,
 * size, colour and direction, separated by a thin rule. Every block keeps its height when it has
 * no text for the ayah, so the layout never jumps. Nothing for an empty `layers`; more than three is
 * a `BAD_STUDIO_PROP`. Pure in its props.
 */
export const TranslationStack: React.FC<TranslationStackProps> = ({
  layers,
  ayahKey,
  align,
  gap,
  ruleColor,
  ruleThickness,
  ruleOpacity,
  opacity,
  style,
  className,
}) => {
  if (layers.length > MAX_TRANSLATION_LAYERS) {
    throw new MushafStudioError(
      'BAD_STUDIO_PROP',
      `A translation stack holds 1 to ${MAX_TRANSLATION_LAYERS} translations; got ${describeValue(layers)}. Remove one.`,
      {layers: layers.length},
    );
  }
  const first = layers[0];
  if (!first) return null;
  const space = gap ?? 12;
  return (
    <div
      className={className ? `mushaf-translation-stack ${className}` : 'mushaf-translation-stack'}
      data-ayah-key={ayahKey ?? undefined}
      style={{display: 'flex', flexDirection: 'column', opacity: opacity ?? 1, ...style}}
    >
      {layers.map((layer, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a layer is a position (top, middle, bottom); one translation may fill two.
        <React.Fragment key={i}>
          {i > 0 ? (
            <div
              data-mushaf-rule=""
              style={{
                height: ruleThickness ?? 1,
                margin: `${space}px 0`,
                background: ruleColor ?? first.color,
                opacity: ruleOpacity ?? 0.35,
              }}
            />
          ) : null}
          <TranslationBlock
            translation={layer.translation}
            ayahKey={ayahKey}
            fontFamily={layer.fontFamily}
            fontSize={layer.fontSize}
            color={layer.color}
            direction={layer.direction}
            align={align}
          />
        </React.Fragment>
      ))}
    </div>
  );
};
