"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/", label: "Workspace" },
  { href: "/signed", label: "Signed drafts" },
  { href: "/how-it-works", label: "How it works" },
];

/** The two models, named once with their jobs. Everywhere else they are "the judge" and "the writer". */
const MODELS = [
  {
    role: "Judge",
    name: "Jev",
    maker: "Typesafe AI",
    job: "Reads the record, picks the quotes and checks every sentence. It can only choose among answers; it cannot write, so it cannot make anything up.",
  },
  {
    role: "Writer",
    name: "Gemini 3.8 Flash",
    maker: "Google",
    job: "Writes only the sentences that apply the law to the facts. Every one of them comes to you.",
  },
];

/** The suit: midnight navy with a chalk pinstripe, and the tie as the one accent. */
export function AppHeader() {
  const pathname = usePathname();
  return (
    <header className="pinstripe flex h-12 print:hidden shrink-0 items-center gap-3 px-3 text-suit-foreground sm:gap-6 sm:px-4">
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
              "whitespace-nowrap rounded-md px-2 py-1 text-suit-foreground/70 outline-none transition-colors hover:text-suit-foreground focus-visible:ring-2 focus-visible:ring-suit-foreground/60 sm:px-2.5",
              pathname === href && "bg-white/10 text-suit-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p className="ml-auto hidden items-center gap-3 text-xs text-suit-foreground/70 lg:flex">
        {MODELS.map((model) => (
          <Tooltip key={model.name}>
            <TooltipTrigger asChild>
              <span className="cursor-default whitespace-nowrap underline decoration-suit-foreground/30 decoration-dotted underline-offset-4">
                {model.role}: <span className="text-suit-foreground">{model.name}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72">
              <span className="block font-medium">
                {model.name}, by {model.maker}
              </span>
              {model.job}
            </TooltipContent>
          </Tooltip>
        ))}
      </p>
    </header>
  );
}
