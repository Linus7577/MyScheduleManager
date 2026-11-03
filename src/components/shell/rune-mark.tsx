export function RuneMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-crimson-500)" strokeWidth="2" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="var(--color-ember-500)" strokeWidth="1" strokeDasharray="3 5" />
      <path
        d="M32 18v28M25 25l14 14M39 25L25 39"
        fill="none"
        stroke="var(--color-crimson-400)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
