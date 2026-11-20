import computerSkills from '../../../assets/art/home/computer-skills.svg';
import earlyLearning from '../../../assets/art/home/early-learning.svg';
import paintStudio from '../../../assets/art/home/paint-studio.svg';
import robotPainter from '../../../assets/art/home/robot-painter.svg';
import toyDesktop from '../../../assets/art/home/toy-desktop.svg';

/**
 * The five places on the home map, one per area. `left` and `top` place each picture in the
 * 1600 by 1000 layout area of assets/art/home/meadow.svg, as fractions, so the footpath in the
 * meadow meets each place. Every place is 340 units wide, which is at least twice the youngest
 * band's smallest target at a 1024 by 640 window.
 *
 * HOME_PLACE_IDS is the tab order: the top row left to right, then the bottom row, so focus reads
 * across the picture.
 */
export const HOME_PLACE_IDS = [
  'paint-studio',
  'early-learning',
  'toy-desktop',
  'computer-skills',
  'robot-painter',
] as const;

export type HomePlaceId = (typeof HOME_PLACE_IDS)[number];

interface HomePlace {
  picture: string;
  left: number;
  top: number;
}

export const HOME_PLACES: Record<HomePlaceId, HomePlace> = {
  'paint-studio': { picture: paintStudio, left: 0.081_25, top: 0.2 },
  'early-learning': { picture: earlyLearning, left: 0.393_75, top: 0.3 },
  'toy-desktop': { picture: toyDesktop, left: 0.706_25, top: 0.2 },
  'computer-skills': { picture: computerSkills, left: 0.1875, top: 0.55 },
  'robot-painter': { picture: robotPainter, left: 0.6, top: 0.55 },
};

/** The picture of an area, for an area screen or a tile. */
export function areaPicture(id: HomePlaceId): string {
  return HOME_PLACES[id].picture;
}
