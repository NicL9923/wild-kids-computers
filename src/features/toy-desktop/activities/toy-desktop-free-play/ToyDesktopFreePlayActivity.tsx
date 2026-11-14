import { useEffect, useRef } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { strings as shellStrings } from '../../../../activityShell/strings.ts';
import type { DesktopState } from '../../model/state.ts';
import { ToyDesktop } from '../../desktop/ToyDesktop.tsx';
import { useDesktop } from '../../desktop/useDesktop.ts';
import type { FreePlayLevel } from './level.ts';
import { forSaving, SAVE_PAUSE_MS, withPaintings } from './saving.ts';

type Props = ActivityProps<FreePlayLevel, DesktopState>;

/**
 * Open play on the toy computer. The desktop is the child's own: it loads from the profile,
 * saves a moment after each change and when the child leaves, and shows their paintings in a
 * Paintings folder for the picture viewer.
 *
 * When the parent's session length is used up, the closing screen comes at a calm moment: right
 * after a change is saved, unless the change was typing, and never while a save or open dialog
 * or a rename is open. A window being moved holds the check through useCarry. A child who stops
 * typing is covered by the shell's own check after a while with no input.
 */
export default function ToyDesktopFreePlayActivity({ level, band, kit }: Props) {
  if (!kit.state.loaded) return <p className='wk-visually-hidden'>{t(shellStrings.loading)}</p>;
  return <FreePlay level={level} band={band} kit={kit} />;
}

function FreePlay({ level, band, kit }: Props) {
  const desktop = useDesktop(() => kit.state.value);
  const { listen, replace, current: currentState } = desktop;
  const latest = useRef<DesktopState | null>(null);
  const update = kit.state.update;

  // Save a moment after the last change, and right away when the child leaves. A saved change
  // that was not typing is a calm moment for the session length.
  const checkpoint = kit.checkpoint;
  useEffect(() => {
    let cancel: (() => void) | null = null;
    let typing = false;
    const save = () => {
      const state = latest.current;
      latest.current = null;
      if (state !== null) update(() => forSaving(state));
    };
    const stop = listen((transition, action) => {
      latest.current = transition.state;
      typing = action.type === 'text';
      cancel?.();
      cancel = kit.scope.setTimeout(() => {
        save();
        if (!typing) checkpoint();
      }, SAVE_PAUSE_MS);
    });
    return () => {
      stop();
      cancel?.();
      save();
    };
  }, [listen, kit.scope, update, checkpoint]);

  // A save or open dialog, or a name being changed, holds the session check until it closes.
  const holdCheckpoint = kit.holdCheckpoint;
  const asking = desktop.state.windows.some(
    (window) =>
      ('dialog' in window.app && window.app.dialog !== null) ||
      (window.app.kind === 'file-explorer' && window.app.rename !== null),
  );
  useEffect(() => (asking ? holdCheckpoint() : undefined), [asking, holdCheckpoint]);

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
