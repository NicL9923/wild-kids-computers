import { Emoji } from '../../../components/ui/Emoji.tsx';
import type { AppKind } from '../model/state.ts';
import { APP_PICTURES } from './labels.ts';

/**
 * An app's picture. Every app uses a Fluent Emoji except the calculator, which has none, so it
 * gets a small original drawing. The picture is decorative: the control around it has the name.
 */
export function AppPicture({ app, className }: { readonly app: AppKind; readonly className?: string }) {
  const picture = APP_PICTURES[app];
  if (picture !== 'calculator') return <Emoji id={picture} decorative className={className} />;
  return (
    <svg className={['td-calculator-art', className].filter(Boolean).join(' ')} viewBox='0 0 32 32' aria-hidden='true'>
      <rect className='td-calculator-art-body' x='5' y='2' width='22' height='28' rx='4' />
      <rect className='td-calculator-art-screen' x='8.5' y='5.5' width='15' height='6' rx='1.5' />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((column) => (
          <rect
            key={`${String(row)}-${String(column)}`}
            className={column === 2 ? 'td-calculator-art-key td-calculator-art-key-accent' : 'td-calculator-art-key'}
            x={8.5 + column * 5.5}
            y={14 + row * 5}
            width='4'
            height='3.5'
            rx='1'
          />
        )),
      )}
    </svg>
  );
}
