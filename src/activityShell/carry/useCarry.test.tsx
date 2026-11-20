// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SfxName } from '../../audio/sfx/sfxNames.ts';
import { createRandom, type Random } from '../../core/activityKit/random.ts';
import { createManualScheduler } from '../../core/activityKit/scheduler.ts';
import { createScope, type OwnedScope } from '../../core/activityKit/scope.ts';
import { useCarry, type Point } from './useCarry.ts';

afterEach(cleanup);

/** Layout is the I/O edge here: jsdom lays nothing out, so each element gets a fixed box. */
function placeAt(element: Element | null, left: number, top: number, width: number, height: number): void {
  if (element === null) throw new Error('Nothing to place');
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(left, top, width, height),
  });
}

function fakeKit() {
  const sounds: SfxName[] = [];
  const scope: OwnedScope = createScope(createManualScheduler({ wall: 0 }));
  const session = { holds: 0 };
  const holdCheckpoint = () => {
    session.holds += 1;
    return () => {
      session.holds -= 1;
    };
  };
  return { scope, play: (name: SfxName) => sounds.push(name), sounds, holdCheckpoint, session };
}

type Fruit = 'apple' | 'pear';
type Place = 'basket' | 'plate';

interface Log {
  drops: string[];
}

/** What the picnic shows: the basket can leave, and can stop taking fruit, while a fruit is carried. */
interface PicnicScene {
  readonly basket?: boolean;
  readonly basketTakes?: boolean;
  readonly pear?: boolean;
}

function Picnic({ kit, log, scene = {} }: { kit: ReturnType<typeof fakeKit>; log: Log; scene?: PicnicScene }) {
  const { basket = true, basketTakes = true, pear = true } = scene;
  const carry = useCarry<Fruit, Place>(kit, {
    kind: 'targets',
    // The plate takes only the pear.
    accepts: (item, target) => (target === 'basket' ? basketTakes : item === 'pear'),
    onDrop: (item, target) => log.drops.push(`${item} -> ${target}`),
  });
  return (
    <div>
      <button type='button' {...carry.item('apple')}>
        apple
      </button>
      {pear && (
        <button type='button' {...carry.item('pear')}>
          pear
        </button>
      )}
      {basket && <div {...carry.target('basket')}>basket</div>}
      <div {...carry.target('plate')}>plate</div>
    </div>
  );
}

/** Lays the picnic out again after a rerender put new elements on screen. */
function layOutPicnic(): void {
  placeAt(screen.getByText('apple'), 0, 0, 100, 100);
  const pear = screen.queryByText('pear');
  if (pear !== null) placeAt(pear, 0, 200, 100, 100);
  const basket = screen.queryByText('basket');
  if (basket !== null) placeAt(basket, 400, 0, 200, 200);
  placeAt(screen.getByText('plate'), 400, 300, 200, 200);
}

function renderPicnic() {
  const kit = fakeKit();
  const log: Log = { drops: [] };
  const view = render(<Picnic kit={kit} log={log} />);
  layOutPicnic();
  const rerender = (scene: PicnicScene) => {
    view.rerender(<Picnic kit={kit} log={log} scene={scene} />);
    layOutPicnic();
  };
  return { kit, log, apple: screen.getByText('apple'), basket: screen.getByText('basket'), rerender };
}

/** The mouse unless a test says otherwise. A second finger or pen has another id. */
const MOUSE = 1;

const down = (element: Element, point: Point, button = 0, pointerId = MOUSE) =>
  fireEvent.pointerDown(element, { clientX: point.x, clientY: point.y, button, buttons: 1, pointerId });
/** A move with the button held, as during a drag. */
const move = (point: Point, pointerId = MOUSE) =>
  fireEvent.pointerMove(window, { clientX: point.x, clientY: point.y, buttons: 1, pointerId });
/** A move with no button held, as when a picked-up item follows the pointer. */
const hover = (point: Point, pointerId = MOUSE) =>
  fireEvent.pointerMove(window, { clientX: point.x, clientY: point.y, buttons: 0, pointerId });
const up = (point: Point, pointerId = MOUSE) =>
  fireEvent.pointerUp(window, { clientX: point.x, clientY: point.y, buttons: 0, pointerId });
const cancel = (pointerId = MOUSE) => fireEvent.pointerCancel(window, { pointerId });
const blur = () => fireEvent.blur(window);
const key = (element: Element, name: string) => fireEvent.keyDown(element, { key: name });

/** A toolbox: a click on the pear acts at once; the apple is carried as usual. */
function Toolbox({ kit, log }: { kit: ReturnType<typeof fakeKit>; log: Log & { clicks: string[] } }) {
  const carry = useCarry<Fruit, Place>(kit, {
    kind: 'targets',
    onDrop: (item, target) => log.drops.push(`${item} -> ${target}`),
    onClick: (item) => {
      if (item !== 'pear') return false;
      log.clicks.push(item);
      return true;
    },
  });
  return (
    <div>
      <button type='button' {...carry.item('apple')}>
        apple
      </button>
      <button type='button' {...carry.item('pear')}>
        pear
      </button>
      <div {...carry.target('basket')}>basket</div>
    </div>
  );
}

function renderToolbox() {
  const kit = fakeKit();
  const log = { drops: [] as string[], clicks: [] as string[] };
  render(<Toolbox kit={kit} log={log} />);
  placeAt(screen.getByText('apple'), 0, 0, 100, 100);
  placeAt(screen.getByText('pear'), 0, 200, 100, 100);
  placeAt(screen.getByText('basket'), 400, 0, 200, 200);
  return { log, apple: screen.getByText('apple'), pear: screen.getByText('pear') };
}

describe('useCarry with a click that acts', () => {
  it('runs the click instead of picking the item up, by pointer and by keyboard', () => {
    const { log, pear } = renderToolbox();
    down(pear, { x: 50, y: 250 });
    up({ x: 51, y: 250 });
    expect(pear.dataset.carried).toBe('false');
    key(pear, 'Enter');
    expect(pear.dataset.carried).toBe('false');
    expect(log.clicks).toEqual(['pear', 'pear']);
  });

  it('still carries the item when it is dragged', () => {
    const { log, pear } = renderToolbox();
    down(pear, { x: 50, y: 250 });
    move({ x: 450, y: 50 });
    up({ x: 450, y: 50 });
    expect(log).toEqual({ drops: ['pear -> basket'], clicks: [] });
  });

  it('picks the item up as usual when the click does not act', () => {
    const { log, apple } = renderToolbox();
    down(apple, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    expect(apple.dataset.carried).toBe('true');
    up({ x: 450, y: 50 });
    expect(log).toEqual({ drops: ['apple -> basket'], clicks: [] });
  });
});

describe('useCarry with drop targets', () => {
  it('moves an item onto a target by press, drag, and release, and marks it picked up on the way', () => {
    const { kit, log, apple, basket } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 300, y: 80 });
    expect(apple.dataset.carried).toBe('true');
    expect(apple.getAttribute('aria-pressed')).toBe('true');
    expect(apple.style.translate).toBe('250px 30px');
    // The basket takes the apple; the plate does not, so only the basket shows as a place to go.
    expect(basket.dataset.carryValid).toBe('true');
    expect(screen.getByText('plate').dataset.carryValid).toBe('false');
    move({ x: 450, y: 50 });
    expect(basket.dataset.carryOver).toBe('true');
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual(['apple -> basket']);
    expect(kit.sounds).toEqual(['pick-up', 'put-down']);
    expect(apple.dataset.carried).toBe('false');
  });

  it('click to place: a click picks the item up and the next click puts it on a target', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    up({ x: 52, y: 51 });
    // Picked up and waiting, not dropped.
    expect(apple.dataset.carried).toBe('true');
    expect(log.drops).toEqual([]);
    hover({ x: 480, y: 120 });
    expect(apple.style.translate).toBe('430px 70px');
    up({ x: 480, y: 120 });
    expect(log.drops).toEqual(['apple -> basket']);
    expect(apple.dataset.carried).toBe('false');
  });

  it('puts a clicked item down at the very spot it was picked up, with no move in between', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    expect(apple.dataset.carried).toBe('true');
    // The carried item lets the pointer through, so the second press lands on what is under it.
    down(apple.parentElement ?? document.body, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    expect(apple.dataset.carried).toBe('false');
    expect(log.drops).toEqual([]);
  });

  it('puts the item back when the browser cancels the press', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    cancel();
    expect(apple.dataset.carried).toBe('false');
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
  });

  it.each([
    ['the browser cancels the drag', () => cancel()],
    ['the window loses focus', blur],
  ])('puts a dragged item back, and a later release drops nothing, when %s', (_reason, interrupt) => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 450, y: 50 });
    interrupt();
    expect(apple.dataset.carried).toBe('false');
    expect(apple.style.translate).toBe('');
    // A release that belongs to some other gesture.
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
  });

  it('puts a clicked item back when the window loses focus, so a click on return places nothing', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    blur();
    expect(apple.dataset.carried).toBe('false');
    down(document.body, { x: 450, y: 50 });
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
  });

  it('puts a dragged item back when the button was let go outside the window', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 450, y: 50 });
    // The release happened outside, where the page could not hear it. The pointer comes back
    // over the basket with no button held.
    hover({ x: 460, y: 60 });
    expect(apple.dataset.carried).toBe('false');
    up({ x: 460, y: 60 });
    expect(log.drops).toEqual([]);
  });

  it('puts a dragged item back when it is released outside the window, away from any target', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 450, y: 50 });
    move({ x: -40, y: 50 });
    up({ x: -40, y: 50 });
    expect(apple.dataset.carried).toBe('false');
    expect(log.drops).toEqual([]);
  });

  it('ignores a second pointer while the first holds an item', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 300, y: 80 });
    // A second finger presses, moves over the basket, and lets go. It does not own the item.
    down(document.body, { x: 450, y: 50 }, 0, 2);
    move({ x: 460, y: 50 }, 2);
    up({ x: 460, y: 50 }, 2);
    cancel(2);
    expect(apple.dataset.carried).toBe('true');
    expect(apple.style.translate).toBe('250px 30px');
    expect(log.drops).toEqual([]);
    // The first pointer still drops it where it lets go.
    move({ x: 450, y: 50 });
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual(['apple -> basket']);
  });

  it('click to place: lets another pointer make the placing click, such as a mouse after the trackpad', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    hover({ x: 470, y: 70 }, 7);
    down(document.body, { x: 470, y: 70 }, 0, 7);
    up({ x: 470, y: 70 }, 7);
    expect(log.drops).toEqual(['apple -> basket']);
  });

  it('treats a second press after a lost release as the placing click', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    // The release never arrived, so the item is still held when the next press comes.
    down(apple.parentElement ?? document.body, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    expect(apple.dataset.carried).toBe('false');
    expect(log.drops).toEqual([]);
  });

  it('treats a wobble under the drag threshold as a click, not a drag', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 55, y: 54 });
    // Still at rest: the item has not started to follow the pointer.
    expect(apple.style.translate).toBe('0px');
    up({ x: 55, y: 54 });
    expect(apple.dataset.carried).toBe('true');
    expect(log.drops).toEqual([]);
  });

  it('returns the item home when it is released early, away from any target', () => {
    const { kit, log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 250, y: 250 });
    up({ x: 250, y: 250 });
    expect(log.drops).toEqual([]);
    expect(apple.dataset.carried).toBe('false');
    expect(apple.style.translate).toBe('');
    expect(kit.sounds).toEqual(['pick-up']);
  });

  it('returns the item home when it is released on a target that does not take it', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 450, y: 350 });
    up({ x: 450, y: 350 });
    expect(log.drops).toEqual([]);
  });

  it('puts a clicked item back with Escape', () => {
    const { log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(apple.dataset.carried).toBe('false');
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
  });

  it('ignores a right or middle button press', () => {
    const { apple } = renderPicnic();
    down(apple, { x: 50, y: 50 }, 2);
    up({ x: 50, y: 50 });
    expect(apple.dataset.carried).toBe('false');
  });

  it('moves with the keyboard: Enter picks up, arrows choose among targets that take it, Enter places', () => {
    const { log } = renderPicnic();
    const pear = screen.getByText('pear');
    key(pear, 'Enter');
    expect(pear.dataset.carried).toBe('true');
    // The first target that takes the pear is chosen at once.
    expect(screen.getByText('basket').dataset.carryOver).toBe('true');
    key(pear, 'ArrowRight');
    expect(screen.getByText('plate').dataset.carryOver).toBe('true');
    key(pear, 'ArrowRight');
    expect(screen.getByText('basket').dataset.carryOver).toBe('true');
    key(pear, 'ArrowLeft');
    key(pear, ' ');
    expect(log.drops).toEqual(['pear -> plate']);
  });

  it('skips targets that do not take the item when choosing by keyboard', () => {
    const { log, apple } = renderPicnic();
    key(apple, 'Enter');
    key(apple, 'ArrowDown');
    key(apple, 'Enter');
    expect(log.drops).toEqual(['apple -> basket']);
  });

  it('puts a keyboard-carried item back with Escape and ignores other keys', () => {
    const { log, apple } = renderPicnic();
    key(apple, 'a');
    expect(apple.dataset.carried).toBe('false');
    key(apple, 'Enter');
    key(apple, 'Tab');
    key(apple, 'Escape');
    expect(apple.dataset.carried).toBe('false');
    expect(log.drops).toEqual([]);
  });

  it('puts a keyboard-carried item back when Escape fires on window, focus leaves, or a pointer presses', () => {
    const { log, apple } = renderPicnic();
    key(apple, 'Enter');
    expect(apple.dataset.carried).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(apple.dataset.carried).toBe('false');

    key(apple, 'Enter');
    expect(apple.dataset.carried).toBe('true');
    fireEvent.blur(apple);
    expect(apple.dataset.carried).toBe('false');

    key(apple, 'Enter');
    expect(apple.dataset.carried).toBe('true');
    fireEvent.pointerDown(document.body, { clientX: 10, clientY: 10, button: 0, buttons: 1, pointerId: MOUSE });
    expect(apple.dataset.carried).toBe('false');
    expect(log.drops).toEqual([]);
  });

  it('notifies onOverChange as keyboard arrows step through valid targets', () => {
    const kit = fakeKit();
    const seen: string[] = [];
    function AnnouncingPicnic() {
      const carry = useCarry<Fruit, Place>(kit, {
        kind: 'targets',
        onOverChange: (target, how) => seen.push(`${String(target)}:${how}`),
        onDrop: () => undefined,
      });
      return (
        <div>
          <button type='button' {...carry.item('pear')}>
            pear
          </button>
          <div {...carry.target('basket')}>basket</div>
          <div {...carry.target('plate')}>plate</div>
        </div>
      );
    }
    render(<AnnouncingPicnic />);
    const pear = screen.getByText('pear');
    key(pear, 'Enter');
    key(pear, 'ArrowRight');
    key(pear, 'ArrowRight');
    key(pear, 'Escape');
    expect(seen).toEqual(['basket:keyboard', 'plate:keyboard', 'basket:keyboard']);
  });

  it.each([
    ['leaves the screen', { basket: false }],
    ['stops taking the item', { basketTakes: false }],
  ])('puts a keyboard-carried item back when its chosen target %s before the drop', (_change, scene) => {
    const { log, apple, rerender } = renderPicnic();
    key(apple, 'Enter');
    expect(screen.getByText('basket').dataset.carryOver).toBe('true');
    rerender(scene);
    key(apple, 'Enter');
    expect(log.drops).toEqual([]);
    expect(apple.dataset.carried).toBe('false');
  });

  it.each([
    ['leaves the screen', { basket: false }],
    ['stops taking the item', { basketTakes: false }],
  ])('drops nothing when the target under a clicked item %s before the placing click', (_change, scene) => {
    const { log, apple, rerender } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    up({ x: 50, y: 50 });
    rerender(scene);
    down(document.body, { x: 450, y: 50 });
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
    expect(apple.dataset.carried).toBe('false');
  });

  it('lets go of a carried item that leaves the screen, so a later click drops nothing', () => {
    const { log, rerender } = renderPicnic();
    const pear = screen.getByText('pear');
    down(pear, { x: 50, y: 250 });
    up({ x: 50, y: 250 });
    rerender({ pear: false });
    expect(screen.getByText('apple').dataset.carried).toBe('false');
    down(document.body, { x: 450, y: 50 });
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
    // The next pick up works as usual.
    rerender({});
    key(screen.getByText('pear'), 'Enter');
    key(screen.getByText('pear'), 'Enter');
    expect(log.drops).toEqual(['pear -> basket']);
  });

  it('holds the free-play session check while an item is carried, and lets go when it lands or goes back', () => {
    const { kit, log, apple } = renderPicnic();
    const holds: number[] = [];
    // A drag that lands on the basket.
    down(apple, { x: 50, y: 50 });
    move({ x: 450, y: 50 });
    holds.push(kit.session.holds);
    up({ x: 450, y: 50 });
    holds.push(kit.session.holds);
    // A keyboard carry that goes back.
    key(apple, 'Enter');
    holds.push(kit.session.holds);
    key(apple, 'Escape');
    holds.push(kit.session.holds);
    expect(holds).toEqual([1, 0, 1, 0]);
    expect(log.drops).toEqual(['apple -> basket']);
  });

  it('stops listening once the activity scope is disposed', () => {
    const { kit, log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 300, y: 80 });
    act(() => kit.scope.dispose());
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
  });
});

function Desk({
  kit,
  placed,
  hasArea = true,
}: {
  kit: ReturnType<typeof fakeKit>;
  placed: Point[];
  hasArea?: boolean;
}) {
  const area = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<Point>({ x: 100, y: 100 });
  const carry = useCarry<'window'>(kit, {
    kind: 'free',
    area,
    position: () => at,
    keyStep: 10,
    onPlace: (_item, point) => {
      placed.push(point);
      setAt(point);
    },
  });
  return (
    <div ref={hasArea ? area : undefined} data-testid='area'>
      <button type='button' {...carry.item('window')}>
        window
      </button>
    </div>
  );
}

function renderDesk() {
  const kit = fakeKit();
  const placed: Point[] = [];
  const view = render(<Desk kit={kit} placed={placed} />);
  placeAt(screen.getByTestId('area'), 0, 0, 800, 600);
  placeAt(screen.getByText('window'), 100, 100, 200, 150);
  const loseArea = () => view.rerender(<Desk kit={kit} placed={placed} hasArea={false} />);
  return { placed, item: screen.getByText('window'), loseArea };
}

describe('useCarry when input comes faster than the screen draws', () => {
  it('reads every key from the newest pick-up and choice: three arrows go three places on', () => {
    const { log } = renderPicnic();
    const pear = screen.getByText('pear');
    // The pear starts on the basket; three steps along basket and plate end on the plate.
    act(() => {
      for (const name of ['Enter', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter']) key(pear, name);
    });
    expect(log.drops).toEqual(['pear -> plate']);
  });

  it('drops a quick drag whose release lands before the move is drawn', () => {
    const { kit, log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    act(() => {
      move({ x: 450, y: 50 });
      up({ x: 450, y: 50 });
    });
    expect(log.drops).toEqual(['apple -> basket']);
    expect(kit.sounds).toEqual(['pick-up', 'put-down']);
  });
});

describe('useCarry with free positions', () => {
  it('places the item where it was dragged', () => {
    const { placed, item } = renderDesk();
    down(item, { x: 150, y: 120 });
    move({ x: 350, y: 220 });
    up({ x: 350, y: 220 });
    expect(placed).toEqual([{ x: 300, y: 200 }]);
  });

  it('keeps the item inside the area when it is released past the edge', () => {
    const { placed, item } = renderDesk();
    down(item, { x: 150, y: 120 });
    move({ x: 2000, y: -500 });
    up({ x: 2000, y: -500 });
    expect(placed).toEqual([{ x: 600, y: 0 }]);
  });

  it('moves by the key step with the arrow keys and places with Enter', () => {
    const { placed, item } = renderDesk();
    key(item, 'Enter');
    key(item, 'ArrowRight');
    key(item, 'ArrowRight');
    key(item, 'ArrowDown');
    key(item, 'Enter');
    expect(placed).toEqual([{ x: 120, y: 110 }]);
  });

  it('clamps keyboard free-mode offset at the area edge so extra arrow presses do not drift', () => {
    const { placed, item } = renderDesk();
    key(item, 'Enter');
    // Starts at x = 100 with keyStep = 10; 15 left presses stop at x = 0 (offset -100), not -150.
    for (let step = 0; step < 15; step += 1) key(item, 'ArrowLeft');
    expect(item.style.translate).toBe('-100px');
    // One ArrowRight moves right back to x = 10 immediately.
    key(item, 'ArrowRight');
    expect(item.style.translate).toBe('-90px');
    key(item, 'Enter');
    expect(placed).toEqual([{ x: 10, y: 100 }]);
  });

  it.each([
    ['a drag', (item: Element) => (down(item, { x: 150, y: 120 }), move({ x: 350, y: 220 }))],
    ['the keyboard', (item: Element) => (key(item, 'Enter'), key(item, 'ArrowRight'))],
  ])('places nothing when the area leaves the screen during %s', (_how, pickUp) => {
    const { placed, item, loseArea } = renderDesk();
    pickUp(item);
    loseArea();
    up({ x: 350, y: 220 });
    key(item, 'Enter');
    expect(placed).toEqual([]);
  });

  it('places nothing when the window loses focus during a drag', () => {
    const { placed, item } = renderDesk();
    down(item, { x: 150, y: 120 });
    move({ x: 350, y: 220 });
    blur();
    up({ x: 350, y: 220 });
    expect(placed).toEqual([]);
    expect(item.style.translate).toBe('');
  });

  it('places nothing when Escape cancels', () => {
    const { placed, item } = renderDesk();
    key(item, 'Enter');
    key(item, 'ArrowLeft');
    key(item, 'Escape');
    expect(placed).toEqual([]);
  });
});

function Dial({ kit, log, hasTrack = true }: { kit: ReturnType<typeof fakeKit>; log: string[]; hasTrack?: boolean }) {
  const track = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState(40);
  const carry = useCarry<'knob'>(kit, {
    kind: 'axis',
    axis: 'x',
    track,
    min: 0,
    max: 100,
    step: 10,
    value: () => value,
    onChange: (_item, next) => {
      log.push(`change ${String(next)}`);
      setValue(next);
    },
    onDrop: (_item, final) => log.push(`drop ${String(final)}`),
  });
  return (
    <div ref={hasTrack ? track : undefined} data-testid='track'>
      <button type='button' {...carry.item('knob')}>
        {`knob ${String(value)}`}
      </button>
    </div>
  );
}

function renderDial() {
  const kit = fakeKit();
  const log: string[] = [];
  const view = render(<Dial kit={kit} log={log} />);
  placeAt(screen.getByTestId('track'), 100, 0, 500, 50);
  const loseTrack = () => view.rerender(<Dial kit={kit} log={log} hasTrack={false} />);
  return { log, knob: () => screen.getByRole('button'), loseTrack };
}

describe('useCarry along an axis', () => {
  it('follows the pointer along the axis in steps and keeps to the range', () => {
    const { log, knob } = renderDial();
    down(knob(), { x: 300, y: 25 });
    move({ x: 362, y: 400 });
    // 262 of 500 pixels is 52.4, which snaps to 50. The y position does not matter.
    expect(knob().textContent).toBe('knob 50');
    move({ x: 900, y: 25 });
    expect(knob().textContent).toBe('knob 100');
    up({ x: -50, y: 25 });
    expect(log).toEqual(['change 50', 'change 100', 'change 0', 'drop 0']);
    // The item itself does not jump around: an axis move changes the value, not the position.
    expect(knob().style.translate).toBe('');
  });

  it('steps with the arrow keys, right and up raise and left and down lower', () => {
    const { log, knob } = renderDial();
    key(knob(), 'Enter');
    key(knob(), 'ArrowRight');
    key(knob(), 'ArrowUp');
    key(knob(), 'ArrowDown');
    key(knob(), 'ArrowLeft');
    key(knob(), 'ArrowLeft');
    key(knob(), 'Enter');
    expect(log).toEqual(['change 50', 'change 60', 'change 50', 'change 40', 'change 30', 'drop 30']);
  });

  it.each([
    ['the browser cancels the drag', () => cancel()],
    ['the window loses focus', blur],
  ])('puts the value back where it started when %s', (_reason, interrupt) => {
    const { log, knob } = renderDial();
    down(knob(), { x: 300, y: 25 });
    move({ x: 362, y: 25 });
    expect(knob().textContent).toBe('knob 50');
    interrupt();
    expect(knob().textContent).toBe('knob 40');
    up({ x: 500, y: 25 });
    expect(log).toEqual(['change 50', 'change 40']);
  });

  it('puts the value back where it started when the track leaves the screen before the release', () => {
    const { log, knob, loseTrack } = renderDial();
    down(knob(), { x: 300, y: 25 });
    move({ x: 362, y: 25 });
    loseTrack();
    up({ x: 500, y: 25 });
    expect(knob().textContent).toBe('knob 40');
    expect(log).toEqual(['change 50', 'change 40']);
  });

  it('puts the value back where it started when Escape cancels', () => {
    const { log, knob } = renderDial();
    key(knob(), ' ');
    key(knob(), 'ArrowRight');
    key(knob(), 'Escape');
    expect(knob().textContent).toBe('knob 40');
    expect(log).toEqual(['change 50', 'change 40']);
  });
});

/** A picnic whose drops check, as they happen, that the target is on screen and takes the item. */
function CheckedPicnic({ kit, scene, events }: { kit: ReturnType<typeof fakeKit>; scene: PicnicScene; events: Log }) {
  const { basket = true, basketTakes = true, pear = true } = scene;
  const takes = (item: Fruit, target: Place) => (target === 'basket' ? basketTakes : item === 'pear');
  const carry = useCarry<Fruit, Place>(kit, {
    kind: 'targets',
    accepts: takes,
    onDrop: (item, target) => {
      const onScreen = screen.queryByText(target) !== null;
      events.drops.push(`${item} -> ${target}${onScreen && takes(item, target) ? '' : ' (not a valid target)'}`);
    },
  });
  return (
    <div>
      <button type='button' {...carry.item('apple')}>
        apple
      </button>
      {pear && (
        <button type='button' {...carry.item('pear')}>
          pear
        </button>
      )}
      {basket && <div {...carry.target('basket')}>basket</div>}
      <div {...carry.target('plate')}>plate</div>
    </div>
  );
}

const fruitOnScreen = () => screen.queryAllByText(/^(apple|pear)$/);
const carriedNames = () =>
  fruitOnScreen()
    .filter((item) => item.dataset.carried === 'true')
    .map((item) => item.textContent ?? '');

/** What one input broke of the carry rules, given what was carried before and after and what dropped. */
function brokenRules(before: readonly string[], after: readonly string[], drops: readonly string[]): string[] {
  const broken: string[] = [];
  if (after.length > 1) broken.push(`${String(after.length)} items carried at once`);
  if (drops.length > 1) broken.push(`${String(drops.length)} drops from one input`);
  for (const drop of drops) {
    if (drop.endsWith('(not a valid target)')) broken.push(`dropped where it may not land: ${drop}`);
    if (!before.some((name) => drop.startsWith(`${name} -> `))) broken.push(`dropped an item not carried: ${drop}`);
    if (after.length > 0) broken.push(`still carrying after a drop: ${drop}`);
  }
  // An item that is not carried is back in its place.
  for (const item of fruitOnScreen()) {
    if (item.dataset.carried !== 'true' && item.style.translate !== '') {
      broken.push(`${item.textContent ?? ''} left at ${item.style.translate}`);
    }
  }
  return broken;
}

interface Input {
  readonly text: string;
  /** The pointer that made the input, or null for a key, a blur, or a change on screen. */
  readonly pointer: number | null;
  /** A press on a fruit. */
  readonly pressed?: boolean;
  /**
   * A release, a cancel, a move with no button held, or another press: each ends the pointer's
   * press. A second press by the holder means its release was lost, so it becomes the placing click.
   */
  readonly ends?: boolean;
}

describe('useCarry under random pointer and keyboard input', () => {
  const KEYS = ['Enter', ' ', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a'];

  /** One random input, and the pointer that made it. Points range past the window's edges. */
  function randomInput(random: Random, rerender: (scene: PicnicScene) => void): Input {
    const at = { x: random.int(-60, 700), y: random.int(-60, 600) };
    const pointer = random.pick([MOUSE, MOUSE, 2]);
    const where = `${JSON.stringify(at)} #${String(pointer)}`;
    const kind = random.int(0, 9);
    if (kind === 0) {
      const element = random.pick(['apple', 'pear', 'basket', 'plate'].flatMap((name) => screen.queryAllByText(name)));
      down(element, at, 0, pointer);
      const name = element.textContent ?? '';
      return { text: `down ${name} ${where}`, pointer, pressed: name === 'apple' || name === 'pear', ends: true };
    }
    if (kind === 1) return (move(at, pointer), { text: `move ${where}`, pointer });
    if (kind === 2) return (hover(at, pointer), { text: `hover ${where}`, pointer, ends: true });
    if (kind === 3) return (up(at, pointer), { text: `up ${where}`, pointer, ends: true });
    if (kind === 4) return (cancel(pointer), { text: `cancel #${String(pointer)}`, pointer, ends: true });
    if (kind === 5) return (blur(), { text: 'blur', pointer: null });
    if (kind === 6) {
      const scene = { basket: random.int(0, 3) > 0, basketTakes: random.int(0, 3) > 0, pear: random.int(0, 3) > 0 };
      return (rerender(scene), { text: `scene ${JSON.stringify(scene)}`, pointer: null });
    }
    const fruit = random.pick(fruitOnScreen());
    const name = random.pick(KEYS);
    key(fruit, name);
    return { text: `key ${JSON.stringify(name)} on ${fruit.textContent ?? ''}`, pointer: null };
  }

  it.each(Array.from({ length: 40 }, (_, index) => index * 7919 + 1))(
    'keeps at most one item carried and lands each on a valid target or puts it back, seed %i',
    (seed) => {
      const random = createRandom(seed);
      const kit = fakeKit();
      const events: Log = { drops: [] };
      const view = render(<CheckedPicnic kit={kit} scene={{}} events={events} />);
      const rerender = (scene: PicnicScene) => {
        view.rerender(<CheckedPicnic kit={kit} scene={scene} events={events} />);
        layOutPicnic();
      };
      layOutPicnic();
      const steps: string[] = [];
      // The pointer whose press picked the item up, until that press ends.
      let holder: number | null = null;
      for (let step = 0; step < 80; step += 1) {
        const before = carriedNames();
        const placesBefore = fruitOnScreen().map((item) => item.style.translate);
        const dropsBefore = events.drops.length;
        const input = randomInput(random, rerender);
        steps.push(input.text);
        const after = carriedNames();
        const drops = events.drops.slice(dropsBefore);
        const broken = brokenRules(before, after, drops);
        const placesAfter = fruitOnScreen().map((item) => item.style.translate);
        const changed =
          drops.length > 0 || after.join() !== before.join() || placesAfter.join() !== placesBefore.join();
        if (holder !== null && input.pointer !== null && input.pointer !== holder && changed) {
          broken.push(`pointer ${String(input.pointer)} moved or dropped the item pointer ${String(holder)} holds`);
        }
        expect(broken, steps.join('\n')).toEqual([]);
        if (before.length === 0 && after.length === 1 && input.pressed === true) holder = input.pointer;
        else if (after.length === 0 || input.pointer === null || (input.pointer === holder && input.ends === true)) {
          holder = null;
        }
      }
    },
  );
});
