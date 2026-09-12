import {useEffect, useLayoutEffect} from 'react';

/** `useLayoutEffect` warns during server rendering; nothing here has a DOM to inspect there anyway. */
export const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
