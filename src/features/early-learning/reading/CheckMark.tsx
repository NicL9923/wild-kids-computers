/** A check in a solid circle, for something done. Decorative: the element around it says what. */
export function CheckMark({ className }: { className: string }) {
  return (
    <span className={className} aria-hidden='true'>
      <svg viewBox='0 0 24 24' focusable='false'>
        <path
          d='M5 12.5l4.5 4.5L19 7.5'
          fill='none'
          stroke='currentColor'
          strokeWidth='3.5'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    </span>
  );
}
