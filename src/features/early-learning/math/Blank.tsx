import type { ComponentProps } from 'react';
import { t } from '../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../core/strings/shared/index.ts';
import { strings } from './strings.ts';

export interface BlankProps extends ComponentProps<'span'> {
  /** The number that belongs in the blank. */
  readonly value: number;
  /** Shows the number once the child has found it. */
  readonly filled: boolean;
}

/**
 * The dashed box where a missing number goes. It shows a question mark until the number is
 * found; assistive technology hears "the missing number" instead of the mark.
 */
export function Blank({ value, filled, className, ...rest }: BlankProps) {
  return (
    <span {...rest} className={className === undefined ? 'math-blank' : `math-blank ${className}`} data-filled={filled}>
      {filled ? (
        t(numberHandle(value))
      ) : (
        <>
          <span aria-hidden='true'>{t(strings.unknown)}</span>
          <span className='wk-visually-hidden'>{t(strings.missing)}</span>
        </>
      )}
    </span>
  );
}
