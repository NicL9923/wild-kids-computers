import type { ReactNode } from 'react';

/** Text a screen reader reads that does not show on screen. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className='wk-visually-hidden'>{children}</span>;
}
