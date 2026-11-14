import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installInputGuards } from './app/inputGuards.ts';
import { runMenuCommand } from './app/menuCommands.ts';
import { createAppRouter } from './app/router.ts';
import { SessionProvider } from './app/session/SessionProvider.tsx';
import { createSessionStore } from './app/session/sessionStore.ts';
import { createSteppableClock, exposeTestClock } from './app/testClock.ts';
import { AudioProvider } from './audio/AudioProvider.tsx';
import { createAppAudio } from './audio/createAppAudio.ts';
import { exposeKitTime } from './activityShell/kitTime.ts';
import { exposeAudioTestLog } from './audio/testLog.ts';
import { getBridge } from './platform/getBridge.ts';
import { installTestHook, isTestRun } from './platform/testHook.ts';
import './styles/index.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing the #root element.');
}

installInputGuards(document);
const bridge = getBridge();
bridge.window.onMenuCommand((command) => runMenuCommand(command, document));
void installTestHook(bridge, window.location);

// The audio test log is chosen when the engine is made, so the engine waits for the bridge info.
const underTest = await isTestRun(bridge, window.location).catch(() => false);
const audio = createAppAudio({ underTest });
if (underTest) {
  exposeAudioTestLog(audio);
  exposeKitTime();
}

// A test steps this clock to run out the session length without waiting.
const clock = underTest
  ? createSteppableClock({ now: () => Date.now(), monotonic: () => performance.now() })
  : undefined;
if (clock !== undefined) exposeTestClock(clock);

const session = createSessionStore({ bridge, audio, clock });
void session.start();

createRoot(container).render(
  <StrictMode>
    <SessionProvider store={session}>
      <AudioProvider engine={audio}>
        <RouterProvider router={createAppRouter()} />
      </AudioProvider>
    </SessionProvider>
  </StrictMode>,
);
