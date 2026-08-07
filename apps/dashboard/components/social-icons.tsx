/** Small hand-drawn icons for the two real community channels (footer).
 * No icon library is a dependency anywhere in this app (checked
 * package.json) -- these follow the exact stroke-icon style already used
 * for the detector icons in detector-grid.tsx rather than pulling one in
 * for two glyphs. */

export function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9 22 2Z" />
    </svg>
  );
}

export function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6.5 7c1.5-1.5 3.3-2 5.5-2s4 .5 5.5 2c1.3 1.5 2 4 2 7.5-1.5 1-3 1.7-4.5 2l-.8-1.3c.8-.3 1.5-.6 2.1-1a10 10 0 0 1-9.6 0c.6.4 1.3.7 2.1 1L8 16.5c-1.5-.3-3-1-4.5-2 0-3.5.7-6 2-7.5Z" />
      <path d="M8.5 12h.01M15.5 12h.01" strokeWidth="2.5" />
    </svg>
  );
}
