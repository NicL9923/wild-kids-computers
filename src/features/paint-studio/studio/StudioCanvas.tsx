import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH } from '../../../core/paint/document.ts';
import { isEmptyRect } from '../../../core/paint/rect.ts';
import type { ToolPoint } from '../../../core/paint/types.ts';
import { t } from '../../../core/strings/defineStrings.ts';
import { strings } from '../strings.ts';
import type { Scope } from '../../../core/activityKit/scope.ts';
import {
  PEN_UP,
  isPenDown,
  penDown,
  penKey,
  penLift,
  penMove,
  penUp,
  type PenBehavior,
  type PenResult,
  type PenState,
  type PointerKind,
  type ScreenPoint,
} from './penInput.ts';
import type { StudioDocument } from './studioDocument.ts';

/** What the canvas asks of the current tool. The studio swaps it when the tool changes. */
export interface ToolDriver {
  readonly behavior: PenBehavior;
  /** Size of the pen ring in document pixels, or 0 for none. */
  readonly ringSize: number;
  /** False for preview tools (line, shapes) that only need the final point of a coalesced batch. */
  readonly coalesce?: boolean;
  /** A picture that follows the pointer, such as the chosen stamp, with its CSS transform. */
  readonly ghost?: { readonly url: string; readonly size: number; readonly transform: string };
  begin(at: ToolPoint): void;
  move(points: readonly ToolPoint[]): void;
  end(): void;
}

export interface StudioCanvasHandle {
  /** Ends any stroke in progress, such as when the tool changes. */
  lift(): void;
  /** Moves keyboard focus back to the canvas, such as after committing or cancelling text. */
  focus(): void;
  readonly penDown: boolean;
}

interface StudioCanvasProps {
  readonly studio: StudioDocument;
  readonly driver: ToolDriver;
  readonly scope: Scope;
  /** True while a whole-picture effect runs. Input waits. */
  readonly busy: boolean;
  readonly onPenChange: (down: boolean) => void;
  readonly handleRef: { current: StudioCanvasHandle | null };
  /** Shown on top of the picture, in a place fixed to its corner, such as the pen-down badge. */
  readonly overlay?: ReactNode;
}

/**
 * The engine's pixels as ImageData wants them. Surfaces are always made from plain ArrayBuffers,
 * never shared memory, so wrapping them copies nothing and is safe.
 */
function isPlainPixels(data: Uint8ClampedArray): data is Uint8ClampedArray<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer;
}

function pixels(data: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  if (!isPlainPixels(data)) throw new TypeError('Paint pixels must not live in shared memory.');
  return data;
}

function pointerKind(event: ReactPointerEvent): PointerKind {
  return event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse';
}

const identity = (point: ScreenPoint): ToolPoint => point;

/** How long the pointer may stay off the canvas before the pen lifts by itself. */
const LEAVE_LIFT_MS = 700;
/** Keyboard cursor steps, in document pixels. Shift moves farther. */
const KEY_STEP = 20;
const KEY_STEP_FAR = 100;

/**
 * The picture. The paint layer and the coloring page lines are two stacked canvases at the
 * document's own size, scaled together by CSS to fit. Pointer input runs through the sticky pen,
 * and the area each stroke changes is copied to the screen once per animation frame.
 */
function mapClient(clientX: number, clientY: number, box: DOMRect | undefined): ToolPoint {
  if (box === undefined || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - box.left) / box.width) * DOCUMENT_WIDTH,
    y: ((clientY - box.top) / box.height) * DOCUMENT_HEIGHT,
  };
}

export function StudioCanvas({ studio, driver, scope, busy, onPenChange, handleRef, overlay }: StudioCanvasProps) {
  const paintRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cursorElRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<PenState>(PEN_UP);
  const activePointerId = useRef<number | null>(null);
  const pointerPosRef = useRef<ToolPoint | null>(null);
  const pointerFocusing = useRef(false);
  const driverRef = useRef(driver);
  const busyRef = useRef(busy);
  const leaveTimer = useRef<() => void>(() => undefined);
  const [cursor, setCursor] = useState<ToolPoint>({ x: DOCUMENT_WIDTH / 2, y: DOCUMENT_HEIGHT / 2 });
  const [keyboardActive, setKeyboardActive] = useState(false);
  const keyboardActiveRef = useRef(keyboardActive);
  const [down, setDown] = useState(false);
  const downRef = useRef(down);
  const keysId = useId();

  const frameScheduler = useRef<() => void>(() => undefined);

  const scopeRef = useRef(scope);

  useLayoutEffect(() => {
    driverRef.current = driver;
    busyRef.current = busy;
    scopeRef.current = scope;
    keyboardActiveRef.current = keyboardActive;
    downRef.current = down;
  }, [driver, busy, scope, keyboardActive, down]);

  const syncCursorElement = useCallback((point: ToolPoint | null): void => {
    const el = cursorElRef.current;
    if (el === null) return;
    if (point === null) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.left = `${(point.x / DOCUMENT_WIDTH) * 100}%`;
    el.style.top = `${(point.y / DOCUMENT_HEIGHT) * 100}%`;
  }, []);

  useEffect(() => {
    syncCursorElement(keyboardActive ? cursor : pointerPosRef.current);
  }, [keyboardActive, cursor, syncCursorElement]);

  // Copy changed pixels to the screen once per frame, and redraw the lines when the mask changes.
  useEffect(() => {
    const paint = paintRef.current?.getContext('2d');
    const mask = maskRef.current?.getContext('2d');
    if (paint === null || paint === undefined || mask === null || mask === undefined) return undefined;
    const image = new ImageData(pixels(studio.doc.paint.data), studio.doc.width, studio.doc.height);
    let shownMask: unknown = undefined;
    let cancelFrame: (() => void) | null = null;
    const draw = (): void => {
      cancelFrame = null;
      const dirty = studio.takeDirty();
      if (!isEmptyRect(dirty)) paint.putImageData(image, 0, 0, dirty.x, dirty.y, dirty.width, dirty.height);
      if (shownMask !== studio.mask) {
        shownMask = studio.mask;
        mask.clearRect(0, 0, studio.doc.width, studio.doc.height);
        const lines = studio.mask;
        if (lines !== null) mask.putImageData(new ImageData(pixels(lines.data), lines.width, lines.height), 0, 0);
      }
    };
    const request = (): void => {
      cancelFrame ??= scopeRef.current.requestFrame(draw);
    };
    studio.invalidate();
    draw();
    const unsubscribe = studio.subscribe(request);
    frameScheduler.current = request;
    return () => {
      unsubscribe();
      cancelFrame?.();
      frameScheduler.current = () => undefined;
    };
  }, [studio]);

  function toDocument(clientX: number, clientY: number): ToolPoint {
    return mapClient(clientX, clientY, paintRef.current?.getBoundingClientRect());
  }

  /** Runs the pen's actions on the tool, mapping screen points to document points. */
  function apply(result: PenResult, map: (point: ScreenPoint) => ToolPoint, extra: readonly ToolPoint[] = []): void {
    penRef.current = result.state;
    const tool = driverRef.current;
    for (const action of result.actions) {
      if (action.kind === 'begin') tool.begin(map(action.at));
      else if (action.kind === 'move') tool.move(extra.length > 0 ? extra : [map(action.to)]);
      else tool.end();
    }
    frameScheduler.current();
    const nowDown = isPenDown(result.state);
    if (nowDown !== downRef.current) {
      downRef.current = nowDown;
      setDown(nowDown);
      onPenChange(nowDown);
    }
  }

  const screenToDoc = (point: ScreenPoint): ToolPoint => toDocument(point.x, point.y);

  function releaseCapture(pointerId: number | null): void {
    if (pointerId === null) return;
    const frame = frameRef.current;
    if (frame === null) return;
    try {
      if (frame.hasPointerCapture?.(pointerId)) frame.releasePointerCapture(pointerId);
    } catch {
      // Capture may already have ended.
    }
  }

  function lift(): void {
    leaveTimer.current();
    releaseCapture(activePointerId.current);
    activePointerId.current = null;
    apply(penLift(penRef.current), screenToDoc);
  }

  useEffect(() => {
    handleRef.current = {
      lift,
      focus: () => frameRef.current?.focus(),
      penDown: down,
    };
  });

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (busyRef.current || event.button !== 0) return;
    if (activePointerId.current !== null && activePointerId.current !== event.pointerId) return;
    pointerFocusing.current = true;
    event.preventDefault();
    leaveTimer.current();
    setKeyboardActive(false);
    activePointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Some synthetic or touch environments do not allow capture.
    }
    const box = paintRef.current?.getBoundingClientRect();
    const at = mapClient(event.clientX, event.clientY, box);
    pointerPosRef.current = at;
    syncCursorElement(at);
    apply(penDown(penRef.current, { x: event.clientX, y: event.clientY }), (point) => mapClient(point.x, point.y, box));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
    const box = paintRef.current?.getBoundingClientRect();
    const at = mapClient(event.clientX, event.clientY, box);
    pointerPosRef.current = at;
    if (!keyboardActiveRef.current) syncCursorElement(at);
    if (busyRef.current || !isPenDown(penRef.current)) return;
    // Preview tools (line, shapes) only draw to the latest endpoint; skip intermediate coalesced points.
    let points: readonly ToolPoint[];
    if (driverRef.current.coalesce === false) {
      points = [at];
    } else {
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
      points = coalesced.length > 0 ? coalesced.map((e) => mapClient(e.clientX, e.clientY, box)) : [at];
    }
    apply(
      penMove(penRef.current, { x: event.clientX, y: event.clientY }),
      (point) => mapClient(point.x, point.y, box),
      points,
    );
  }

  function finishPointerUp(clientX: number, clientY: number, pointerId: number, kind: PointerKind): void {
    if (activePointerId.current !== null && pointerId !== activePointerId.current) return;
    releaseCapture(pointerId);
    activePointerId.current = null;
    if (busyRef.current) return;
    apply(penUp(penRef.current, { x: clientX, y: clientY }, kind, driverRef.current.behavior), screenToDoc);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    finishPointerUp(event.clientX, event.clientY, event.pointerId, pointerKind(event));
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerId.current !== null && event.pointerId !== activePointerId.current) return;
    lift();
  }

  function onPointerLeave(): void {
    pointerPosRef.current = null;
    if (!keyboardActiveRef.current) syncCursorElement(null);
    if (!isPenDown(penRef.current)) return;
    // When a button is held (pressed/dragging/lifting), pointer capture and the window pointerup
    // listener end the stroke cleanly on release; only sticky hover mode needs the leave timer.
    if (penRef.current.mode !== 'sticky') return;
    leaveTimer.current();
    leaveTimer.current = scope.setTimeout(lift, LEAVE_LIFT_MS);
  }

  function onPointerEnter(): void {
    leaveTimer.current();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (busyRef.current) return;
    const step = event.shiftKey ? KEY_STEP_FAR : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setKeyboardActive(true);
      const next = {
        x: Math.min(DOCUMENT_WIDTH - 1, Math.max(0, cursor.x + move[0])),
        y: Math.min(DOCUMENT_HEIGHT - 1, Math.max(0, cursor.y + move[1])),
      };
      setCursor(next);
      apply(penMove(penRef.current, next), identity);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setKeyboardActive(true);
      apply(penKey(penRef.current, cursor, driverRef.current.behavior), identity);
      return;
    }
    if (event.key === 'Escape' && isPenDown(penRef.current)) {
      event.preventDefault();
      lift();
    }
  }

  // Lift when the window loses focus, or if a held pointer is released outside the canvas without capture.
  const finishPointerUpRef = useRef(finishPointerUp);
  useLayoutEffect(() => {
    finishPointerUpRef.current = finishPointerUp;
  });
  useEffect(() => {
    const onBlur = (): void => handleRef.current?.lift();
    const onWindowUp = (event: PointerEvent): void => {
      if (activePointerId.current === null || event.pointerId !== activePointerId.current) return;
      const kind: PointerKind = event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse';
      finishPointerUpRef.current(event.clientX, event.clientY, event.pointerId, kind);
    };
    const onWindowCancel = (event: PointerEvent): void => {
      if (activePointerId.current === null || event.pointerId !== activePointerId.current) return;
      handleRef.current?.lift();
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowCancel);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowCancel);
    };
  }, [handleRef]);

  const ringPercent = (driver.ringSize / DOCUMENT_WIDTH) * 100;

  return (
    // The picture is one custom widget: pointer painting plus a keyboard cursor, which is what the
    // application role is for. No native element paints.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={frameRef}
      className='wk-paint-frame'
      data-pen={down ? 'down' : 'up'}
      data-busy={busy ? 'true' : undefined}
      role='application'
      aria-label={t(strings.canvas)}
      aria-describedby={keysId}
      aria-busy={busy}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see the comment above.
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerEnter={onPointerEnter}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        const fromPointer = pointerFocusing.current;
        pointerFocusing.current = false;
        if (!fromPointer || event.currentTarget.matches(':focus-visible')) setKeyboardActive(true);
      }}
      onBlur={() => {
        const wasKeyboard = keyboardActiveRef.current;
        setKeyboardActive(false);
        if (wasKeyboard && isPenDown(penRef.current)) lift();
      }}
    >
      <span id={keysId} hidden>
        {t(strings.canvasKeys)}
      </span>
      <canvas
        ref={paintRef}
        className='wk-paint-layer'
        width={studio.doc.width}
        height={studio.doc.height}
        data-layer='paint'
      />
      <canvas
        ref={maskRef}
        className='wk-paint-layer'
        width={studio.doc.width}
        height={studio.doc.height}
        data-layer='lines'
      />
      <div
        ref={cursorElRef}
        hidden
        className='wk-paint-cursor'
        data-keyboard={keyboardActive ? 'true' : undefined}
        aria-hidden='true'
      >
        {driver.ghost !== undefined && !down ? (
          <img
            className='wk-paint-ghost'
            src={driver.ghost.url}
            alt=''
            draggable={false}
            style={{
              width: `${(driver.ghost.size / DOCUMENT_WIDTH) * 100}cqw`,
              transform: `translate(-50%, -50%) ${driver.ghost.transform}`,
            }}
          />
        ) : (
          <span className='wk-paint-ring' style={{ width: `max(${ringPercent}cqw, 14px)` }} />
        )}
      </div>
      {overlay}
    </div>
  );
}
