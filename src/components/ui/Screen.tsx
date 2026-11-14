import type { ReactNode } from 'react';

export interface ScreenProps {
  /** The way out, top left. On an activity this is the exit control. */
  exit?: ReactNode;
  /** The spoken instruction and its replay control, top center. */
  instruction?: ReactNode;
  /** The mute control, and on the home map the parent corner, top right. */
  end?: ReactNode;
  children: ReactNode;
}

/**
 * The frame every screen shares. The three top slots always take their place, even when empty, so
 * the exit, replay, and mute controls never move from one screen to the next.
 */
export function Screen({ exit, instruction, end, children }: ScreenProps) {
  return (
    <div className='wk-screen'>
      <header className='wk-screen-bar'>
        <div className='wk-screen-slot' data-slot='exit'>
          {exit}
        </div>
        <div className='wk-screen-slot' data-slot='instruction'>
          {instruction}
        </div>
        <div className='wk-screen-slot' data-slot='end'>
          {end}
        </div>
      </header>
      <main className='wk-screen-main'>{children}</main>
    </div>
  );
}
