import * as React from "react";
import { Crown, DatabaseZap, Hourglass, Moon, RefreshCw, Send, ShieldAlert, Sun } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/app-1-utils/sidebar";
import { App1Sidebar } from "@/components/ui/app-1-utils/app-1-sidebar";
import { app1Nav, type NavId } from "@/components/ui/app-1-utils/app-1-data";
import { AuthScreen } from "@/components/auth/auth-screen";
import { SetPasswordScreen } from "@/components/auth/set-password";
import { DataProvider, useData } from "@/lib/store";
import { initials } from "@/lib/format";
import type { AccessRequest, HWGlobal, Profile } from "@/lib/hw";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/store";
import { OverviewPage } from "@/pages/overview";
import { SubmissionsPage } from "@/pages/submissions";
import { ChecklistsPage } from "@/pages/checklists";
import { SpeciesPage } from "@/pages/species";
import { ProposalsPage, RegionsPage, SettingsPage } from "@/pages/governance";
import { AuditPage, FeedbackPage, MapPage, PacksPage, ReportsPage, RoadkillPage, UsersPage } from "@/pages/manage";

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
  const [recovering, setRecovering] = React.useState(() => hw.api.isRecovery());
  const theme = useTheme();
  React.useEffect(() => { hw.api.session().then(setMe).catch(() => setMe(null)); }, [hw]);

  if (me === undefined) return <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">Loading…</div>;
  if (!me) return <AuthScreen hw={hw} onAuthed={setMe} />;
  if (recovering) return <SetPasswordScreen hw={hw} me={me} onDone={(p) => { setMe(p); setRecovering(false); }} />;
  if (me.role !== "admin" && me.role !== "reviewer") return <NoAccess me={me} hw={hw} onGranted={setMe} onSignOut={async () => { await hw.api.signOut(); setMe(null); }} />;
  return (
    <DataProvider hw={hw} me={me}>
      <Shell theme={theme} onSignOut={async () => { await hw.api.signOut(); setMe(null); }} />
    </DataProvider>
  );
}

const REVIEWER_PAGES: NavId[] = ["overview", "submissions", "roadkill", "map", "checklists", "species", "proposals", "reports"];

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
            {isAdmin ? <Badge className="gap-1"><Crown className="size-3" /> Admin</Badge> : <Badge variant="secondary">Reviewer</Badge>}
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
          {page === "feedback" && <FeedbackPage />}
          {page === "proposals" && <ProposalsPage />}
          {page === "regions" && <RegionsPage />}
          {page === "settings" && <SettingsPage />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NoAccess({ me, hw, onSignOut, onGranted }: { me: Profile; hw: HWGlobal; onSignOut: () => void; onGranted: (p: Profile) => void }) {
  const toast = useToast();
  const [hasAdmin, setHasAdmin] = React.useState<boolean | null | undefined>(undefined);
  const [req, setReq] = React.useState<AccessRequest | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    const [h, r] = await Promise.all([hw.api.hasAdmin().catch(() => true as boolean | null), hw.api.myAccessRequest().catch(() => null)]);
    setHasAdmin(h); setReq(r);
  }, [hw]);
  React.useEffect(() => { load(); }, [load]);
  const recheck = async () => { const p = await hw.api.session(); if (p && (p.role === "admin" || p.role === "reviewer")) onGranted(p); else { await load(); toast("Not approved yet"); } };
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6">
      <div className="w-full max-w-lg space-y-5">
        <div className="space-y-2 text-center">
          <ShieldAlert className="mx-auto size-10 text-amber-500" />
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard access</h1>
          <p className="text-muted-foreground">Signed in as <b className="text-foreground">{me.email || "@" + me.username}</b>. This account works in the field app; the dashboard needs the <b>reviewer</b> role (approved by the Admin).</p>
        </div>

        {hasAdmin === null && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
            <h2 className="flex items-center gap-2 font-semibold"><DatabaseZap className="size-4" /> Database update needed</h2>
            <p className="mt-1 text-sm text-muted-foreground">The access options need the newest database version. In Supabase open <b>SQL Editor</b>, paste the whole of <code className="rounded bg-muted px-1">supabase/setup.sql</code> from the GitHub repo and click <b>Run</b> (safe to re-run; it keeps all data). Then tap “Check again”.</p>
            <p className="mt-2 text-sm text-muted-foreground">Already made yourself admin with SQL? Just tap “Check again”.</p>
            <Button className="mt-3" onClick={recheck}><RefreshCw /> Check again</Button>
          </div>
        )}

        {hasAdmin === false && (
          <div className="rounded-xl border bg-muted/40 p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Crown className="size-4 text-primary" /> No platform owner yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">The Admin is the single owner of the platform and can only be set inside Supabase, never from the app. In Supabase → SQL Editor run: <code className="rounded bg-muted px-1">select public.set_platform_owner('{me.email}');</code> then tap “Check again”.</p>
            <Button className="mt-3" onClick={recheck}><RefreshCw /> Check again</Button>
          </div>
        )}

        {hasAdmin !== null && hasAdmin !== undefined && req?.status === "pending" && (
          <div className="rounded-xl border bg-muted/40 p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Hourglass className="size-4" /> Request sent</h2>
            <p className="mt-1 text-sm text-muted-foreground">You asked for <b>{req.requested_role}</b> access on {new Date(req.created_at).toLocaleDateString()}. The Admin will approve it from the Users page; then tap “Check again”.</p>
            <div className="mt-3 flex gap-2"><Button onClick={recheck}><RefreshCw /> Check again</Button></div>
          </div>
        )}

        {hasAdmin !== null && hasAdmin !== undefined && req?.status !== "pending" && (
          <div className="rounded-xl border p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Request access</h2><Button size="sm" variant="ghost" onClick={recheck}><RefreshCw /> Check again</Button></div>
            {req?.status === "declined" && <p className="mt-1 text-sm text-destructive">Your last request was declined. You can ask again with more detail.</p>}
            <p className="mt-1 text-sm text-muted-foreground">Reviewers verify observations, suggest identifications and propose checklist and species changes. The Admin (platform owner) approves.</p>
            <Textarea className="mt-3" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why do you need it? (e.g. state coordinator for Kerala)" />
            <Button className="mt-3 w-full" disabled={busy} onClick={async () => {
              setBusy(true);
              try { setReq(await hw.api.requestAccess(note)); toast("Request sent to the admins"); } catch (e) { toast((e as Error).message, "error"); }
              setBusy(false);
            }}><Send /> Send request</Button>
          </div>
        )}

        <div className="flex justify-center gap-2"><Button variant="outline" asChild><a href="../app.html">Open field app</a></Button><Button variant="ghost" onClick={onSignOut}>Sign out</Button></div>
      </div>
    </div>
  );
}
