import { t } from '../../../core/strings/defineStrings.ts';
import { letterNames, numberHandle } from '../../../core/strings/shared/index.ts';
import { PICTURE_KEYS, PICTURE_ROWS, PICTURE_WIDTH, type PictureKey } from './keyboardLayout.ts';
import './keyboardPicture.css';

/**
 * A picture of a keyboard for the keyboard activities. It is a picture, not a control: the child
 * presses the real keys. A key can be marked as the one to press, which draws it in the accent
 * color with a thick ring, or as just pressed. A row can be tinted as a softer hint.
 */

export type KeyMark = 'target' | 'pressed';

export interface KeyboardPictureProps {
  /** The accessible name of the picture. */
  readonly label: string;
  /** Marks by key code, such as `{ Space: 'target' }`. */
  readonly marks?: Readonly<Record<string, KeyMark>>;
  /** A row to tint, 0 at the top. */
  readonly rowHint?: number | null;
  /** Shows only the arrow keys, larger. */
  readonly arrowsOnly?: boolean;
  readonly className?: string;
}

const UNIT = 100;
const GAP = 8;

function Face({ keyCap, width }: { keyCap: PictureKey; width: number }) {
  const cx = width / 2;
  const cy = UNIT / 2;
  const face = keyCap.face;
  if (face.kind === 'letter' || face.kind === 'digit') {
    const text = face.kind === 'letter' ? t(letterNames[face.letter]).toUpperCase() : t(numberHandle(face.digit));
    return (
      <text x={cx} y={cy} className='keypic-label' dominantBaseline='central' textAnchor='middle'>
        {text}
      </text>
    );
  }
  if (face.kind === 'blank') return null;
  switch (face.symbol) {
    case 'arrow':
      return (
        <path
          className='keypic-symbol'
          d='M0 -22 L18 0 H7 V20 H-7 V0 H-18 Z'
          transform={`translate(${String(cx)} ${String(cy)}) rotate(${String(keyCap.turn ?? 0)})`}
        />
      );
    case 'enter':
      return (
        <path
          className='keypic-stroke'
          d={`M${String(cx + 26)} ${String(cy - 22)} V${String(cy + 6)} H${String(cx - 22)} m14 -14 l-14 14 l14 14`}
        />
      );
    case 'backspace':
      return (
        <path
          className='keypic-stroke'
          d={`M${String(cx + 28)} ${String(cy)} H${String(cx - 26)} m14 -14 l-14 14 l14 14`}
        />
      );
    case 'tab':
      return (
        <path
          className='keypic-stroke'
          d={`M${String(cx - 26)} ${String(cy)} H${String(cx + 22)} m-14 -14 l14 14 l-14 14 M${String(cx + 26)} ${String(cy - 16)} V${String(cy + 16)}`}
        />
      );
    case 'shift':
      return (
        <path
          className='keypic-stroke'
          d={`M${String(cx)} ${String(cy - 24)} L${String(cx + 22)} ${String(cy)} H${String(cx + 10)} V${String(cy + 20)} H${String(cx - 10)} V${String(cy)} H${String(cx - 22)} Z`}
        />
      );
    default:
      return null;
  }
}

export function KeyboardPicture({
  label,
  marks = {},
  rowHint = null,
  arrowsOnly = false,
  className,
}: KeyboardPictureProps) {
  const keys = arrowsOnly ? PICTURE_KEYS.filter((key) => key.code.startsWith('Arrow')) : PICTURE_KEYS;
  const left = Math.min(...keys.map((key) => key.x));
  const top = Math.min(...keys.map((key) => key.row));
  const width = arrowsOnly ? 3 : PICTURE_WIDTH;
  const rows = arrowsOnly ? 2 : PICTURE_ROWS;
  return (
    <figure className={['keypic-figure', className].filter(Boolean).join(' ')}>
      <svg
        aria-hidden='true'
        className='keypic'
        viewBox={`${String(-GAP)} ${String(-GAP)} ${String(width * UNIT + GAP * 2)} ${String(rows * UNIT + GAP * 2)}`}
      >
        {rowHint !== null && !arrowsOnly && (
          <rect
            className='keypic-row-hint'
            x={-GAP}
            y={rowHint * UNIT - GAP / 2}
            width={PICTURE_WIDTH * UNIT + GAP * 2}
            height={UNIT + GAP}
            rx={20}
            data-row-hint={rowHint}
          />
        )}
        {keys.map((key) => {
          const keyWidth = key.width * UNIT - GAP;
          return (
            <g
              key={key.code}
              transform={`translate(${String((key.x - left) * UNIT + GAP / 2)} ${String((key.row - top) * UNIT + GAP / 2)})`}
              className='keypic-key'
              data-key={key.code}
              data-mark={marks[key.code] ?? 'none'}
            >
              <rect className='keypic-cap' width={keyWidth} height={UNIT - GAP} rx={14} />
              <Face keyCap={key} width={keyWidth} />
            </g>
          );
        })}
      </svg>
      <figcaption className='wk-visually-hidden'>{label}</figcaption>
    </figure>
  );
}
