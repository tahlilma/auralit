// The Auralit mark: an "A" inside an open ring (the aura) with a lit point where the ring opens.
export function Mark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M19.6 8.2A8.9 8.9 0 1 1 15.6 3.9" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="19.3" cy="4.9" r="2.1" fill="var(--accent)" />
      <path d="M8.4 16.2 12 7.9l3.6 8.3M9.7 13.3h4.6" stroke="var(--ink)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Auralit</span>
    </span>
  );
}
