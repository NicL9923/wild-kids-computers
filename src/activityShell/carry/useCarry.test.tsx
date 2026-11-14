// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SfxName } from '../../audio/sfx/sfxNames.ts';
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
  return { scope, play: (name: SfxName) => sounds.push(name), sounds };
}

type Fruit = 'apple' | 'pear';
type Place = 'basket' | 'plate';

interface Log {
  drops: string[];
}

function Picnic({ kit, log }: { kit: ReturnType<typeof fakeKit>; log: Log }) {
  const carry = useCarry<Fruit, Place>(kit, {
    kind: 'targets',
    // The plate takes only the pear.
    accepts: (item, target) => target !== 'plate' || item === 'pear',
    onDrop: (item, target) => log.drops.push(`${item} -> ${target}`),
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
      <div {...carry.target('plate')}>plate</div>
    </div>
  );
}

function renderPicnic() {
  const kit = fakeKit();
  const log: Log = { drops: [] };
  render(<Picnic kit={kit} log={log} />);
  placeAt(screen.getByText('apple'), 0, 0, 100, 100);
  placeAt(screen.getByText('pear'), 0, 200, 100, 100);
  placeAt(screen.getByText('basket'), 400, 0, 200, 200);
  placeAt(screen.getByText('plate'), 400, 300, 200, 200);
  return { kit, log, apple: screen.getByText('apple'), basket: screen.getByText('basket') };
}

const down = (element: Element, point: Point, button = 0) =>
  fireEvent.pointerDown(element, { clientX: point.x, clientY: point.y, button });
const move = (point: Point) => fireEvent.pointerMove(window, { clientX: point.x, clientY: point.y });
const up = (point: Point) => fireEvent.pointerUp(window, { clientX: point.x, clientY: point.y });
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
    move({ x: 480, y: 120 });
    expect(apple.style.translate).toBe('430px 70px');
    up({ x: 480, y: 120 });
    expect(log.drops).toEqual(['apple -> basket']);
    expect(apple.dataset.carried).toBe('false');
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

  it('stops listening once the activity scope is disposed', () => {
    const { kit, log, apple } = renderPicnic();
    down(apple, { x: 50, y: 50 });
    move({ x: 300, y: 80 });
    act(() => kit.scope.dispose());
    up({ x: 450, y: 50 });
    expect(log.drops).toEqual([]);
  });
});

function Desk({ kit, placed }: { kit: ReturnType<typeof fakeKit>; placed: Point[] }) {
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
    <div ref={area} data-testid='area'>
      <button type='button' {...carry.item('window')}>
        window
      </button>
    </div>
  );
}

function renderDesk() {
  const kit = fakeKit();
  const placed: Point[] = [];
  render(<Desk kit={kit} placed={placed} />);
  placeAt(screen.getByTestId('area'), 0, 0, 800, 600);
  placeAt(screen.getByText('window'), 100, 100, 200, 150);
  return { placed, item: screen.getByText('window') };
}

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

  it('places nothing when Escape cancels', () => {
    const { placed, item } = renderDesk();
    key(item, 'Enter');
    key(item, 'ArrowLeft');
    key(item, 'Escape');
    expect(placed).toEqual([]);
  });
});

function Dial({ kit, log }: { kit: ReturnType<typeof fakeKit>; log: string[] }) {
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
    <div ref={track} data-testid='track'>
      <button type='button' {...carry.item('knob')}>
        {`knob ${String(value)}`}
      </button>
    </div>
  );
}

function renderDial() {
  const kit = fakeKit();
  const log: string[] = [];
  render(<Dial kit={kit} log={log} />);
  placeAt(screen.getByTestId('track'), 100, 0, 500, 50);
  return { log, knob: () => screen.getByRole('button') };
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

  it('puts the value back where it started when Escape cancels', () => {
    const { log, knob } = renderDial();
    key(knob(), ' ');
    key(knob(), 'ArrowRight');
    key(knob(), 'Escape');
    expect(knob().textContent).toBe('knob 40');
    expect(log).toEqual(['change 50', 'change 40']);
  });
});
