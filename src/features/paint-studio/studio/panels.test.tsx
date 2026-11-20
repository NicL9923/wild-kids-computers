// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PickerPanel } from './panels.tsx';

afterEach(cleanup);

function PickerHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type='button' onClick={() => setOpen(true)}>
        open picker
      </button>
      <button type='button' onClick={() => setOpen(false)}>
        other tool
      </button>
      {open && (
        <PickerPanel title='Choices' onClose={() => setOpen(false)}>
          <button type='button' aria-pressed='true'>
            choice one
          </button>
        </PickerPanel>
      )}
    </div>
  );
}

describe('PickerPanel focus restoration', () => {
  it('returns focus to the opener when closed with Escape while focus is inside the panel', () => {
    render(<PickerHarness />);
    const opener = screen.getByRole('button', { name: 'open picker' });
    opener.focus();
    fireEvent.click(opener);
    const choice = screen.getByRole('button', { name: 'choice one' });
    expect(document.activeElement).toBe(choice);

    fireEvent.keyDown(choice, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('does not steal focus back to the opener when focus already moved to an outside control', () => {
    render(<PickerHarness />);
    const opener = screen.getByRole('button', { name: 'open picker' });
    const outside = screen.getByRole('button', { name: 'other tool' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'choice one' }));

    outside.focus();
    fireEvent.click(outside);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });
});
