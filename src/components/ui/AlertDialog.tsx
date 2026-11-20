import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { useReturnFocus } from './useReturnFocus.ts';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Names the action, such as "Delete profile". Never "OK". */
  confirmLabel: string;
  /** Names the way out, such as "Keep profile". */
  cancelLabel: string;
  onConfirm: () => void;
  /** Shows the confirm button in the danger color, for an action that removes something. */
  destructive?: boolean;
}

/**
 * A question the adult must answer before something happens. Focus starts on the cancel button,
 * so pressing Enter by habit does not confirm. Escape cancels.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
}: AlertDialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className='wk-dialog-scrim' />
        <AlertDialogPrimitive.Content
          className='wk-dialog'
          data-band='band-9-12'
          data-text-size='standard'
          data-letter-spacing='standard'
          {...returnFocus}
        >
          <AlertDialogPrimitive.Title className='wk-dialog-title'>{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className='wk-dialog-description'>
            {description}
          </AlertDialogPrimitive.Description>
          <div className='wk-dialog-actions'>
            <AlertDialogPrimitive.Cancel className='wk-button' data-variant='secondary'>
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className='wk-button'
              data-variant={destructive ? 'danger' : 'primary'}
              onClick={onConfirm}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
