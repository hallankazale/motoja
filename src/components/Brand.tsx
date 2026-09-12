import { useId } from 'react';

/** A vector mark stays crisp on every screen without shipping a large bitmap. */
export function Brand({ className = '' }: { className?: string }) {
  const gradientId = useId();
  return (
    <span className={`brand-lockup ${className}`} aria-label="MotoJá">
      <svg className="brand-helmet" viewBox="0 0 88 72" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="14" y1="8" x2="76" y2="68" gradientUnits="userSpaceOnUse">
            <stop stopColor="#128BFF" />
            <stop offset=".48" stopColor="#0CAED0" />
            <stop offset="1" stopColor="#08D79C" />
          </linearGradient>
        </defs>
        <path d="M42 5C24 5 15 17 13 32l-2 15c-2 13 9 21 25 21h20c19 0 28-12 28-30C84 17 67 5 50 5h-8Z" fill={`url(#${gradientId})`} />
        <path d="M38 26c6-7 18-8 26-3 7 5 12 12 12 22 0 4-3 7-7 7H38l-7-4" stroke="#031225" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 23h20M1 47h21" stroke="#1489FF" strokeWidth="3" strokeLinecap="round" />
        <path d="M8 35h21" stroke="#08D79C" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="brand-word" aria-hidden="true">Moto<span>Já</span></span>
    </span>
  );
}
