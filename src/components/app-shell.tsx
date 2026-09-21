"use client";

import { BookOpenText, Gauge, Moon, Scale, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";

const PAGES = [
  { href: "/", label: "Workspace", icon: Scale },
  { href: "/quality", label: "Quality", icon: Gauge },
  { href: "/how-it-works", label: "How it works", icon: BookOpenText },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <SidebarProvider defaultOpen={false} className="h-svh">
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="Of Record">
                <Link href="/">
                  <span className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary font-serif text-lg font-semibold text-sidebar-primary-foreground">
                    §
                  </span>
                  <span className="font-serif text-lg">Of Record</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {PAGES.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Switch theme"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                <Sun className="dark:hidden" />
                <Moon className="hidden dark:block" />
                <span>Switch theme</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}
