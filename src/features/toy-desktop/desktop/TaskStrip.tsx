import { useEffect, useRef, useState } from 'react';
import { t } from '../../../core/strings/defineStrings.ts';
import { Emoji } from '../../../components/ui/Emoji.tsx';
import { AppPicture } from './AppPicture.tsx';
import { useDesktopContext } from './desktopContext.ts';
import { APP_NAMES } from './labels.ts';
import { isHighlighted } from './parts.ts';
import { strings } from './strings.ts';
import { windowTitle } from './windowTitle.ts';
import { byWindowNumber } from './windowOrder.ts';

/**
 * The strip along the bottom: the app launcher, then one button for each open window. A button
 * brings its window forward, or brings back a minimized one. The button of the window in front
 * minimizes it, as on most computers.
 */
export function TaskStrip() {
  const { desktop, kit, parts, highlight, sayName, open } = useDesktopContext();
  const { state, dispatch } = desktop;
  const [launcherOpen, setLauncherOpen] = useState(false);
  const strip = useRef<HTMLDivElement | null>(null);
  const firstApp = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!launcherOpen) return undefined;
    firstApp.current?.focus();
    return kit.scope.listen(document, 'pointerdown', (event: PointerEvent) => {
      if (event.target instanceof Node && strip.current?.contains(event.target)) return;
      setLauncherOpen(false);
    });
  }, [launcherOpen, kit.scope]);

  return (
    <div className='td-task-strip' ref={strip} data-task-strip>
      {parts.launcher.length > 0 && (
        <div className='td-launcher'>
          <button
            type='button'
            className='td-launcher-button'
            data-launcher
            data-highlight={isHighlighted(highlight, { kind: 'launcher' })}
            aria-haspopup='true'
            aria-expanded={launcherOpen}
            {...sayName(strings.apps)}
            onClick={() => setLauncherOpen(!launcherOpen)}
          >
            <Emoji id='house' decorative className='td-task-picture' />
            {t(strings.apps)}
          </button>
          {launcherOpen && (
            <ul className='td-launcher-list' aria-label={t(strings.apps)}>
              {parts.launcher.map((app, index) => (
                <li key={app}>
                  <button
                    type='button'
                    className='td-list-item'
                    data-launch-app={app}
                    data-highlight={isHighlighted(highlight, { kind: 'launch-app', app })}
                    ref={index === 0 ? firstApp : undefined}
                    {...sayName(APP_NAMES[app])}
                    onClick={() => {
                      setLauncherOpen(false);
                      open({ type: 'open-app', app });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      setLauncherOpen(false);
                    }}
                  >
                    <AppPicture app={app} className='td-list-picture' />
                    {t(APP_NAMES[app])}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ul className='td-tasks' aria-label={t(strings.taskStrip)}>
        {state.windows.toSorted(byWindowNumber).map((window) => {
          const front = window.id === state.focusedWindowId && !window.minimized;
          const title = windowTitle(state, window);
          return (
            <li key={window.id}>
              <button
                type='button'
                className='td-task'
                data-task-window={window.id}
                data-minimized={window.minimized}
                data-highlight={isHighlighted(highlight, { kind: 'task', windowId: window.id })}
                aria-current={front ? 'true' : undefined}
                {...sayName(APP_NAMES[window.app.kind])}
                onClick={() =>
                  dispatch(
                    front
                      ? { type: 'minimize-window', windowId: window.id }
                      : { type: 'activate-window', windowId: window.id },
                  )
                }
              >
                <AppPicture app={window.app.kind} className='td-task-picture' />
                <span className='td-task-name'>{title.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
