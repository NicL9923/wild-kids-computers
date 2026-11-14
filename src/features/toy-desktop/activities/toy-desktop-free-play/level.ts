import type { Band } from '../../../../core/bands.ts';
import type { DesktopParts } from '../../desktop/parts.ts';
import type { AppKind } from '../../model/state.ts';

/** The five toy apps, in the order the launcher lists them. */
const TOY_APPS: readonly AppKind[] = ['notepad', 'picture-viewer', 'file-explorer', 'music-box', 'calculator'];

/** What free play shows for a band. The desktop itself is the child's own, saved per profile. */
export interface FreePlayLevel {
  readonly parts: DesktopParts;
}

/**
 * The youngest children get three big icons, windows that open filling the screen, and only a
 * close button: nothing to read, nothing to lose. Older children get the whole computer.
 */
export function generateLevel(_seed: number, band: Band): FreePlayLevel {
  if (band === 'band-3-5') {
    return {
      parts: {
        icons: [{ app: 'picture-viewer', file: 'Pictures/Sunflower' }, { app: 'music-box' }, { app: 'notepad' }],
        menuBar: false,
        taskStrip: false,
        launcher: [],
        windowControls: ['close'],
        move: false,
        resize: false,
        openMaximized: true,
        systemSound: false,
      },
    };
  }
  return {
    parts: {
      icons: [...TOY_APPS.map((app) => ({ app })), { trash: true }],
      launcher: TOY_APPS,
    },
  };
}
