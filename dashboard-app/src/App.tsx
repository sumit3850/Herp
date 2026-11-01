import * as React from "react";
import { Moon, ShieldAlert, Sun } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/app-1-utils/sidebar";
import { App1Sidebar } from "@/components/ui/app-1-utils/app-1-sidebar";
import { app1Nav, type NavId } from "@/components/ui/app-1-utils/app-1-data";
import { AuthScreen } from "@/components/auth/auth-screen";
import { DataProvider, useData } from "@/lib/store";
import { initials } from "@/lib/format";
import type { HWGlobal, Profile } from "@/lib/hw";
import { OverviewPage } from "@/pages/overview";
import { SubmissionsPage } from "@/pages/submissions";
import { ChecklistsPage } from "@/pages/checklists";
import { SpeciesPage } from "@/pages/species";
import { AuditPage, MapPage, PacksPage, ReportsPage, RoadkillPage, UsersPage } from "@/pages/manage";

/* ── theme: system by default, toggle persists ── */
function useTheme() {
  const [theme, setTheme] = React.useState<"light" | "dark">(() => {
    try { const t = localStorage.getItem("hw_theme"); if (t === "light" || t === "dark") return t; } catch { /* ignore */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme; // shared with the field app & website
  }, [theme]);
  const toggle = () => setTheme((t) => { const n = t === "dark" ? "light" : "dark"; try { localStorage.setItem("hw_theme", JSON.stringify(n)); } catch { /* ignore */ } return n; });
  return { theme, toggle };
}

/* ── tiny hash router: #/checklists?region=IN-KL ── */
function parseHash(): { page: NavId; q: Record<string, string> } {
  const [p, qs] = window.location.hash.replace(/^#\/?/, "").split("?");
  const ids = app1Nav.flatMap((g) => g.items.map((i) => i.id));
  return { page: (ids.includes(p as NavId) ? p : "overview") as NavId, q: Object.fromEntries(new URLSearchParams(qs || "")) };
}
function useHashRoute() {
  const [r, setR] = React.useState(parseHash);
  React.useEffect(() => { const on = () => setR(parseHash()); window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on); }, []);
  const go = React.useCallback((page: NavId, q?: Record<string, string>) => {
    window.location.hash = `/${page}${q && Object.keys(q).length ? "?" + new URLSearchParams(q) : ""}`;
    window.scrollTo(0, 0);
  }, []);
  return { ...r, go };
}

export default function App({ hw }: { hw: HWGlobal }) {
  const [me, setMe] = React.useState<Profile | null | undefined>(undefined);
  const theme = useTheme();
  React.useEffect(() => { hw.api.session().then(setMe).catch(() => setMe(null)); }, [hw]);

  if (me === undefined) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (!me) return <AuthScreen hw={hw} onAuthed={setMe} />;
  if (me.role !== "admin" && me.role !== "reviewer") return <NoAccess me={me} onSignOut={async () => { await hw.api.signOut(); setMe(null); }} />;
  return (
    <DataProvider hw={hw} me={me}>
      <Shell theme={theme} onSignOut={async () => { await hw.api.signOut(); setMe(null); }} />
    </DataProvider>
  );
}

const REVIEWER_PAGES: NavId[] = ["overview", "submissions", "roadkill", "map", "checklists", "reports"];

function Shell({ theme, onSignOut }: { theme: ReturnType<typeof useTheme>; onSignOut: () => void }) {
  const { me, hw, sightings, isAdmin } = useData();
  const { page: rawPage, q, go } = useHashRoute();
  const page = isAdmin || REVIEWER_PAGES.includes(rawPage) ? rawPage : "overview";
  const pending = sightings.filter((s) => s.review_status === "pending").length;
  const title = app1Nav.flatMap((g) => g.items).find((i) => i.id === page)?.label;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <SidebarProvider>
      <App1Sidebar
        active={page}
        onNavigate={(id) => go(id)}
        badges={{ submissions: pending }}
        appName={hw.C.APP_NAME}
        user={{ name: me.full_name || me.username, email: me.email || `@${me.username}`, initials: initials(me.full_name || me.username) }}
        onSignOut={onSignOut}
        allowed={isAdmin ? undefined : REVIEWER_PAGES}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <SidebarTrigger aria-label="Toggle navigation" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">{page === "overview" ? `${greet}, ${(me.full_name || me.username).split(" ")[0]}` : title}</h1>
            {page === "overview" && <p className="hidden text-xs text-muted-foreground sm:block">Here’s what observers have been finding.</p>}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {hw.DEMO && <Badge variant="warning" className="hidden sm:inline-flex">Demo data</Badge>}
            {!isAdmin && <Badge variant="secondary">Reviewer</Badge>}
            <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={theme.toggle}>{theme.theme === "dark" ? <Sun /> : <Moon />}</Button>
            <Avatar className="ml-1 size-8"><AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{initials(me.full_name || me.username)}</AvatarFallback></Avatar>
          </div>
        </header>
        <main key={page} className="flex flex-1 flex-col gap-6 p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 sm:p-6">
          {page === "overview" && <OverviewPage go={go} />}
          {page === "submissions" && <SubmissionsPage initial={{ region: q.region || "", status: (q.status as never) || "" }} />}
          {page === "checklists" && <ChecklistsPage initialRegion={q.region} go={go} />}
          {page === "species" && <SpeciesPage startNew={q.new === "1"} />}
          {page === "roadkill" && <RoadkillPage />}
          {page === "users" && <UsersPage />}
          {page === "packs" && <PacksPage />}
          {page === "map" && <MapPage />}
          {page === "reports" && <ReportsPage />}
          {page === "audit" && <AuditPage />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NoAccess({ me, onSignOut }: { me: Profile; onSignOut: () => void }) {
  return (
    <div className="grid min-h-svh place-items-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <ShieldAlert className="mx-auto size-10 text-warning" />
        <h1 className="text-2xl font-semibold">No dashboard access</h1>
        <p className="text-muted-foreground">You’re signed in as <b>{me.email || "@" + me.username}</b>. This is the same account you use in the field app, but it has the <b>{me.role}</b> role. The dashboard is for reviewers and admins. Ask an admin to change your role, or in Supabase run <code className="rounded bg-muted px-1">update profiles set role='admin' where email='{me.email}';</code></p>
        <div className="flex justify-center gap-2"><Button asChild><a href="../app.html">Open field app</a></Button><Button variant="outline" onClick={onSignOut}>Sign out</Button></div>
      </div>
    </div>
  );
}
