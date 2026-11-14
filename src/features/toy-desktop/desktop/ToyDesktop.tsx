import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { toyClipboard } from '../../../app/inputGuards.ts';
import type { SfxName } from '../../../audio/sfx/sfxNames.ts';
import type { Band } from '../../../core/bands.ts';
import { t, type SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { commandForKey } from '../model/menus.ts';
import { focusedWindow, type AppKind } from '../model/state.ts';
import { getNode, type FsNode } from '../model/fileSystem.ts';
import type { DesktopEvent } from '../model/events.ts';
import { calculatorKeyFor } from './apps/CalculatorApp.tsx';
import {
  DesktopContext,
  type DesktopContextValue,
  type DesktopKit,
  type Notice,
  type OpenAction,
} from './desktopContext.ts';
import { DesktopIcons } from './DesktopIcons.tsx';
import { rejectionSentence } from './labels.ts';
import { comfortableSize, contentZoom, fitDesktop } from './layout.ts';
import { FileDialogView } from './FileDialogView.tsx';
import { MenuBar } from './MenuBar.tsx';
import { withDefaults, type DesktopParts, type HighlightTarget } from './parts.ts';
import { strings } from './strings.ts';
import { TaskStrip } from './TaskStrip.tsx';
import './toyDesktop.css';
import type { DesktopHandle } from './useDesktop.ts';
import { usePlatformOs } from './usePlatformOs.ts';
import { DesktopWindow } from './Window.tsx';
import { byWindowNumber } from './windowOrder.ts';

export interface ToyDesktopProps {
  readonly desktop: DesktopHandle;
  readonly kit: DesktopKit;
  readonly band: Band;
  /** Which parts show. Everything, by default. */
  readonly parts?: DesktopParts;
  /** A control to point at, such as after a couple of tries. */
  readonly highlight?: HighlightTarget | null;
}

/** The music box's notes, lowest first. */
const NOTE_SOUNDS: readonly SfxName[] = ['note-1', 'note-2', 'note-3', 'note-4', 'note-5'];

/** The toy computer's sound for an event, if it makes one. */
function eventSound(event: DesktopEvent): SfxName | null {
  switch (event.type) {
    case 'window-opened':
    case 'window-restored':
      return 'open';
    case 'window-closed':
      return 'close';
    case 'window-minimized':
    case 'node-trashed':
    case 'trash-emptied':
      return 'whoosh';
    case 'file-saved':
      return 'snap';
    case 'note-toggled':
      return event.on ? (NOTE_SOUNDS[event.note] ?? null) : null;
    default:
      return null;
  }
}

/** The app a file opens in, or null for a folder or nothing. */
function appForNode(node: FsNode | undefined): AppKind | null {
  switch (node?.kind) {
    case 'note':
      return 'notepad';
    case 'picture':
      return 'picture-viewer';
    case 'tune':
      return 'music-box';
    default:
      return null;
  }
}

function isTextTarget(target: EventTarget): boolean {
  return target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === 'text');
}

function isControlTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLButtonElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement
  );
}

/**
 * A pretend computer inside the app, drawn as a friendly monitor so it never looks like the real
 * one. It renders a model state and sends every change through the model, so a lesson sees the
 * same events whether the child used the mouse, a menu, a shortcut, or the task strip.
 *
 * The desktop scales its window places to fit the monitor, while the controls inside keep the
 * band's real target size and text size. Nothing here touches real files or the real clipboard.
 */
/** The band's smallest target as rendered in `element`, in CSS pixels, zoom included. */
function measureTarget(element: HTMLElement): number {
  const probe = element.ownerDocument.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--wk-target-min)';
  element.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

export function ToyDesktop({ desktop, kit, band, parts: partsIn, highlight = null }: ToyDesktopProps) {
  const parts = useMemo(() => withDefaults(partsIn), [partsIn]);
  const os = usePlatformOs();
  const viewport = useRef<HTMLDivElement | null>(null);
  const area = useRef<HTMLDivElement | null>(null);
  const screen = useRef<HTMLElement | null>(null);
  const [space, setSpace] = useState({ width: 0, height: 0 });
  const spaceRef = useRef(space);
  useLayoutEffect(() => {
    spaceRef.current = space;
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ windowId: string | null; serial: number } | null>(null);
  const { state, dispatch, listen } = desktop;
  const fit = fitDesktop(space);
  // Read again whenever the space changes, which a change of the app's window size causes.
  const zoom = contentZoom(band, { width: globalThis.innerWidth, height: globalThis.innerHeight });
  const measured = space.width > 0 && space.height > 0;

  // Measure the space the desktop has, and follow it as the window changes size.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element === null) return undefined;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setSpace((current) =>
        Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The model's desktop follows the space, so windows stay reachable in it.
  useEffect(() => {
    if (!measured) return;
    if (fit.size.width !== state.size.width || fit.size.height !== state.size.height) {
      dispatch({ type: 'set-desktop-size', width: fit.size.width, height: fit.size.height });
    }
  }, [measured, fit.size.width, fit.size.height, state.size.width, state.size.height, dispatch]);

  // Sounds, gentle words for a refused action, and where keyboard focus goes next.
  useEffect(
    () =>
      listen((transition, action) => {
        const { events } = transition;
        const quiet = transition.state.system.muted || transition.state.system.volume === 0;
        for (const event of events) {
          const sound = event.type === 'step-played' ? null : eventSound(event);
          if (sound !== null && !quiet) kit.play(sound);
          if (event.type === 'step-played' && !quiet) {
            for (const note of event.notes) {
              const name = NOTE_SOUNDS[note];
              if (name !== undefined) kit.play(name);
            }
          }
        }
        const rejected = events.find((event) => event.type === 'rejected');
        if (rejected !== undefined) {
          const sentence = rejectionSentence(rejected.reason);
          if (sentence !== null) {
            setNotice({ windowId: 'windowId' in action ? action.windowId : null, handle: sentence });
            void kit.speak(sentence);
          }
          return;
        }
        if (events.length > 0) setNotice((current) => (current === null ? current : null));
        // A window that came forward any way but a click inside it gets keyboard focus.
        const focused = events.findLast((event) => event.type === 'window-focused');
        if (focused !== undefined && action.type !== 'focus-window' && focused.type === 'window-focused') {
          setFocusRequest((current) => ({ windowId: focused.windowId, serial: (current?.serial ?? 0) + 1 }));
        } else if (transition.state.windows.length === 0 && events.some((event) => event.type === 'window-closed')) {
          setFocusRequest((current) => ({ windowId: null, serial: (current?.serial ?? 0) + 1 }));
        }
      }),
    [listen, kit],
  );

  const focusContent = useCallback((windowId: string | null) => {
    setFocusRequest((current) => ({ windowId, serial: (current?.serial ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (focusRequest === null) return;
    const root = area.current;
    if (root === null) return;
    if (focusRequest.windowId === null) {
      root.querySelector<HTMLElement>('.td-icon')?.focus();
      return;
    }
    const element = root.querySelector<HTMLElement>(`[data-window="${focusRequest.windowId}"]`);
    if (element === null || element.contains(document.activeElement)) return;
    // Focus goes to the text of a notepad, ready to type, and otherwise to the window itself, so
    // opening a window never makes one of its buttons say its name.
    const target = element.querySelector<HTMLElement>('textarea') ?? element;
    target.focus();
  }, [focusRequest]);

  // A hint at an app's own control: any element inside the screen with a matching data-highlight-key.
  const highlightKey = highlight?.kind === 'key' ? highlight.key : null;
  useEffect(() => {
    if (highlightKey === null) return undefined;
    const marked = [...(screen.current?.querySelectorAll<HTMLElement>('[data-highlight-key]') ?? [])].filter(
      (element) => element.dataset.highlightKey === highlightKey,
    );
    for (const element of marked) element.dataset.highlight = 'true';
    return () => {
      for (const element of marked) delete element.dataset.highlight;
    };
  });

  const open = useCallback(
    (action: OpenAction) => {
      const now = desktop.current();
      const app = action.type === 'open-app' ? action.app : appForNode(getNode(now.fs, action.fileId));
      const targetPx = screen.current === null ? Number.NaN : measureTarget(screen.current);
      const size =
        app === null || !(targetPx > 0) ? undefined : comfortableSize(app, targetPx, fitDesktop(spaceRef.current));
      const opened = dispatch({ ...action, size });
      const windowId = opened.events.find((event) => event.type === 'window-opened')?.windowId;
      if (parts.openMaximized && windowId !== undefined) dispatch({ type: 'maximize-window', windowId });
      return opened;
    },
    [desktop, dispatch, parts.openMaximized],
  );

  const talkative = band !== 'band-9-12';
  const sayName = useCallback(
    (handle: SpokenHandle) => {
      if (!talkative) return {};
      const say = () => void kit.speak(handle);
      return { onPointerEnter: say, onFocus: say };
    },
    [kit, talkative],
  );

  const context = useMemo<DesktopContextValue>(
    () => ({ desktop, kit, band, os, parts, scale: fit.scale, highlight, notice, focusContent, open, sayName }),
    [desktop, kit, band, os, parts, fit.scale, highlight, notice, focusContent, open, sayName],
  );

  /** Menu shortcuts, and typing into the calculator, for the window in front. */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    const front = focusedWindow(state);
    if (front === undefined) return;
    const target = event.target;
    if (target === null) return;
    const modified = event.ctrlKey || event.metaKey;
    if (!modified) {
      if (isTextTarget(target)) return;
      const plainKeyOnControl = isControlTarget(target) && event.key !== 'Delete';
      if (front.app.kind === 'calculator' && !(plainKeyOnControl && (event.key === 'Enter' || event.key === ' '))) {
        const key = calculatorKeyFor(event.key);
        if (key !== null && !event.altKey) {
          event.preventDefault();
          dispatch({ type: 'calculator', windowId: front.id, key });
          return;
        }
      }
      if (plainKeyOnControl) return;
    }
    const command = commandForKey(state, front.id, event, os, toyClipboard);
    if (command === null) return;
    event.preventDefault();
    dispatch({ type: 'command', windowId: front.id, command });
  };
  // A key press reaches the screen after the control that has focus, which handles it first.
  const keys = useRef(onKeyDown);
  useLayoutEffect(() => {
    keys.current = onKeyDown;
  });
  useEffect(() => {
    const element = screen.current;
    if (element === null) return undefined;
    return kit.scope.listen(element, 'keydown', (event: KeyboardEvent) => keys.current(event));
  }, [kit.scope]);

  const showMenuBar = parts.menuBar || parts.systemSound;
  const layers = new Map(state.windows.map((window, index) => [window.id, index + 1]));
  return (
    <DesktopContext.Provider value={context}>
      <div className='td-monitor' data-band={band} style={{ '--wk-zoom': zoom } as CSSProperties}>
        <section
          className='td-screen'
          aria-label={t(strings.screen)}
          data-wallpaper={state.settings.wallpaper}
          ref={screen}
        >
          {showMenuBar && <MenuBar />}
          <div className='td-viewport' ref={viewport}>
            <div
              className='td-desktop'
              ref={area}
              data-measured={measured}
              data-desktop-size={`${String(state.size.width)}x${String(state.size.height)}`}
              style={{ width: state.size.width * fit.scale, height: state.size.height * fit.scale }}
            >
              <DesktopIcons />
              {state.windows
                .filter((window) => !window.minimized)
                .toSorted(byWindowNumber)
                .map((window) => (
                  <DesktopWindow
                    key={window.id}
                    window={window}
                    layer={layers.get(window.id) ?? 1}
                    focused={window.id === state.focusedWindowId}
                    area={area}
                  />
                ))}
              {state.windows
                .filter((window) => !window.minimized)
                .map((window) => (
                  <FileDialogView key={`dialog-${window.id}`} window={window} layer={layers.get(window.id) ?? 1} />
                ))}
            </div>
          </div>
          {parts.taskStrip && <TaskStrip />}
          <div
            className='td-dim'
            aria-hidden='true'
            style={{ opacity: ((100 - state.settings.brightness) / 100) * 0.75 }}
          />
        </section>
        <div className='td-stand' aria-hidden='true' />
      </div>
    </DesktopContext.Provider>
  );
}
