import { Check, Minus } from 'lucide-react';
import { useId } from 'react';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** A sentence under the label that says what the setting does. */
  description?: string;
  disabled?: boolean;
}

/**
 * An on and off setting. The thumb moves and shows a check or a dash, so the state does not
 * depend on color. Space and Enter toggle it, as on any button.
 */
export function Switch({ label, checked, onCheckedChange, description, disabled }: SwitchProps) {
  const id = useId();
  const descriptionId = description === undefined ? undefined : `${id}-description`;
  return (
    <div className='wk-switch-row'>
      <div className='wk-field'>
        <label className='wk-field-label' htmlFor={id}>
          {label}
        </label>
        {description !== undefined && (
          <p className='wk-field-hint' id={descriptionId}>
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type='button'
        role='switch'
        className='wk-switch'
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className='wk-switch-track' />
        <span className='wk-switch-thumb' aria-hidden='true'>
          {checked ? <Check strokeWidth={3.5} /> : <Minus strokeWidth={3.5} />}
        </span>
      </button>
    </div>
  );
}
