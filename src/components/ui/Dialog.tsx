import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { useReturnFocus } from './useReturnFocus.ts';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** A sentence under the title. Screen readers read it when the dialog opens. */
  description?: string;
  /** The name of the close button in the corner. */
  closeLabel: string;
  children?: ReactNode;
  /** The buttons along the bottom. */
  actions?: ReactNode;
}

/**
 * A dialog for the parent corner. Radix moves focus in, traps it, closes on Escape, and returns
 * focus to the control that opened it.
 */
export function Dialog({ open, onOpenChange, title, description, closeLabel, children, actions }: DialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='wk-dialog-scrim' />
        <DialogPrimitive.Content
          className='wk-dialog'
          data-band='band-9-12'
          data-text-size='standard'
          data-letter-spacing='standard'
          {...returnFocus}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <div className='wk-dialog-head'>
            <DialogPrimitive.Title className='wk-dialog-title'>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className='wk-button' data-shape='icon' aria-label={closeLabel}>
              <X className='wk-lucide' strokeWidth={3} aria-hidden='true' />
            </DialogPrimitive.Close>
          </div>
          {description !== undefined && (
            <DialogPrimitive.Description className='wk-dialog-description'>{description}</DialogPrimitive.Description>
          )}
          {children}
          {actions !== undefined && <div className='wk-dialog-actions'>{actions}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
