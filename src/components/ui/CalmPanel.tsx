import type { ReactNode } from 'react';
import closingPicture from '../../../assets/art/pictures/closing.svg';
import finishPicture from '../../../assets/art/pictures/finish.svg';

const PICTURES = { finish: finishPicture, closing: closingPicture } as const;

export interface CalmPanelProps {
  /** `finish` after a set of rounds; `closing` when the session time is up. */
  picture: keyof typeof PICTURES;
  /** A short line under the picture. The caller also speaks it. */
  heading?: string;
  /** Up to two equal choices, such as play again and go back. Leave out for the closing screen. */
  actions?: ReactNode;
}

/**
 * A quiet full-screen panel. It shows no score, count, or clock. With two actions, give them the
 * same variant so neither looks like the one the child should pick.
 */
export function CalmPanel({ picture, heading, actions }: CalmPanelProps) {
  return (
    <main className='wk-calm-panel'>
      <div className='wk-calm-panel-body'>
        <img className='wk-calm-panel-picture' src={PICTURES[picture]} alt='' draggable={false} />
        {heading !== undefined && <h1 className='wk-calm-panel-heading'>{heading}</h1>}
        {actions !== undefined && <div className='wk-calm-panel-actions'>{actions}</div>}
      </div>
    </main>
  );
}
