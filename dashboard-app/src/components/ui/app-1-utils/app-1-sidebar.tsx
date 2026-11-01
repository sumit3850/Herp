"use client";

import { LogOut, Smartphone } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/app-1-utils/sidebar";
import { app1Nav, app1User, type NavId } from "@/components/ui/app-1-utils/app-1-data";

export interface App1SidebarProps {
  active?: NavId;
  onNavigate?: (id: NavId) => void;
  badges?: Partial<Record<NavId, number>>;
  user?: { name: string; email?: string; initials: string; avatar?: string; role?: string };
  appName?: string;
  onSignOut?: () => void;
  fieldAppHref?: string;
  /** limit the nav to these pages (e.g. for reviewers) */
  allowed?: NavId[];
}

/** Brand mark: a coiled snake in the forest-green tile. */
export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="116" fill="var(--primary)" />
      <path d="M156 362c0-62 46-92 100-106s100-44 100-106" fill="none" stroke="var(--primary-foreground)" strokeWidth="46" strokeLinecap="round" />
      <circle cx="356" cy="150" r="10" fill="var(--primary)" />
    </svg>
  );
}

export function App1Sidebar({ active = "overview", onNavigate, badges = {}, user = app1User, appName = "HerpWatch", onSignOut, fieldAppHref = "../app.html", allowed }: App1SidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">{appName}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/60">Admin dashboard</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="py-2">
        {app1Nav.map((g) => ({ ...g, items: g.items.filter((it) => !allowed || allowed.includes(it.id)) })).filter((g) => g.items.length).map((g) => (
          <SidebarGroup key={g.group}>
            <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
            <SidebarMenu>
              {g.items.map((it) => (
                <SidebarMenuItem key={it.id}>
                  <SidebarMenuButton isActive={active === it.id} onClick={() => onNavigate?.(it.id)} aria-current={active === it.id ? "page" : undefined}>
                    <it.icon aria-hidden />
                    <span>{it.label}</span>
                  </SidebarMenuButton>
                  {!!badges[it.id] && <SidebarMenuBadge aria-label={`${badges[it.id]} pending`}>{badges[it.id]}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <Button variant="outline" size="sm" asChild className="justify-start">
          <a href={fieldAppHref}><Smartphone /> Open field app</a>
        </Button>
        <div className="flex items-center gap-3 rounded-md px-1 py-1.5">
          <Avatar className="size-8">
            {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
            <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{user.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
          </div>
          {onSignOut && (
            <Button variant="ghost" size="icon" className="size-8" onClick={onSignOut} aria-label="Sign out">
              <LogOut />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default App1Sidebar;
