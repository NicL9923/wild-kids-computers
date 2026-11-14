import type { CSSProperties as ReactCssProperties } from 'react';

declare module 'react' {
  /** Lets a style prop set a design token, such as { '--wk-avatar-size': 'var(--wk-target-min)' }. */
  interface CSSProperties {
    // Any CSS value: the type of `width` is a string or a number, like every length.
    [token: `--wk-${string}`]: ReactCssProperties['width'];
  }
}
