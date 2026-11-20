import { useId, useRef, type CSSProperties, type RefObject } from 'react';
import { useCarry } from '../../../activityShell/carry/useCarry.ts';
import { t } from '../../../core/strings/defineStrings.ts';
import { hasDialog, windowFrame } from '../model/desktop.ts';
import type { WindowState } from '../model/state.ts';
import { AppPicture } from './AppPicture.tsx';
import { AppView } from './apps/AppView.tsx';
import { useDesktopContext } from './desktopContext.ts';
import { toPixels } from './layout.ts';
import { isHighlighted, type WindowControl } from './parts.ts';
import { strings } from './strings.ts';
import { windowTitle } from './windowTitle.ts';
import { ControlGlyph } from './glyphs.tsx';

/** Reads the offset useCarry gives a carried item, written as "Xpx Ypx". */
function carryOffset(translate: CSSProperties['translate']): { x: number; y: number } | null {
  if (typeof translate !== 'string') return null;
  const match = /^(-?[\d.]+)px (-?[\d.]+)px$/.exec(translate);
  return match === null ? null : { x: Number(match[1]), y: Number(match[2]) };
}

export interface DesktopWindowProps {
  readonly window: WindowState;
  /** Back to front order: a higher number draws on top. */
  readonly layer: number;
  readonly focused: boolean;
  /** The desktop area, which windows move and resize within. */
  readonly area: RefObject<HTMLDivElement | null>;
}

/**
 * One window: a title bar to move it by, its buttons, the app inside, and a corner handle to
 * resize it. Moving and resizing use useCarry, so press, drag, and release works, and so does a
 * click to pick up and a click to place, or Enter, the arrow keys, and Enter again.
 */
export function DesktopWindow({ window, layer, focused, area }: DesktopWindowProps) {
  const context = useDesktopContext();
  const { desktop, kit, parts, scale, highlight, sayName, openedHere } = context;
  const { state, dispatch } = desktop;
  const frame = windowFrame(state, window);
  const pixels = toPixels(frame, scale);
  const title = windowTitle(state, window);
  const titleId = useId();
  const hintId = useId();
  const handle = useRef<HTMLButtonElement | null>(null);
  const windowId = window.id;

  const move = useCarry<'title'>(kit, {
    kind: 'free',
    area,
    position: () => ({ x: pixels.x, y: pixels.y }),
    onPlace: (_item, point) => dispatch({ type: 'move-window', windowId, x: point.x / scale, y: point.y / scale }),
  });
  const resize = useCarry<'corner'>(kit, {
    kind: 'free',
    area,
    position: () => {
      const size = handle.current?.offsetWidth ?? 0;
      return { x: pixels.x + pixels.width - size, y: pixels.y + pixels.height - size };
    },
    onPlace: (_item, point) => {
      const size = handle.current?.offsetWidth ?? 0;
      dispatch({
        type: 'resize-window',
        windowId,
        width: (point.x + size) / scale - frame.x,
        height: (point.y + size) / scale - frame.y,
      });
    },
  });

  const { style: moveStyle, ...moveProps } = move.item('title');
  const { style: resizeStyle, ...resizeProps } = resize.item('corner');
  const moving = carryOffset(moveStyle.translate);
  const growing = carryOffset(resizeStyle.translate);

  function control(kind: WindowControl) {
    if (kind === 'close') {
      return { label: strings.close, run: () => dispatch({ type: 'close-window', windowId }), glyph: 'close' as const };
    }
    if (kind === 'minimize') {
      return {
        label: strings.minimize,
        run: () => dispatch({ type: 'minimize-window', windowId }),
        glyph: 'minimize' as const,
      };
    }
    return window.maximized
      ? {
          label: strings.restoreSize,
          run: () => dispatch({ type: 'unmaximize-window', windowId }),
          glyph: 'restore' as const,
        }
      : {
          label: strings.maximize,
          run: () => dispatch({ type: 'maximize-window', windowId }),
          glyph: 'maximize' as const,
        };
  }

  return (
    <section
      className='td-window'
      aria-labelledby={titleId}
      data-window={windowId}
      data-app={window.app.kind}
      data-focused={focused}
      data-maximized={window.maximized}
      data-moving={moving !== null}
      data-resizing={growing !== null}
      tabIndex={-1}
      style={{
        left: pixels.x,
        top: pixels.y,
        width: pixels.width,
        height: pixels.height,
        zIndex: layer,
        translate: moving === null ? undefined : `${String(moving.x)}px ${String(moving.y)}px`,
      }}
      onPointerDownCapture={() => {
        if (!focused) dispatch({ type: 'focus-window', windowId });
      }}
      onFocusCapture={() => {
        if (!focused && !window.minimized) dispatch({ type: 'focus-window', windowId });
      }}
    >
      <div className='td-title-bar'>
        {parts.move ? (
          <button
            type='button'
            {...moveProps}
            style={{ touchAction: 'none' }}
            className='td-title'
            aria-describedby={hintId}
            data-highlight={isHighlighted(highlight, { kind: 'title-bar', windowId })}
          >
            <AppPicture app={window.app.kind} className='td-title-picture' />
            <span id={titleId} className='td-title-text'>
              {title.text}
            </span>
            {title.unsaved && parts.menuBar && <UnsavedMark />}
          </button>
        ) : (
          <div className='td-title' data-highlight={isHighlighted(highlight, { kind: 'title-bar', windowId })}>
            <AppPicture app={window.app.kind} className='td-title-picture' />
            <span id={titleId} className='td-title-text'>
              {title.text}
            </span>
            {title.unsaved && parts.menuBar && <UnsavedMark />}
          </div>
        )}
        <span id={hintId} hidden>
          {t(strings.moveHint)}
        </span>
        <div className='td-window-controls'>
          {windowControls(parts.windowControls, openedHere(windowId)).map((kind) => {
            const { label, run, glyph } = control(kind);
            return (
              <button
                key={kind}
                type='button'
                className='td-window-control'
                data-window-control={kind}
                data-highlight={isHighlighted(highlight, { kind: 'window-control', windowId, control: kind })}
                aria-label={t(label)}
                {...sayName(label)}
                onClick={run}
              >
                <ControlGlyph glyph={glyph} />
              </button>
            );
          })}
        </div>
      </div>
      {/* A save or open dialog answers for the window, so nothing under it takes a click or a key. */}
      <div className='td-window-body' inert={hasDialog(window.app)}>
        <AppView window={window} focused={focused} />
      </div>
      {parts.resize && !window.maximized && (
        <button
          type='button'
          {...resizeProps}
          ref={(element) => {
            handle.current = element;
            resizeProps.ref(element);
          }}
          style={{ touchAction: 'none', translate: resizeStyle.translate }}
          className='td-resize'
          aria-label={t(strings.resize)}
          data-highlight={isHighlighted(highlight, { kind: 'resize', windowId })}
          {...sayName(strings.resize)}
        >
          <ControlGlyph glyph='resize' />
        </button>
      )}
      {growing !== null && (
        <div
          className='td-resize-outline'
          aria-hidden='true'
          style={{
            width: Math.max(0, pixels.width + growing.x),
            height: Math.max(0, pixels.height + growing.y),
          }}
        />
      )}
    </section>
  );
}

/** The title bar buttons. A window the child opened always has a close button. */
function windowControls(controls: readonly WindowControl[], openedHere: boolean): readonly WindowControl[] {
  return openedHere && !controls.includes('close') ? [...controls, 'close'] : controls;
}

function UnsavedMark() {
  return (
    <span className='td-unsaved'>
      <span className='td-unsaved-dot' aria-hidden='true' />
      <span className='wk-visually-hidden'>{t(strings.unsaved)}</span>
    </span>
  );
}
