import { useEffect, useRef, useState } from 'react';
import { useCarry } from '../../../../activityShell/carry/useCarry.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import { emojiNames, feedback } from '../../../../core/strings/shared/index.ts';
import { belongs, BLANKET, PACKED_PAUSE_MS, SCENE, TRIES_BEFORE_HINT, type PicnicLevel } from './level.ts';
import { strings } from './strings.ts';
import './packThePicnic.css';

/** A left, top, and width in percent of the scene, for an element centered on a scene point. */
function placeAt(x: number, y: number, size: number) {
  return {
    left: `${String((x / SCENE.width) * 100)}%`,
    top: `${String((y / SCENE.height) * 100)}%`,
    width: `${String((size / SCENE.width) * 100)}cqw`,
  };
}

/**
 * The same box placed by its top left corner. A carried piece gets its own translate from
 * useCarry, so pieces cannot center themselves with one.
 */
function cornerAt(x: number, y: number, size: number) {
  return placeAt(x - size / 2, y - size / 2, size);
}

/** A red and cream checked picnic blanket. Original art. */
function Blanket() {
  return (
    <svg
      className='picnic-blanket'
      viewBox={`0 0 ${String(BLANKET.right - BLANKET.left)} ${String(BLANKET.bottom - BLANKET.top)}`}
      preserveAspectRatio='none'
      aria-hidden='true'
      style={{
        left: `${String((BLANKET.left / SCENE.width) * 100)}%`,
        top: `${String((BLANKET.top / SCENE.height) * 100)}%`,
        width: `${String(((BLANKET.right - BLANKET.left) / SCENE.width) * 100)}%`,
        height: `${String(((BLANKET.bottom - BLANKET.top) / SCENE.height) * 100)}%`,
      }}
    >
      <defs>
        <pattern id='picnic-check' width='60' height='60' patternUnits='userSpaceOnUse'>
          <rect width='60' height='60' fill='#f7eedc' />
          <rect width='30' height='30' fill='#e9a7a0' />
          <rect x='30' y='30' width='30' height='30' fill='#e9a7a0' />
        </pattern>
      </defs>
      <rect width='100%' height='100%' rx='24' fill='url(#picnic-check)' stroke='#b0574e' strokeWidth='6' />
    </svg>
  );
}

/**
 * Food on the grass and a basket, or a blanket with a shadow for each piece. The child carries
 * each piece across with a drag, or a click to pick it up and a click to put it down, or the
 * keyboard. A piece put in the wrong place goes back to the grass with a calm word; after two
 * tries its own place lights up.
 */
export default function PackThePicnicActivity({ level, kit }: ActivityProps<PicnicLevel>) {
  const [packed, setPacked] = useState<ReadonlyMap<string, string>>(new Map());
  const [lit, setLit] = useState<string | null>(null);
  const tries = useRef(new Map<string, number>());
  const placeElements = useRef(new Map<string, HTMLElement>());
  const spoke = useRef(false);

  // The shell says the basket instruction as the round starts; the blanket needs its own.
  useEffect(() => {
    if (level.mode !== 'spots' || spoke.current) return;
    spoke.current = true;
    kit.setInstruction(strings.spots);
  }, [kit, level.mode]);

  const carry = useCarry<string, string>(kit, {
    kind: 'targets',
    onDrop(pieceId, placeId) {
      const place = level.places.find((each) => each.id === placeId);
      const element = placeElements.current.get(placeId);
      if (place === undefined) return;
      if (belongs(place, pieceId)) {
        const next = new Map(packed).set(pieceId, placeId);
        setPacked(next);
        if (lit === placeId) setLit(null);
        kit.feedback.correct({ at: element, silent: true });
        if (next.size === level.pieces.length) kit.scope.setTimeout(() => kit.roundComplete(), PACKED_PAUSE_MS);
        return;
      }
      kit.feedback.wrong({ at: element, say: feedback.goesSomewhereElse });
      const count = (tries.current.get(pieceId) ?? 0) + 1;
      tries.current.set(pieceId, count);
      if (count === TRIES_BEFORE_HINT) {
        setLit(level.places.find((each) => belongs(each, pieceId))?.id ?? null);
        kit.hint(feedback.hereItIs);
      }
    },
  });

  const inBasket = level.pieces.filter((piece) => packed.get(piece.id) === 'basket');
  return (
    <div className='picnic-stage'>
      <div className='picnic-scene' data-mode={level.mode} data-packed={packed.size}>
        {level.mode === 'spots' && <Blanket />}
        {level.places.map((place) => {
          const target = carry.target(place.id);
          const owner = level.pieces.find((piece) => piece.id === place.takes);
          const filled = level.pieces.find((piece) => packed.get(piece.id) === place.id && place.takes !== null);
          return (
            <div
              key={place.id}
              {...target}
              ref={(element) => {
                target.ref(element);
                if (element === null) placeElements.current.delete(place.id);
                else placeElements.current.set(place.id, element);
              }}
              className='picnic-place'
              data-place={place.id}
              data-kind={place.takes === null ? 'basket' : 'spot'}
              data-hint={lit === place.id}
              style={placeAt(place.x, place.y, place.size)}
            >
              {place.takes === null && <Emoji id='basket' decorative className='picnic-picture' />}
              {place.takes === null && inBasket.length > 0 && (
                <span className='picnic-basket-load'>
                  {inBasket.map((piece) => (
                    <Emoji key={piece.id} id={piece.food} decorative className='picnic-load' />
                  ))}
                </span>
              )}
              {owner !== undefined && filled === undefined && (
                <Emoji id={owner.food} decorative className='picnic-picture picnic-shadow' />
              )}
              {filled !== undefined && <Emoji id={filled.food} decorative className='picnic-picture' />}
            </div>
          );
        })}
        {level.pieces
          .filter((piece) => !packed.has(piece.id))
          .map((piece) => {
            const item = carry.item(piece.id);
            return (
              <button
                key={piece.id}
                type='button'
                {...item}
                className='picnic-piece'
                data-piece={piece.id}
                aria-label={t(emojiNames[piece.food])}
                style={{ ...item.style, ...cornerAt(piece.x, piece.y, level.size) }}
              >
                <Emoji id={piece.food} decorative className='picnic-picture' />
              </button>
            );
          })}
      </div>
    </div>
  );
}
