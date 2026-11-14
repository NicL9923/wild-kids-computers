import type { ComponentProps, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'type'> {
  variant?: ButtonVariant;
  /** A picture before the label: an InterfaceIcon for children, a Lucide icon for adults. */
  icon?: ReactNode;
  /** Defaults to "button" so a Button inside a form never submits it by accident. */
  type?: 'button' | 'submit';
}

/** A pressable button with a text label. At least --wk-target-min in each direction. */
export function Button({ variant = 'secondary', icon, type = 'button', className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      data-variant={variant}
      className={['wk-button', className].filter(Boolean).join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}
