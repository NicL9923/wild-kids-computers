import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';

export interface ChoiceOption<T extends string> {
  readonly value: T;
  /** The name. Always read by screen readers; shown according to `labels`. */
  readonly label: string;
  readonly picture?: ReactNode;
  /** A sentence under the label, for choices an adult reads, such as an age band. */
  readonly description?: string;
}

export interface ChoiceGroupProps<T extends string> {
  /** The question the choice answers. */
  legend: string;
  /** Hide the legend when a heading above already asks the question. Screen readers still read it. */
  legendHidden?: boolean;
  options: readonly ChoiceOption<T>[];
  /** Null before anything is chosen. */
  value: T | null;
  onValueChange: (value: T) => void;
  /**
   * `reading`: the label shows from band-6-8 up, for picture choices a young child makes.
   * `always`: the label always shows, for choices an adult makes.
   */
  labels: 'reading' | 'always';
  /** `pictures` lays out a grid of picture squares; `cards` a row of text cards. */
  layout: 'pictures' | 'cards';
}

/**
 * One choice from a set of pictures or cards, such as an avatar, a color, or an age band. Native
 * radio buttons, so Tab enters the group and the arrow keys move the choice. The chosen option
 * shows a check, so color is never the only sign.
 */
export function ChoiceGroup<T extends string>({
  legend,
  legendHidden = false,
  options,
  value,
  onValueChange,
  labels,
  layout,
}: ChoiceGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className='wk-choice-group'>
      <legend className={legendHidden ? 'wk-visually-hidden' : 'wk-field-label'}>{legend}</legend>
      <div className='wk-choice-options' data-layout={layout}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label key={option.value} className='wk-choice' data-checked={checked}>
              <input
                type='radio'
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onValueChange(option.value)}
              />
              {option.picture}
              <span className='wk-choice-text'>
                <span className={labels === 'reading' ? 'wk-choice-label wk-reading-text' : 'wk-choice-label'}>
                  {option.label}
                </span>
                {option.description !== undefined && (
                  <span className='wk-choice-description'>{option.description}</span>
                )}
              </span>
              {checked && (
                <span className='wk-choice-check' aria-hidden='true'>
                  <Check strokeWidth={3.5} />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
