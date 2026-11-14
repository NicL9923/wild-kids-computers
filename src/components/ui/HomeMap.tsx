import meadow from '../../../assets/art/home/meadow.svg';
import { HOME_PLACE_IDS, HOME_PLACES, type HomePlaceId } from './homePlaces.ts';

export interface HomeMapPlace {
  /** The area's name, from the string catalog. Older bands see it; screen readers always read it. */
  label: string;
  onSelect: () => void;
}

export interface HomeMapProps {
  places: Record<HomePlaceId, HomeMapPlace>;
  /** Names the map for screen readers, such as "The meadow". */
  label: string;
}

/**
 * The home screen picture: one meadow with a button for each area. The picture fills any window
 * shape, and the places sit in its 16:10 layout area, so no place is ever cut off. Each place is
 * a real button, reached with Tab and pressed with Enter or Space.
 */
export function HomeMap({ places, label }: HomeMapProps) {
  return (
    <nav className='wk-home-map' aria-label={label}>
      <img className='wk-home-map-art' src={meadow} alt='' draggable={false} />
      <div className='wk-home-map-layout'>
        {HOME_PLACE_IDS.map((id) => {
          const { picture, left, top } = HOME_PLACES[id];
          return (
            <button
              key={id}
              type='button'
              className='wk-home-place'
              data-place={id}
              style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
              onClick={places[id].onSelect}
            >
              <img className='wk-home-place-picture' src={picture} alt='' draggable={false} />
              <span className='wk-home-place-label wk-reading-text'>{places[id].label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
