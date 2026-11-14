import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** A picture next to the label. */
  icon?: ReactNode;
}

export interface SegmentedChoiceProps<T extends string> {
  /** The question the choice answers. */
  label: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
}

/**
 * One choice from a short list, such as an age band or a text size. Native radio buttons, so the
 * arrow keys move the choice. The chosen option shows a check, not only a color.
 */
export function SegmentedChoice<T extends string>({ label, options, value, onValueChange }: SegmentedChoiceProps<T>) {
  const name = useId();
  return (
    <fieldset className='wk-field'>
      <legend className='wk-field-label'>{label}</legend>
      <div className='wk-segments'>
        {options.map((option) => (
          <label key={option.value} className='wk-segment'>
            <input
              type='radio'
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onValueChange(option.value)}
            />
            {option.value === value && (
              <Check className='wk-lucide wk-segment-check' strokeWidth={3.5} aria-hidden='true' />
            )}
            {option.icon}
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
