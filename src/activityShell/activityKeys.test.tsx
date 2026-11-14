// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createManualScheduler } from '../core/activityKit/scheduler.ts';
import { createScope } from '../core/activityKit/scope.ts';
import { activityOwnsKey, useActivityKeys } from './activityKeys.ts';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function element(html: string): Element {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  document.body.append(holder);
  const found = holder.querySelector('[data-target]');
  if (found === null) throw new Error('The fixture has no data-target element.');
  return found;
}

describe('activityOwnsKey', () => {
  it.each([
    ['a letter with nothing focused', 'b', () => document.body, {}, true],
    ['Enter with nothing focused', 'Enter', () => document.body, {}, true],
    ['an arrow on a focused button', 'ArrowLeft', () => element('<button data-target>x</button>'), {}, true],
    ['a letter on a focused button', 'q', () => element('<button data-target>x</button>'), {}, true],
    [
      'Enter on a focused button, which presses it',
      'Enter',
      () => element('<button data-target>x</button>'),
      {},
      false,
    ],
    ['Space on a picture inside a button', ' ', () => element('<button><img data-target alt=""></button>'), {}, false],
    ['Tab on a focused link', 'Tab', () => element('<a href="#x" data-target>x</a>'), { takeTab: true }, false],
    ['a letter in a text field', 'b', () => element('<input data-target>'), {}, false],
    [
      'a letter in editable text',
      'b',
      () => element('<div contenteditable="true"><span data-target></span></div>'),
      {},
      false,
    ],
    ['Tab with nothing focused', 'Tab', () => document.body, {}, false],
    ['Tab with nothing focused, when the activity takes Tab', 'Tab', () => document.body, { takeTab: true }, true],
    [
      'Tab from a plain focusable area that takes Tab',
      'Tab',
      () => element('<div tabindex="0" data-target></div>'),
      { takeTab: true },
      true,
    ],
  ])('%s: %s', (_label, key, target, options, expected) => {
    expect(activityOwnsKey({ key, target: target(), defaultPrevented: false }, options)).toBe(expected);
  });

  it('leaves a press that something else already handled', () => {
    expect(activityOwnsKey({ key: 'ArrowUp', target: document.body, defaultPrevented: true })).toBe(false);
  });
});

function Listener({ scope, log }: { scope: ReturnType<typeof createScope>; log: string[] }) {
  useActivityKeys({ scope }, (event) => log.push(event.key));
  return <button type='button'>Replay</button>;
}

describe('useActivityKeys', () => {
  it('hears window key presses it owns until the scope ends', () => {
    const scope = createScope(createManualScheduler({ wall: 0 }));
    const log: string[] = [];
    const { getByRole } = render(<Listener scope={scope} log={log} />);
    fireEvent.keyDown(window, { key: 'a' });
    // Enter on the focused button presses the button; the activity does not hear it.
    fireEvent.keyDown(getByRole('button'), { key: 'Enter' });
    fireEvent.keyDown(getByRole('button'), { key: 'ArrowUp' });
    scope.dispose();
    fireEvent.keyDown(window, { key: 'z' });
    expect(log).toEqual(['a', 'ArrowUp']);
  });
});
