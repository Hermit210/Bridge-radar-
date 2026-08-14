"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { WalletConnectButton } from "./wallet-connect-button";
import { NavLinks } from "./nav-links";

/** Below `lg` the header's full nav row + wallet button don't fit — this
 * renders the hamburger toggle + collapsible panel that replaces them.
 * Panel content mirrors the desktop nav exactly, just stacked vertically. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // A Link click already closes the panel via NavLinks' onNavigate, but this
  // covers back/forward navigation and any other route change too.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-0/60 text-text transition-colors hover:bg-surface-0"
      >
        {open ? (
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </svg>
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        )}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-x-3 top-[4.75rem] z-40 rounded-3xl border border-border-subtle bg-surface-0 p-5 shadow-card sm:inset-x-4">
            <nav className="flex flex-col gap-1 text-[15px] font-medium">
              <NavLinks onNavigate={() => setOpen(false)} className="rounded-xl px-3 py-3" />
            </nav>
            <div className="mt-4 border-t border-border-subtle pt-4">
              <WalletConnectButton />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
