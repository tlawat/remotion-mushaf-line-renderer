/**
 * Fetch budgets shared by the font and the data loaders, and the two facts they are sized from.
 *
 * Remotion-free on purpose: the data loader runs inside `getMushafLine()`, which is documented as
 * importable from plain Node without pulling `remotion` into the module graph.
 */
export type LoadBudget = {
  readonly attempts: number;
  readonly perAttemptMs: number;
  readonly backoffMs: number;
};

/**
 * Sizes the fetch attempts so that a definite failure always beats the `delayRender` timeout:
 * while rendering the handle times out at `--timeout − 2 s` (30 s default), so two attempts of
 * ~12.75 s plus one backoff fit inside it; outside rendering (Studio, Player, Node) there is no
 * timeout and three generous attempts are used.
 */
export const getLoadBudget = (isRendering: boolean, puppeteerTimeout: number | undefined): LoadBudget => {
  if (!isRendering) return {attempts: 3, perAttemptMs: 15_000, backoffMs: 500};
  const handleTimeout = (puppeteerTimeout ?? 30_000) - 2_000;
  return {attempts: 2, perAttemptMs: Math.max(4_000, Math.floor((handleTimeout - 2_500) / 2)), backoffMs: 500};
};

/** Remotion's renderer sets this on the page before it loads; absent in the Studio, the Player and Node. */
export const readPuppeteerTimeout = (): number | undefined => {
  if (typeof window === 'undefined') return undefined;
  const timeout = (window as unknown as {remotion_puppeteerTimeout?: unknown}).remotion_puppeteerTimeout;
  return typeof timeout === 'number' ? timeout : undefined;
};

/** True inside a rendering tab — the one place a fetch has a deadline to beat. */
export const looksLikeRendering = (): boolean => readPuppeteerTimeout() !== undefined;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP statuses a retry cannot fix. */
export const isFinalStatus = (status: number): boolean => status < 500 && status !== 408 && status !== 429;
