import { Emoji } from '../../../components/ui/Emoji.tsx';
import type { EmojiId } from '../../../core/strings/shared/emoji.ts';
import { SCATTER_BOARD, type Spot } from './scatter.ts';

/** Things per row, like a ten frame. */
export const PER_ROW = 5;

export interface ObjectGroupProps {
  readonly kind: EmojiId;
  readonly count: number;
  /**
   * Places on a SCATTER_BOARD for a scattered group, with `size` as each thing's width. Leave out
   * for rows of five, like a ten frame.
   */
  readonly spots?: readonly Spot[] | undefined;
  readonly size?: number | undefined;
}

/**
 * A group of one kind of thing to count, in rows of five or scattered. It fills its nearest size
 * container. Each picture keeps its name, so a screen reader can count them too.
 */
export function ObjectGroup({ kind, count, spots, size }: ObjectGroupProps) {
  const things = Array.from({ length: count }, (_, index) => <Emoji key={index} id={kind} className='math-object' />);
  if (spots === undefined || size === undefined) return <span className='math-objects'>{things}</span>;
  return (
    <span className='math-scatter'>
      {spots.map((spot, index) => (
        <span
          key={index}
          className='math-spot'
          style={{
            left: `${String((spot.x / SCATTER_BOARD.width) * 100)}%`,
            top: `${String((spot.y / SCATTER_BOARD.height) * 100)}%`,
            width: `${String((size / SCATTER_BOARD.width) * 100)}%`,
          }}
        >
          {things[index]}
        </span>
      ))}
    </span>
  );
}
