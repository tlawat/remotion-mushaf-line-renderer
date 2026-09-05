import React, {useEffect, useRef, useState} from 'react';
import {useDelayRender} from 'remotion';
import {getMushafLine} from '../get-mushaf-line';
import {loadPageFont} from '../load-page-font';
import {assertLine, assertPage, getMushafDefinition} from '../mushafs';
import type {MushafId, MushafLineData} from '../types';
import {LineRenderer, type LineRendererProps} from './LineRenderer';

type ResolveLineProps = Omit<LineRendererProps, 'line'> & {
  readonly mushaf: MushafId;
  readonly page: number;
  readonly line: number;
};

type State = {readonly key: string; readonly data?: MushafLineData; readonly error?: Error};

/**
 * Convenience path (`mushaf` + `page` + `line`): resolves the line with `getMushafLine()` behind a
 * `delayRender()` handle. Prefer resolving in `calculateMetadata()` and passing `line` instead: it
 * runs once rather than per render tab, and the Player never runs calculateMetadata.
 */
export const ResolveLine: React.FC<ResolveLineProps> = ({mushaf, page, line, ...common}) => {
  const def = getMushafDefinition(mushaf);
  assertPage(def, page);
  assertLine(def, page, line);
  const {delayRender, continueRender} = useDelayRender();
  const key = `${mushaf}/${page}/${line}`;
  const [state, setState] = useState<State | null>(null);
  const resolved = state?.key === key ? state : null;
  const handleRef = useRef<{key: string; handle: number} | null>(null);
  if (!resolved && handleRef.current?.key !== key) {
    // Render-phase handle (docs' useState(() => delayRender()) pattern), one per key.
    if (handleRef.current) continueRender(handleRef.current.handle);
    handleRef.current = {key, handle: delayRender(`<MushafLine> resolving ${mushaf} page ${page} line ${line}`)};
  }
  useEffect(() => {
    let alive = true;
    loadPageFont({mushaf, page}); // start the font early; idempotent; adopts any registered override
    getMushafLine({mushaf, page, line}).then(
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
  }, [key, mushaf, page, line]);
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
