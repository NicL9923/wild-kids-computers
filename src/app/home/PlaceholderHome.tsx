import { t } from '../../core/strings/defineStrings.ts';
import { strings } from './strings.ts';

export default function PlaceholderHome() {
  return (
    <main className='grid min-h-dvh place-items-center'>
      <h1 className='text-4xl font-bold'>{t(strings.title)}</h1>
    </main>
  );
}
