import { createContext, useContext } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import type { Band } from '../../../core/bands.ts';
import type { OsFamily } from '../../../core/platform/bridge.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import type { DesktopAction, Transition } from '../model/desktop.ts';
import type { DesktopParts, HighlightTarget } from './parts.ts';
import type { DesktopHandle } from './useDesktop.ts';

/** The parts of the kit the desktop uses. Any activity's kit fits. */
export type DesktopKit = Pick<ActivityKit<unknown>, 'scope' | 'play' | 'speak' | 'pictures'>;

export interface DesktopContextValue {
  readonly desktop: DesktopHandle;
  readonly kit: DesktopKit;
  readonly band: Band;
  readonly os: OsFamily;
  readonly parts: Required<DesktopParts>;
  /** CSS pixels per desktop unit. */
  readonly scale: number;
  readonly highlight: HighlightTarget | null;
  /** The gentle sentence about the last refused action, and the window it happened in. */
  readonly notice: Notice | null;
  /** Moves keyboard focus into a window, to its text or its main control. */
  readonly focusContent: (windowId: string) => void;
  /**
   * Opens an app or a file from a desktop icon or the launcher, maximized when the parts say so,
   * and moves keyboard focus into the new window.
   */
  readonly open: (action: OpenAction) => Transition;
  /** Props that say a control's name when the pointer rests on it or it gets focus. */
  readonly sayName: (handle: SpokenHandle) => { onPointerEnter?: () => void; onFocus?: () => void };
}

export type OpenAction = Extract<DesktopAction, { type: 'open-app' | 'open-file' }>;

export interface Notice {
  readonly windowId: string | null;
  readonly handle: SpokenHandle;
}

export const DesktopContext = createContext<DesktopContextValue | null>(null);

export function useDesktopContext(): DesktopContextValue {
  const value = useContext(DesktopContext);
  if (value === null) throw new Error('A toy desktop part must render inside <ToyDesktop>.');
  return value;
}
