"use client";

import { Activity, LayoutDashboard, Puzzle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { pluginNavEntries } from "@/lib/plugins";

const baseNav = [
  { key: "overview", label: "Overview", href: "/", icon: LayoutDashboard },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageTitle(pathname: string): string {
  const enabled = pluginNavEntries.filter((entry) => entry.enabled);
  const match = [...baseNav, ...enabled].find((entry) =>
    isActive(entry.href, pathname),
  );
  return match?.label ?? "Dashboard";
}

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const enabledPlugins = pluginNavEntries.filter((entry) => entry.enabled);
  const groups = [...new Set(enabledPlugins.map((entry) => entry.group))];

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Activity className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    __PROJECT_NAME__
                  </span>
                  <span className="truncate text-xs">__PROJECT_SLUG__</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Home</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {baseNav.map((entry) => (
                <SidebarMenuItem key={entry.key}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(entry.href, pathname)}
                    tooltip={entry.label}
                  >
                    <Link
                      href={entry.href}
                      onClick={() => setOpenMobile(false)}
                    >
                      <entry.icon />
                      <span>{entry.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {groups.map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {enabledPlugins
                  .filter((entry) => entry.group === group)
                  .map((entry) => (
                    <SidebarMenuItem key={entry.key}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(entry.href, pathname)}
                        tooltip={entry.label}
                      >
                        <Link
                          href={entry.href}
                          onClick={() => setOpenMobile(false)}
                        >
                          <Puzzle />
                          <span>{entry.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          Running on Graphed
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
