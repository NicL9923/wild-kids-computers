import { CircleAlert } from 'lucide-react';
import { useId, type ComponentProps } from 'react';

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id' | 'aria-invalid' | 'aria-describedby'> {
  label: string;
  /** Help that stays visible under the field. */
  hint?: string;
  /** What is wrong and how to fix it. Marks the field invalid. */
  error?: string;
}

/** A labelled text input with an optional hint and error message. */
export function TextField({ label, hint, error, className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={['wk-field', className].filter(Boolean).join(' ')}>
      <label className='wk-field-label' htmlFor={id}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        className='wk-input'
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy}
      />
      {error !== undefined && (
        <p className='wk-field-error' id={errorId}>
          <CircleAlert aria-hidden='true' className='wk-lucide' />
          {error}
        </p>
      )}
      {hint !== undefined && (
        <p className='wk-field-hint' id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}
