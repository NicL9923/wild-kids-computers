import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames, feedback } from '../../../../core/strings/shared/index.ts';
import { canCatch, SCENE, ZOOM_STEPS, ZOOMED_OUT_MS, type Thing, type ZoomLevel } from './level.ts';
import { strings } from './strings.ts';
import './zoomExplorer.css';

/** Wheel distance, in pixels, that makes one zoom step. A pinch sends many small deltas. */
const WHEEL_PER_STEP = 40;
/** Pixels per wheel line, for a wheel that reports lines. */
const LINE_PIXELS = 16;
/** Wrong things clicked before rings show where the right ones are. */
const WRONG_BEFORE_HELP = 2;
/** The size of the help ring, in units at zoom 1. */
const HELP_RING = 120;

/** A length in scene units, as a share of the scene's width. */
const unit = (value: number) => `${String((value / SCENE.width) * 100)}cqw`;

/** A center in scene units, as a share of the scene. */
const place = (x: number, y: number) => ({
  left: `${String((x / SCENE.width) * 100)}%`,
  top: `${String((y / SCENE.height) * 100)}%`,
});

interface Anchor {
  /** The point to keep still, in pixels from the viewport's top left. */
  readonly x: number;
  readonly y: number;
  readonly from: number;
}

/**
 * A big picture in a scrolling viewport, with plus and minus buttons beside it. Zoom comes from
 * the buttons, from the plus and minus keys, from Control or Command with the mouse wheel, and
 * from a trackpad pinch, which Chromium sends as a wheel event with the Control key. Only the
 * picture zooms: the app's own zoom is fixed by the main process, and the wheel event is
 * cancelled. Plain scrolling moves around the zoomed picture.
 */
export default function ZoomExplorerActivity({ level, kit }: ActivityProps<ZoomLevel>) {
  const [zoomStep, setZoomStep] = useState(0);
  const [found, setFound] = useState<ReadonlySet<string>>(new Set());
  const [wrong, setWrong] = useState(0);
  const [done, setDone] = useState(false);
  const viewport = useRef<HTMLElement>(null);
  const anchor = useRef<Anchor | null>(null);
  const wheel = useRef(0);
  const live = useRef(zoomStep);
  const targets = level.things.filter((thing) => thing.isTarget);
  const allFound = targets.every((thing) => found.has(thing.id));

  useLayoutEffect(() => {
    live.current = zoomStep;
  });

  // Names the thing to find.
  useEffect(() => {
    kit.setInstruction([strings.findTiny, emojiNames[level.target]]);
  }, [kit, level.target]);

  /** Changes the zoom by `delta` steps, keeping the point `at` (viewport pixels) still. */
  function zoomBy(delta: number, at?: { x: number; y: number }): void {
    const from = live.current;
    const to = Math.min(ZOOM_STEPS.length - 1, Math.max(0, from + delta));
    const box = viewport.current?.getBoundingClientRect();
    if (to === from || box === undefined) return;
    anchor.current = { x: at?.x ?? box.width / 2, y: at?.y ?? box.height / 2, from };
    live.current = to;
    setZoomStep(to);
    kit.play(delta > 0 ? 'open' : 'close');
  }

  // After a zoom, scrolls so the anchored point stays under the pointer or in the middle.
  useLayoutEffect(() => {
    const element = viewport.current;
    const held = anchor.current;
    if (element === null || held === null) return;
    anchor.current = null;
    const ratio = (ZOOM_STEPS[zoomStep] ?? 1) / (ZOOM_STEPS[held.from] ?? 1);
    element.scrollLeft = (element.scrollLeft + held.x) * ratio - held.x;
    element.scrollTop = (element.scrollTop + held.y) * ratio - held.y;
  }, [zoomStep]);

  // Control or Command with the wheel, and a trackpad pinch, zoom the picture. The listener is
  // not passive, so cancelling it keeps the page from zooming.
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return undefined;
    return kit.scope.listen(
      element,
      'wheel',
      (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        wheel.current += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * LINE_PIXELS : event.deltaY;
        if (Math.abs(wheel.current) < WHEEL_PER_STEP) return;
        const box = element.getBoundingClientRect();
        zoomBy(wheel.current < 0 ? 1 : -1, { x: event.clientX - box.left, y: event.clientY - box.top });
        wheel.current = 0;
      },
      { passive: false },
    );
    // zoomBy reads only refs, so the listener stays for the round.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [kit.scope]);

  useActivityKeys(kit, (event) => {
    const delta = event.key === '+' || event.key === '=' ? 1 : event.key === '-' || event.key === '_' ? -1 : 0;
    if (delta === 0 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    // Zoom around the focused thing, so a keyboard user keeps it in view.
    const focused = document.activeElement;
    const box = viewport.current?.getBoundingClientRect();
    if (focused instanceof HTMLElement && viewport.current?.contains(focused) === true && box !== undefined) {
      const rect = focused.getBoundingClientRect();
      zoomBy(delta, { x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top });
      return;
    }
    zoomBy(delta);
  });

  // Once every thing is found, the round ends when the picture is all the way out again.
  useEffect(() => {
    if (!allFound || zoomStep !== 0 || done) return;
    setDone(true);
    kit.feedback.correct({ say: feedback.allDone });
    kit.scope.setTimeout(() => kit.roundComplete(), ZOOMED_OUT_MS);
  }, [allFound, zoomStep, done, kit]);

  function choose(thing: Thing, element: HTMLElement): void {
    if (found.has(thing.id) || allFound) return;
    if (!canCatch(level.size, zoomStep)) {
      // Too small is not a mistake: the answer is to zoom, which is the lesson.
      void kit.speak(strings.tooSmall);
      return;
    }
    if (!thing.isTarget) {
      setWrong(wrong + 1);
      kit.feedback.wrong({ at: element, say: feedback.lookAgain });
      if (wrong + 1 === WRONG_BEFORE_HELP) kit.hint();
      return;
    }
    const next = new Set(found).add(thing.id);
    setFound(next);
    kit.feedback.correct({ at: element });
    if (targets.every((item) => next.has(item.id))) kit.setInstruction(strings.zoomOut);
  }

  const zoom = ZOOM_STEPS[zoomStep] ?? 1;
  const helped = wrong >= WRONG_BEFORE_HELP;

  return (
    <div className='zoom-stage' data-zoom-step={zoomStep} data-all-found={allFound} data-done={done}>
      <div className='zoom-viewport-area'>
        <section
          ref={viewport}
          className='zoom-viewport'
          // A scrolling region takes focus so the arrow keys can scroll it, as axe requires.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={t(strings.picture)}
        >
          <div className='zoom-scene' style={{ width: `${String(zoom * 100)}%` }}>
            <MeadowBackdrop />
            {level.scenery.map((piece) => (
              <div
                key={`${piece.kind}-${String(piece.x)}`}
                className='zoom-piece'
                style={{ ...place(piece.x, piece.y), width: unit(piece.size) }}
              >
                <Emoji id={piece.kind} decorative />
              </div>
            ))}
            {helped &&
              targets
                .filter((thing) => !found.has(thing.id))
                .map((thing) => (
                  <span
                    key={`ring-${thing.id}`}
                    className='zoom-help-ring'
                    data-help={thing.id}
                    style={{ ...place(thing.x, thing.y), width: unit(HELP_RING) }}
                  />
                ))}
            {level.things.map((thing) => (
              <button
                key={thing.id}
                type='button'
                className='zoom-thing'
                data-thing={thing.id}
                data-found={found.has(thing.id)}
                aria-pressed={found.has(thing.id)}
                aria-label={t(emojiNames[thing.kind])}
                style={{ ...place(thing.x, thing.y), width: unit(level.size) }}
                onClick={(event) => choose(thing, event.currentTarget)}
              >
                <Emoji id={thing.kind} decorative />
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className='zoom-panel'>
        <figure className='zoom-look-for'>
          <Emoji id={level.target} className='zoom-look-for-picture' />
          <figcaption className='wk-visually-hidden'>{t(strings.lookFor)}</figcaption>
        </figure>
        <button
          type='button'
          className='zoom-button'
          data-zoom='in'
          aria-label={t(strings.zoomInButton)}
          disabled={zoomStep === ZOOM_STEPS.length - 1}
          onClick={() => zoomBy(1)}
        >
          <ZoomGlyph sign='in' />
        </button>
        <button
          type='button'
          className='zoom-button'
          data-zoom='out'
          aria-label={t(strings.zoomOutButton)}
          disabled={zoomStep === 0}
          onClick={() => zoomBy(-1)}
        >
          <ZoomGlyph sign='out' />
        </button>
      </div>
    </div>
  );
}

/** A magnifying glass with a plus or a minus. */
function ZoomGlyph({ sign }: { sign: 'in' | 'out' }) {
  return (
    <svg viewBox='0 0 48 48' className='zoom-glyph' aria-hidden='true'>
      <circle cx={20} cy={20} r={13} />
      <path d='M30 30 L42 42' />
      <path d='M13 20 H27' />
      {sign === 'in' && <path d='M20 13 V27' />}
    </svg>
  );
}

/** Sky, two hills, and a path: original art that scales with the picture. */
function MeadowBackdrop() {
  return (
    <svg className='zoom-backdrop' viewBox='0 0 1000 600' preserveAspectRatio='none' aria-hidden='true'>
      <rect className='zoom-sky' width={1000} height={600} />
      <path className='zoom-hill-far' d='M0 300 C180 220 360 250 520 290 S860 250 1000 280 V600 H0 Z' />
      <path className='zoom-hill-near' d='M0 380 C220 330 420 360 600 400 S880 360 1000 380 V600 H0 Z' />
      <path className='zoom-path' d='M430 600 C470 520 560 480 520 420 S600 360 640 330' />
    </svg>
  );
}
