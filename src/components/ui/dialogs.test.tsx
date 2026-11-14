// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertDialog } from './AlertDialog.tsx';
import { Dialog } from './Dialog.tsx';

afterEach(cleanup);

function DialogHarness({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    onOpenChange(next);
    setOpen(next);
  };
  return (
    <>
      <button type='button' onClick={() => change(true)}>
        Open the parent corner
      </button>
      <Dialog open={open} onOpenChange={change} title='Parent corner' description='Settings.' closeLabel='Close'>
        <input aria-label='PIN' />
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens as a named modal dialog with a labelled close button that closes it', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(<DialogHarness onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the parent corner' }));

    const dialog = screen.getByRole('dialog', { name: 'Parent corner' });
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Settings.').id);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(<DialogHarness onOpenChange={onOpenChange} />);
    const opener = screen.getByRole('button', { name: 'Open the parent corner' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    // Radix returns focus on the next task, after the dialog unmounts.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe('AlertDialog', () => {
  const props = {
    open: true,
    title: 'Delete this profile?',
    description: 'Its pictures go too.',
    confirmLabel: 'Delete profile',
    cancelLabel: 'Keep profile',
  };

  it('confirms only from the confirm button', () => {
    const onConfirm = vi.fn<() => void>();
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(<AlertDialog {...props} destructive onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    screen.getByRole('alertdialog', { name: 'Delete this profile?' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('starts with focus on the way out, so a habitual Enter does not confirm', () => {
    const onConfirm = vi.fn<() => void>();
    render(<AlertDialog {...props} onOpenChange={() => {}} onConfirm={onConfirm} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep profile' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the confirm button in the danger style only for a destructive action', () => {
    const { rerender } = render(<AlertDialog {...props} onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete profile' }).dataset.variant).toBe('primary');
    rerender(<AlertDialog {...props} destructive onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete profile' }).dataset.variant).toBe('danger');
  });
});
