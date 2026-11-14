import { placeholderText } from './placeholderText.ts';

export default function PlaceholderHome() {
  return (
    <main className='grid min-h-dvh place-items-center'>
      <h1 className='text-4xl font-bold'>{placeholderText.title}</h1>
    </main>
  );
}
