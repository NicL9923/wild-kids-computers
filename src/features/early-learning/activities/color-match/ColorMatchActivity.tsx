import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { colors as colorNames } from '../../../../core/strings/shared/index.ts';
import { useSortRound } from '../../sorting/useSortRound.ts';
import './colorMatch.css';
import { BoxArt, PatternDefs, PatternIcon, ToyArt } from './ColorArt.tsx';
import { MATCH_COLORS, type ColorMatchLevel, type MatchColor, type ToyId } from './level.ts';
import type { ColorMatchState } from './state.ts';
import { strings } from './strings.ts';

type BoxId = `box-${MatchColor}`;
const boxId = (color: MatchColor): BoxId => `box-${color}`;

/**
 * Toys on top and one box per color below. Every toy and box says its color when the pointer
 * rests on it or it gets focus. The child carries a toy to the box of its color: it stays there
 * and the color is said again. In another box it goes back home with a neutral nudge. A switch
 * in the corner adds a pattern to each color, for a child who sees some colors alike.
 */
export default function ColorMatchActivity({ level, kit }: ActivityProps<ColorMatchLevel, ColorMatchState>) {
  const patterns = kit.state.value.patterns;
  const colorOf = (id: ToyId): MatchColor => {
    const toy = level.toys.find((each) => each.id === id);
    if (toy === undefined) throw new Error(`Color match has no ${id}.`);
    return toy.color;
  };
  const round = useSortRound<ToyId, BoxId>(kit, {
    required: level.toys.map((toy) => toy.id),
    targets: level.boxes.map(boxId),
    fits: (toy, box) => box === boxId(colorOf(toy)),
    holds: 'many',
    onPlaced: (toy) => [colorNames[colorOf(toy)]],
    onDone: (toy) => [colorNames[colorOf(toy)]],
    onMiss: (toy) => [colorNames[colorOf(toy)]],
  });
  const { carry, placed, hint, attachTray } = round;

  return (
    <div className='cm-stage' data-patterns={patterns}>
      <PatternDefs colors={MATCH_COLORS} />
      <ul ref={attachTray} className='cm-toys' aria-label={t(strings.toys)}>
        {level.toys.map((toy) =>
          placed.has(toy.id) ? (
            <li key={toy.id} className='cm-toy-home' data-home={toy.id} />
          ) : (
            <li key={toy.id}>
              <button
                type='button'
                className='cm-toy'
                data-toy={toy.id}
                data-color={toy.color}
                data-hint={hint?.item === toy.id}
                aria-label={t(colorNames[toy.color])}
                onPointerEnter={() => void kit.speak(colorNames[toy.color])}
                onFocus={() => void kit.speak(colorNames[toy.color])}
                {...carry.item(toy.id)}
              >
                <ToyArt kind={toy.kind} color={toy.color} patterns={patterns} />
              </button>
            </li>
          ),
        )}
      </ul>
      <ul className='cm-boxes' aria-label={t(strings.boxes)}>
        {level.boxes.map((color) => {
          const inside = level.toys.filter((toy) => placed.get(toy.id) === boxId(color));
          return (
            <li
              key={color}
              className='cm-box'
              data-box={color}
              data-hint={hint?.target === boxId(color)}
              aria-label={t(colorNames[color])}
              onPointerEnter={() => void kit.speak(colorNames[color])}
              {...carry.target(boxId(color))}
            >
              <span className='cm-box-inside' data-count={inside.length}>
                {inside.map((toy) => (
                  <span key={toy.id} className='cm-box-toy' data-in-box={toy.id}>
                    <ToyArt kind={toy.kind} color={toy.color} patterns={patterns} />
                  </span>
                ))}
              </span>
              <BoxArt color={color} patterns={patterns} />
            </li>
          );
        })}
      </ul>
      <button
        type='button'
        className='cm-pattern-switch'
        data-control='patterns'
        aria-pressed={patterns}
        aria-label={t(strings.patterns)}
        onClick={() => kit.state.update((current) => ({ ...current, patterns: !current.patterns }))}
      >
        <PatternIcon />
      </button>
    </div>
  );
}
