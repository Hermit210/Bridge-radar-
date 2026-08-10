"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/bridges", label: "Bridges" },
  { href: "/bridges/compare", label: "Compare" },
  { href: "/events", label: "Events" },
  { href: "/network", label: "Network" },
  { href: "/my-activity", label: "My Activity" },
  { href: "/developers", label: "Developers" },
  { href: "/about", label: "About" },
] as const;

/** "/bridges" should read active for its own sub-routes (e.g. a bridge
 * detail page at "/bridges/wormhole") but not for "/bridges/compare",
 * which has its own distinct nav link. Every other link is an exact match. */
function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/bridges") {
    return pathname.startsWith("/bridges/") && !pathname.startsWith("/bridges/compare");
  }
  return false;
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? "font-bold text-white"
                : "text-text-secondary transition-colors duration-150 hover:text-text"
            }
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
