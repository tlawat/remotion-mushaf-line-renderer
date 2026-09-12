import type * as React from 'react';
import {useEffect, useRef, useState} from 'react';
import {useDelayRender} from 'remotion';
import {loadPageFont} from '../fonts/load-page-font';
import {assertLine, assertPage, resolveSelection} from '../mushaf/registry';
import {getMushafLine} from '../resolve/get-mushaf-line';
import type {MushafDataOptions, MushafLineData, MushafSelection} from '../types';
import {LineRenderer, type LineRendererProps} from './LineRenderer';

type ResolveLineProps = Omit<LineRendererProps, 'line'> &
  MushafSelection &
  MushafDataOptions & {
    readonly page: number;
    readonly line: number;
  };

type State = {readonly key: string; readonly data?: MushafLineData; readonly error?: Error};

/**
 * Convenience path (`page` + `line` + a selection): resolves the line with `getMushafLine()` behind
 * a `delayRender()` handle. Prefer resolving in `calculateMetadata()` and passing `line` instead:
 * it runs once rather than per render tab, and the Player never runs calculateMetadata.
 */
export const ResolveLine: React.FC<ResolveLineProps> = ({mushaf, theme, page, line, data, ...common}) => {
  // Validated during render, so a bad theme, page or line throws where the caller can see it.
  const selection = resolveSelection({mushaf, theme});
  assertPage(selection.def, page);
  assertLine(selection.def, page, line);
  const {delayRender, continueRender} = useDelayRender();
  // The source URLs, not the object: a new `data` object naming the same sources is the same line.
  const words = data?.words;
  const layoutUrl = data?.layout;
  const key = `${selection.def.id}/${JSON.stringify(selection.theme?.data ?? 'plain')}/${page}/${line}/${words ?? ''} ${layoutUrl ?? ''}`;
  const [state, setState] = useState<State | null>(null);
  const resolved = state?.key === key ? state : null;
  const handleRef = useRef<{key: string; handle: number} | null>(null);
  if (!resolved && handleRef.current?.key !== key) {
    // Render-phase handle (docs' useState(() => delayRender()) pattern), one per key.
    if (handleRef.current) continueRender(handleRef.current.handle);
    handleRef.current = {
      key,
      handle: delayRender(`<MushafLine> resolving ${selection.def.id} page ${page} line ${line}`),
    };
  }
  useEffect(() => {
    let alive = true;
    loadPageFont({mushaf, theme, page}); // start the font early; idempotent; adopts any registered override
    const source =
      words === undefined && layoutUrl === undefined
        ? {}
        : {data: {...(words === undefined ? {} : {words}), ...(layoutUrl === undefined ? {} : {layout: layoutUrl})}};
    getMushafLine({mushaf, theme, page, line, ...source}).then(
      (data) => {
        if (alive) setState({key, data});
      },
      (error: unknown) => {
        if (alive) setState({key, error: error instanceof Error ? error : new Error(String(error))});
      },
    );
    return () => {
      alive = false;
    };
  }, [key, mushaf, theme, page, line, words, layoutUrl]);
  useEffect(() => {
    // Released only after the resolved line committed, so the frame is never captured in between.
    if (resolved && handleRef.current?.key === key) {
      continueRender(handleRef.current.handle);
      handleRef.current = null;
    }
  }, [resolved, key, continueRender]);
  useEffect(
    () => () => {
      if (handleRef.current) {
        continueRender(handleRef.current.handle);
        handleRef.current = null;
      }
    },
    [continueRender],
  );
  if (resolved?.error) throw resolved.error;
  if (!resolved?.data) return null;
  return <LineRenderer key={key} line={resolved.data} {...common} />;
};
