import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
  /** A picture that follows the pointer, such as the chosen stamp, with its CSS transform. */
  readonly ghost?: { readonly url: string; readonly size: number; readonly transform: string };
  begin(at: ToolPoint): void;
  move(points: readonly ToolPoint[]): void;
  end(): void;
}

export interface StudioCanvasHandle {
  /** Ends any stroke in progress, such as when the tool changes. */
  lift(): void;
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
export function StudioCanvas({ studio, driver, scope, busy, onPenChange, handleRef }: StudioCanvasProps) {
  const paintRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<PenState>(PEN_UP);
  const driverRef = useRef(driver);
  const busyRef = useRef(busy);
  const leaveTimer = useRef<() => void>(() => undefined);
  const [pointer, setPointer] = useState<ToolPoint | null>(null);
  const [cursor, setCursor] = useState<ToolPoint>({ x: DOCUMENT_WIDTH / 2, y: DOCUMENT_HEIGHT / 2 });
  const [keyboardActive, setKeyboardActive] = useState(false);
  const [down, setDown] = useState(false);
  const keysId = useId();

  const frameScheduler = useRef<() => void>(() => undefined);

  const scopeRef = useRef(scope);

  useEffect(() => {
    driverRef.current = driver;
    busyRef.current = busy;
    scopeRef.current = scope;
  }, [driver, busy, scope]);

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
    const box = paintRef.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - box.left) / box.width) * DOCUMENT_WIDTH,
      y: ((clientY - box.top) / box.height) * DOCUMENT_HEIGHT,
    };
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
    if (nowDown !== down) {
      setDown(nowDown);
      onPenChange(nowDown);
    }
  }

  const screenToDoc = (point: ScreenPoint): ToolPoint => toDocument(point.x, point.y);

  function lift(): void {
    leaveTimer.current();
    apply(penLift(penRef.current), screenToDoc);
  }

  useEffect(() => {
    handleRef.current = { lift, penDown: down };
  });

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (busyRef.current || event.button !== 0) return;
    event.preventDefault();
    leaveTimer.current();
    setKeyboardActive(false);
    apply(penDown(penRef.current, { x: event.clientX, y: event.clientY }), screenToDoc);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const at = toDocument(event.clientX, event.clientY);
    setPointer(at);
    if (busyRef.current || !isPenDown(penRef.current)) return;
    // Every point the pointer passed through since the last event, for a smooth stroke.
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const points = coalesced.length > 0 ? coalesced.map((e) => toDocument(e.clientX, e.clientY)) : [at];
    apply(penMove(penRef.current, { x: event.clientX, y: event.clientY }), screenToDoc, points);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (busyRef.current) return;
    apply(
      penUp(penRef.current, { x: event.clientX, y: event.clientY }, pointerKind(event), driverRef.current.behavior),
      screenToDoc,
    );
  }

  function onPointerLeave(): void {
    setPointer(null);
    if (!isPenDown(penRef.current)) return;
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

  // Lift when the window loses focus, so a pen never stays down behind another window.
  useEffect(() => {
    const onBlur = (): void => handleRef.current?.lift();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [handleRef]);

  const shown = keyboardActive ? cursor : pointer;
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
      onPointerCancel={lift}
      onKeyDown={onKeyDown}
      onBlur={() => setKeyboardActive(false)}
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
      {shown !== null && (
        <div
          className='wk-paint-cursor'
          data-keyboard={keyboardActive ? 'true' : undefined}
          style={{ left: `${(shown.x / DOCUMENT_WIDTH) * 100}%`, top: `${(shown.y / DOCUMENT_HEIGHT) * 100}%` }}
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
      )}
    </div>
  );
}
