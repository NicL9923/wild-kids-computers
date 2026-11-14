import { useId } from 'react';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  /** How the value reads aloud and on screen, such as "60%". Defaults to the number. */
  valueText?: string;
  disabled?: boolean;
}

/**
 * A labelled slider. It is a native range input, so the arrow keys, Home, End, and Page keys
 * work, and a click on the track moves the thumb there: no drag is needed.
 */
export function Slider({ label, value, min, max, step = 1, onValueChange, valueText, disabled }: SliderProps) {
  const id = useId();
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const shown = valueText ?? String(value);
  return (
    <div className='wk-field'>
      <label className='wk-field-label' htmlFor={id}>
        {label}
      </label>
      <div className='wk-slider-row'>
        <input
          id={id}
          className='wk-slider'
          type='range'
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={shown}
          style={{ '--wk-slider-fill': `${fill}%` }}
          onChange={(event) => onValueChange(Number(event.currentTarget.value))}
        />
        <output className='wk-slider-value' htmlFor={id} aria-hidden='true'>
          {shown}
        </output>
      </div>
    </div>
  );
}
