"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/", label: "Workspace" },
  { href: "/quality", label: "Quality" },
  { href: "/how-it-works", label: "How it works" },
];

/** The suit: midnight navy with a chalk pinstripe, and the tie as the one accent. */
export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="pinstripe flex h-12 shrink-0 items-center gap-3 px-3 text-suit-foreground sm:gap-6 sm:px-4">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="h-5 w-1.5 rounded-[1px] bg-tie" aria-hidden />
        <span className="font-serif text-lg tracking-tight">{APP_NAME}</span>
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        {PAGES.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-2 py-1 text-suit-foreground/70 sm:px-2.5 outline-none transition-colors hover:text-suit-foreground focus-visible:ring-2 focus-visible:ring-suit-foreground/60",
              pathname === href && "bg-white/10 text-suit-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
