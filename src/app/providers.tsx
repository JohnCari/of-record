"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL as string);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexProvider client={convex}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      {/* Bottom centre: the corner is where the Accept and Strike buttons sit. */}
      <Toaster position="bottom-center" />
    </ConvexProvider>
  );
}
