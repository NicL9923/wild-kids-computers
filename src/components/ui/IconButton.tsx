import type { ComponentProps, ReactNode } from 'react';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'type' | 'aria-label' | 'children'> {
  /** The accessible name. Required: a picture alone has no name. Pass text from t(). */
  label: string;
  icon: ReactNode;
  variant?: 'primary' | 'secondary';
  /** For a toggle such as mute. Sets aria-pressed and the pressed look. */
  pressed?: boolean;
}

/** A square button that shows only a picture. Its label is spoken by screen readers. */
export function IconButton({ label, icon, variant = 'secondary', pressed, className, ...props }: IconButtonProps) {
  if (label.trim() === '') throw new Error('IconButton needs a label: a button that shows only a picture has no name.');
  return (
    <button
      {...props}
      type='button'
      aria-label={label}
      aria-pressed={pressed}
      data-variant={variant}
      data-shape='icon'
      className={['wk-button', className].filter(Boolean).join(' ')}
    >
      {icon}
    </button>
  );
}
