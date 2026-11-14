import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export interface TileProps extends Omit<ComponentProps<'button'>, 'type' | 'children'> {
  /** The picture. A URL of an art file, or an element such as an Avatar. */
  picture: string | ReactNode;
  /** The name of the choice. The youngest band does not see it; screen readers always read it. */
  label: string;
  /** For a choice that stays chosen, such as an avatar. Adds a check, so color is not the only sign. */
  selected?: boolean;
}

/** A big picture choice for area pickers, activity pickers, and profile choices. */
export function Tile({ picture, label, selected, className, ...props }: TileProps) {
  return (
    <button
      {...props}
      type='button'
      aria-pressed={selected}
      className={['wk-tile', className].filter(Boolean).join(' ')}
    >
      {typeof picture === 'string' ? (
        <img className='wk-tile-picture' src={picture} alt='' draggable={false} />
      ) : (
        picture
      )}
      <span className='wk-reading-text'>{label}</span>
      {selected === true && (
        <span className='wk-tile-check' aria-hidden='true'>
          <Check strokeWidth={3.5} />
        </span>
      )}
    </button>
  );
}
