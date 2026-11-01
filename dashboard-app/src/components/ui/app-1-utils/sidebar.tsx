"use client";

/*
 * Compact, API-compatible take on the shadcn/ui Sidebar (the original App1 component
 * imports it from this path). Desktop: a sticky rail that collapses off-canvas.
 * Mobile (<768px): the same content slides in as a Sheet.
 */
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const MOBILE_BREAKPOINT = 768;
const SIDEBAR_WIDTH = "16rem";

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

type SidebarContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (v: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};
const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider.");
  return ctx;
}

export function SidebarProvider({ children, defaultOpen = true, className, style, ...props }: React.ComponentProps<"div"> & { defaultOpen?: boolean }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(() => {
    try { const v = localStorage.getItem("hw_sidebar_open"); return v == null ? defaultOpen : v === "1"; } catch { return defaultOpen; }
  });
  const [openMobile, setOpenMobile] = React.useState(false);
  const setOpenPersist = React.useCallback((v: boolean) => { setOpen(v); try { localStorage.setItem("hw_sidebar_open", v ? "1" : "0"); } catch { /* storage blocked */ } }, []);
  const toggleSidebar = React.useCallback(() => (isMobile ? setOpenMobile((o) => !o) : setOpenPersist(!open)), [isMobile, open, setOpenPersist]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "b" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleSidebar(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  return (
    <SidebarContext.Provider value={{ open, setOpen: setOpenPersist, openMobile, setOpenMobile, isMobile, toggleSidebar }}>
      <div
        data-state={open ? "expanded" : "collapsed"}
        style={{ "--sidebar-width": SIDEBAR_WIDTH, ...style } as React.CSSProperties}
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children, ...props }: React.ComponentProps<"aside">) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="left" className="w-[--sidebar-width] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden" style={{ "--sidebar-width": "17rem" } as React.CSSProperties}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Dashboard sections</SheetDescription>
          <div className="flex h-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <aside
      data-state={open ? "expanded" : "collapsed"}
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[margin] duration-200 ease-linear md:flex",
        "w-[var(--sidebar-width)]",
        !open && "-ml-[var(--sidebar-width)]",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("relative flex min-h-svh flex-1 flex-col bg-background", className)} {...props} />;
}

export function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button variant="ghost" size="icon" className={cn("size-8", className)} onClick={(e) => { onClick?.(e); toggleSidebar(); }} {...props}>
      <PanelLeft />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

export const SidebarHeader = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("flex flex-col gap-2 p-3", className)} {...props} />;
export const SidebarFooter = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("mt-auto flex flex-col gap-2 p-3", className)} {...props} />;
export const SidebarContent = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto", className)} {...props} />;
export const SidebarSeparator = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("mx-3 h-px bg-sidebar-border", className)} {...props} />;
export const SidebarGroup = ({ className, ...props }: React.ComponentProps<"div">) => <div className={cn("flex flex-col px-2 py-1", className)} {...props} />;
export const SidebarGroupLabel = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60", className)} {...props} />
);
export const SidebarMenu = ({ className, ...props }: React.ComponentProps<"ul">) => <ul className={cn("flex flex-col gap-0.5", className)} {...props} />;
export const SidebarMenuItem = ({ className, ...props }: React.ComponentProps<"li">) => <li className={cn("relative", className)} {...props} />;
export const SidebarMenuBadge = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span className={cn("pointer-events-none absolute right-2 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground", className)} {...props} />
);

export function SidebarMenuButton({ asChild, isActive, className, onClick, ...props }: React.ComponentProps<"button"> & { asChild?: boolean; isActive?: boolean }) {
  const Comp = asChild ? Slot : "button";
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Comp
      data-active={isActive || undefined}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        "data-[active]:bg-sidebar-accent data-[active]:text-sidebar-accent-foreground data-[active]:font-semibold [&>svg]:size-4 [&>svg]:shrink-0",
        className,
      )}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => { onClick?.(e); if (isMobile) setOpenMobile(false); }}
      {...props}
    />
  );
}
