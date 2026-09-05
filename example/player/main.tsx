// <Player> harness: renders the LineHarness composition for one scenario and exposes a small
// window.__harness API (seek, remount, switch scenario) for the Playwright suite. Also a handy
// manual check: `pnpm --filter remotion-mushaf-line-renderer-example player`, then open
// http://localhost:4173/player/?scenario=fade
import {Player, type PlayerRef} from '@remotion/player';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {LineHarness, type LineHarnessProps} from '../src/harness/LineHarness';
import {scenarioNames, scenarios} from './scenarios';

declare global {
  interface Window {
    __harness: {
      scenario: string;
      seekTo: (frame: number) => void;
      getCurrentFrame: () => number;
      remount: () => void;
      setScenario: (name: string) => void;
      mounts: number;
    };
  }
}

const params = new URLSearchParams(location.search);
const initialScenario = params.get('scenario') ?? 'static';
if (params.get('hostile') === '1') {
  // Hostile page CSS: the line must not inherit any of it.
  const style = document.createElement('style');
  style.textContent = 'body { letter-spacing: 6px; word-spacing: 12px; font-weight: 700; font-style: italic; text-transform: uppercase; line-height: 3; font-family: serif; }';
  document.head.appendChild(style);
}

const errorFallback = ({error}: {error: Error}): React.ReactNode => (
  <pre data-error={(error as Error & {code?: string}).code ?? 'Error'} style={{whiteSpace: 'pre-wrap', padding: 16, margin: 0, color: '#b00020', background: '#fff'}}>
    {error.message}
  </pre>
);

const App: React.FC = () => {
  const [scenario, setScenario] = React.useState(initialScenario);
  const [mountKey, setMountKey] = React.useState(0);
  const ref = React.useRef<PlayerRef>(null);
  const props: LineHarnessProps | undefined = scenarios[scenario];
  React.useEffect(() => {
    window.__harness = {
      scenario,
      mounts: mountKey + 1,
      seekTo: (frame) => ref.current?.seekTo(frame),
      getCurrentFrame: () => ref.current?.getCurrentFrame() ?? -1,
      remount: () => setMountKey((k) => k + 1),
      setScenario,
    };
  }, [scenario, mountKey]);
  if (!props) {
    return <pre data-error="UNKNOWN_SCENARIO">Unknown scenario "{scenario}". Known: {scenarioNames.join(', ')}</pre>;
  }
  return (
    <div data-mount={mountKey} data-scenario={scenario}>
      <Player
        key={`${scenario}/${mountKey}`}
        ref={ref}
        component={LineHarness}
        inputProps={props}
        durationInFrames={120}
        fps={30}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{width: 960, height: 540}}
        controls={false}
        autoPlay={false}
        initiallyShowControls={false}
        errorFallback={errorFallback}
      />
    </div>
  );
};

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
