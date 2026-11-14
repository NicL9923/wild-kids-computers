import { useEffect, useRef } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as shellStrings } from '../../../../activityShell/strings.ts';
import type { DesktopState } from '../../model/state.ts';
import { fitForParts, withDefaults } from '../../desktop/parts.ts';
import { ToyDesktop } from '../../desktop/ToyDesktop.tsx';
import { useDesktop } from '../../desktop/useDesktop.ts';
import type { FreePlayLevel } from './level.ts';
import { forSaving, withPaintings } from './saving.ts';

/** How long the desktop waits after the last change before it saves, so typing is one save. */
export const SAVE_PAUSE_MS = 600;

type Props = ActivityProps<FreePlayLevel, DesktopState>;

/**
 * Open play on the toy computer. The desktop is the child's own: it loads from the profile,
 * saves a moment after each change and when the child leaves, and shows their paintings in a
 * Paintings folder for the picture viewer.
 */
export default function ToyDesktopFreePlayActivity({ level, band, kit }: Props) {
  if (!kit.state.loaded) return <p className='wk-visually-hidden'>{t(shellStrings.loading)}</p>;
  return <FreePlay level={level} band={band} kit={kit} />;
}

function FreePlay({ level, band, kit }: Props) {
  const desktop = useDesktop(() => fitForParts(kit.state.value, withDefaults(level.parts)));
  const { listen, replace, current: currentState } = desktop;
  const latest = useRef<DesktopState | null>(null);
  const update = kit.state.update;

  // Save a moment after the last change, and right away when the child leaves.
  useEffect(() => {
    let cancel: (() => void) | null = null;
    const save = () => {
      const state = latest.current;
      latest.current = null;
      if (state !== null) update(() => forSaving(state));
    };
    const stop = listen((transition) => {
      latest.current = transition.state;
      cancel?.();
      cancel = kit.scope.setTimeout(save, SAVE_PAUSE_MS);
    });
    return () => {
      stop();
      cancel?.();
      save();
    };
  }, [listen, kit.scope, update]);

  // The child's paintings join the desktop once they are listed.
  const pictures = kit.pictures;
  useEffect(() => {
    let current = true;
    const add = async () => {
      const listed = await pictures.list('gallery');
      if (!current || !listed.ok) return;
      const ids = listed.value.map((picture) => picture.id);
      const before = currentState();
      const next = withPaintings(before, ids);
      if (next !== before) {
        replace(next);
        update(() => forSaving(next));
      }
    };
    void add();
    return () => {
      current = false;
    };
  }, [pictures, currentState, replace, update]);

  return <ToyDesktop desktop={desktop} kit={kit} band={band} parts={level.parts} />;
}
