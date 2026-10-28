export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <rect x="7" y="9" width="18" height="13" rx="1.5" fill="none" stroke="white" strokeWidth="1.8" />
      <path d="M11 14h10M11 17.5h6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="22" cy="22" r="4" fill="#93c5fd" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}
