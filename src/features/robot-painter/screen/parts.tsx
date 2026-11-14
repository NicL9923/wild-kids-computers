import type { ComponentProps, ReactNode } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import { InterfaceIcon } from '../../../components/ui/InterfaceIcon.tsx';
import { t, type SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { ArrowPicture, BlockPicture, ColorPicture } from '../blocks/BlockPicture.tsx';
import { blockSpeech } from '../blocks/speech.ts';
import type { Block, BlockDraft, MoveDirection, PenColor } from '../engine/program.ts';
import { strings } from '../strings.ts';

/** The controls the robot painter screens share: the arrow pad, the plan strip, and labelled buttons. */

type SpeechKit = Pick<ActivityKit<unknown>, 'speakSequence'>;

/** A button that shows a picture, says its name on hover and focus, and shows the word from band-6-8 up. */
export function ControlButton({
  kit,
  speech,
  picture,
  showLabel = true,
  className,
  ...props
}: {
  kit: SpeechKit;
  speech: readonly SpokenHandle[];
  picture: ReactNode;
  showLabel?: boolean;
} & Omit<ComponentProps<'button'>, 'type' | 'aria-label' | 'children'>) {
  const say = () => void kit.speakSequence(speech);
  const label = speech.map((handle) => t(handle)).join(' ');
  return (
    <button
      type='button'
      className={['wk-button', 'rp-control', className].filter(Boolean).join(' ')}
      aria-label={label}
      onPointerEnter={say}
      onFocus={say}
      {...props}
    >
      {picture}
      {showLabel && (
        <span className='wk-reading-text rp-control-label' aria-hidden='true'>
          {label}
        </span>
      )}
    </button>
  );
}

const PAD_PLACES: Readonly<Record<MoveDirection, string>> = {
  up: 'rp-pad-up',
  left: 'rp-pad-left',
  right: 'rp-pad-right',
  down: 'rp-pad-down',
};

/**
 * Four big arrows in a cross, with an optional control in the middle such as go. An arrow the
 * puzzle does not offer leaves its place empty, so the others never move.
 */
export function ArrowPad({
  kit,
  directions,
  onArrow,
  center,
  disabled,
}: {
  kit: SpeechKit;
  directions: readonly MoveDirection[];
  onArrow: (direction: MoveDirection) => void;
  center?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className='rp-pad' role='group' aria-label={t(strings.arrows)}>
      {directions.map((direction) => (
        <ControlButton
          key={direction}
          kit={kit}
          speech={[strings[direction]]}
          showLabel={false}
          picture={<ArrowPicture direction={direction} />}
          className={`rp-pad-arrow ${PAD_PLACES[direction]}`}
          data-arrow={direction}
          disabled={disabled}
          onClick={() => onArrow(direction)}
        />
      ))}
      {center !== undefined && <div className='rp-pad-center'>{center}</div>}
    </div>
  );
}

/** Pen color swatches, each with its own shape. */
export function ColorChoices({
  kit,
  colors,
  current,
  onColor,
  disabled,
}: {
  kit: SpeechKit;
  colors: readonly PenColor[];
  current: PenColor;
  onColor: (color: PenColor) => void;
  disabled?: boolean;
}) {
  return (
    <div className='rp-colors' role='group' aria-label={t(strings.pens)}>
      {colors.map((color) => {
        const draft: BlockDraft = { kind: 'color', color };
        return (
          <ControlButton
            key={color}
            kit={kit}
            speech={blockSpeech(draft)}
            showLabel={false}
            picture={<ColorPicture color={color} />}
            className='rp-color'
            data-color={color}
            aria-pressed={current === color}
            disabled={disabled}
            onClick={() => onColor(color)}
          />
        );
      })}
    </div>
  );
}

/**
 * The youngest children's plan: a row of places, one per block the puzzle allows. A placed arrow
 * comes out again when the child presses it.
 */
export function PlanStrip({
  kit,
  blocks,
  places,
  activeId,
  onRemove,
  disabled,
}: {
  kit: SpeechKit;
  blocks: readonly Block[];
  places: number;
  activeId: string | null;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <ol className='rp-plan' aria-label={t(strings.program)} data-list='main'>
      {Array.from({ length: Math.max(places, blocks.length) }, (_, index) => {
        const block = blocks[index];
        return (
          <li key={block?.id ?? `empty-${String(index)}`} className='rp-plan-place'>
            {block === undefined ? (
              <span className='rp-plan-empty' />
            ) : (
              <ControlButton
                kit={kit}
                speech={[...blockSpeech(block), strings.takeOut]}
                showLabel={false}
                picture={<BlockPicture block={block} />}
                className='rp-plan-block'
                data-block-id={block.id}
                data-running={activeId === block.id}
                disabled={disabled}
                onClick={() => onRemove(block.id)}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className='rp-picture' viewBox='0 0 48 48' aria-hidden='true' focusable='false'>
      {children}
    </svg>
  );
}

export function GoPicture() {
  return (
    <Svg>
      <path d='M14 8v32l28-16z' fill='currentColor' stroke='currentColor' strokeWidth='3' strokeLinejoin='round' />
    </Svg>
  );
}

export function StepPicture() {
  return (
    <Svg>
      <path d='M8 10v28l20-14z' fill='currentColor' />
      <rect x='32' y='10' width='7' height='28' rx='2' fill='currentColor' />
    </Svg>
  );
}

/** The robot's way home: a curved arrow back to a dot. */
export function ToStartPicture() {
  return (
    <Svg>
      <circle cx='12' cy='36' r='6' fill='currentColor' />
      <path
        d='M40 36V22a10 10 0 0 0-10-10H18'
        fill='none'
        stroke='currentColor'
        strokeWidth='5'
        strokeLinecap='round'
      />
      <path d='M20 3 9 12l11 9z' fill='currentColor' />
    </Svg>
  );
}

/** A clean sheet with a sweep across it. */
export function StartOverPicture() {
  return (
    <Svg>
      <rect x='8' y='6' width='28' height='36' rx='4' fill='none' stroke='currentColor' strokeWidth='4' />
      <path d='M30 44 44 30M36 44l8-8' stroke='currentColor' strokeWidth='4' strokeLinecap='round' />
    </Svg>
  );
}

export function NextPicture() {
  return (
    <Svg>
      <path d='M6 24h28' stroke='currentColor' strokeWidth='6' strokeLinecap='round' />
      <path d='M28 10l16 14-16 14z' fill='currentColor' />
    </Svg>
  );
}

export function UndoPicture() {
  return <InterfaceIcon name='undo' />;
}

export function StayPicture() {
  return <InterfaceIcon name='play-again' />;
}
