// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeSettings } from './theme.ts';
import { DEFAULT_THEME, ThemeRoot, useReducedMotion } from './ThemeRoot.tsx';

afterEach(cleanup);

const html = document.documentElement;

/** A fake of the operating system's reduced motion preference. Any other media query throws. */
function stubSystemMotion(initiallyReduced: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initiallyReduced,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', (text: string) => {
    if (text !== '(prefers-reduced-motion: reduce)') throw new Error(`Unexpected media query ${text}`);
    return query;
  });
  return {
    change(reduced: boolean) {
      query.matches = reduced;
      for (const listener of listeners) listener();
    },
  };
}

function MotionProbe() {
  return <p data-testid='motion'>{useReducedMotion() ? 'still' : 'moving'}</p>;
}

function Page() {
  const [showInner, setShowInner] = useState(true);
  return (
    <ThemeRoot>
      {showInner && (
        <ThemeRoot settings={{ ...DEFAULT_THEME, band: 'band-6-8' }}>
          <button type='button' onClick={() => setShowInner(false)}>
            leave
          </button>
        </ThemeRoot>
      )}
    </ThemeRoot>
  );
}

const motionShown = () => screen.getByTestId('motion').textContent;

describe('ThemeRoot', () => {
  it('puts the band on <html>, so dialogs in a portal get the same tokens, and takes it off on unmount', () => {
    const { unmount } = render(
      <ThemeRoot settings={{ ...DEFAULT_THEME, band: 'band-9-12', letterSpacing: 'wider' }}>
        <p>child</p>
      </ThemeRoot>,
    );
    expect(html.getAttribute('data-band')).toBe('band-9-12');
    expect(html.getAttribute('data-letter-spacing')).toBe('wider');
    unmount();
    expect(html.hasAttribute('data-band')).toBe(false);
    expect(html.hasAttribute('data-letter-spacing')).toBe(false);
  });

  it('lets a nested root change the theme until it unmounts', () => {
    render(<Page />);
    expect(html.getAttribute('data-band')).toBe('band-6-8');
    act(() => screen.getByRole('button', { name: 'leave' }).click());
    expect(html.getAttribute('data-band')).toBe(DEFAULT_THEME.band);
  });

  it('follows the system motion preference while the setting is "system", and changes when it does', () => {
    const system = stubSystemMotion(false);
    render(
      <ThemeRoot>
        <MotionProbe />
      </ThemeRoot>,
    );
    expect(motionShown()).toBe('moving');
    act(() => system.change(true));
    expect(motionShown()).toBe('still');
  });

  it.each([
    { setting: 'on', system: false, shown: 'still', attribute: 'reduce' },
    { setting: 'off', system: true, shown: 'moving', attribute: 'full' },
  ] as const)('a parent setting of $setting overrides the system', ({ setting, system, shown, attribute }) => {
    stubSystemMotion(system);
    const settings: ThemeSettings = { ...DEFAULT_THEME, reducedMotion: setting };
    render(
      <ThemeRoot settings={settings}>
        <MotionProbe />
      </ThemeRoot>,
    );
    expect(motionShown()).toBe(shown);
    expect(html.getAttribute('data-motion')).toBe(attribute);
  });
});
