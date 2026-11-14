import { useLayoutEffect, useRef, type ReactNode } from 'react';

export interface KeyPlayAreaProps {
  /** What a screen reader calls the area, such as "The path". */
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Where a keyboard activity's keys go. A focused shell button keeps Space and Enter for itself,
 * so an activity that needs them puts its play in this area: it takes focus when the round
 * starts, shows the focus ring, and sits in the tab order, so a child who pressed replay or mute
 * can Tab back and play on. A screen reader passes keys straight through to it.
 */
export function KeyPlayArea({ label, className, children }: KeyPlayAreaProps) {
  const area = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => area.current?.focus({ preventScroll: true }), []);
  return (
    <div
      ref={area}
      className={className}
      role='application'
      aria-label={label}
      // The area is where keys go, so it is in the tab order like the typing course's line.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      data-key-area
    >
      {children}
    </div>
  );
}
