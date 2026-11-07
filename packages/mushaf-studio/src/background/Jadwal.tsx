import type * as React from 'react';
import {useVideoConfig} from 'remotion';
import {isLightGround} from '../schema/color';
import {frameGeometry, JADWAL_DEPTH_UNITS} from '../schema/tokens';

/** One rule of the jadwal: how far in from the frame's edge it sits and how thick it is, in px. */
export type JadwalRule = {readonly inset: number; readonly width: number};

/**
 * The two rules of the jadwal in a `width` × `height` frame: the outer one 2 u px thick at the safe
 * area (5 % of the short side), a 6 u px gap, then the inner one 1 u px thick (`u` is
 * `shortSide / 1080`). `jadwalRules(1920, 1080)` is `{outer: {inset: 54, width: 2}, inner: {inset: 62, width: 1}}`.
 */
export const jadwalRules = (
  width: number,
  height: number,
): {readonly outer: JadwalRule; readonly inner: JadwalRule} => {
  const {safe, unit} = frameGeometry(width, height);
  return {outer: {inset: safe, width: 2 * unit}, inner: {inset: safe + (JADWAL_DEPTH_UNITS - 1) * unit, width: unit}};
};

/** The jadwal's opacity: 0.55 on a light ground, 0.45 on a dark one, so the gold reads as a line, never a stripe. */
export const jadwalOpacity = (ground: string): number => (isLightGround(ground) ? 0.55 : 0.45);

export type JadwalProps = {
  /** The video's metal (`metalOf()`). */
  readonly metal: string;
  /** What the rules sit on (`groundFor()`): their strength depends on it. */
  readonly ground: string;
};

/**
 * The jadwal of a printed page (`layout.frame: 'hairline'`): two rectangular rules with square
 * corners and no corner pieces, inset at the safe area, in the metal. Drawn over the background and
 * under everything else. Pure in its props and the frame's size.
 */
export const Jadwal: React.FC<JadwalProps> = ({metal, ground}) => {
  const {width, height} = useVideoConfig();
  const {outer, inner} = jadwalRules(width, height);
  const rule = ({inset, width: thickness}: JadwalRule, name: string): React.ReactNode => (
    <div
      data-mushaf-jadwal-rule={name}
      style={{
        position: 'absolute',
        left: inset,
        top: inset,
        right: inset,
        bottom: inset,
        border: `${thickness}px solid ${metal}`,
        boxSizing: 'border-box',
      }}
    />
  );
  return (
    <div
      data-mushaf-jadwal=""
      style={{position: 'absolute', inset: 0, opacity: jadwalOpacity(ground), pointerEvents: 'none'}}
    >
      {rule(outer, 'outer')}
      {rule(inner, 'inner')}
    </div>
  );
};
