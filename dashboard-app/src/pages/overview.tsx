import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ClipboardList, Hourglass, Leaf, Route, Users, Binoculars } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/common";
import { useData } from "@/lib/store";
import { initials, num, PROTOCOLS, timeAgo } from "@/lib/format";
import type { NavId } from "@/components/ui/app-1-utils/app-1-data";

const chartConfig = {
  checklists: { label: "Checklists submitted", color: "var(--chart-3)" },
  individuals: { label: "Individuals recorded", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function OverviewPage({ go }: { go: (id: NavId, q?: Record<string, string>) => void }) {
  const { trips, sightings, surveys, records, regions, loading, regionName, hw } = useData();
  const [checklists, setChecklists] = React.useState<Record<string, string[]>>({});

  // core checklist sizes for the coverage card (states with activity)
  const activeRegions = React.useMemo(() => {
    const n: Record<string, number> = {};
    trips.forEach((t) => (n[t.region_code] = (n[t.region_code] || 0) + 1));
    return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r]) => r);
  }, [trips]);
  React.useEffect(() => {
    let off = false;
    Promise.all(activeRegions.map(async (r) => [r, await hw.api.checklist(r)] as const)).then((rows) => { if (!off) setChecklists(Object.fromEntries(rows)); });
    return () => { off = true; };
  }, [activeRegions, hw]);

  const now = Date.now(), d30 = now - 30 * 864e5;
  const pending = sightings.filter((s) => s.review_status === "pending").length;
  const individuals = sightings.filter((s) => s.review_status !== "rejected").reduce((a, s) => a + s.count, 0);
  const observers = new Set([...trips.map((t) => t.user_id), ...surveys.map((s) => s.user_id)]).size;
  const km = surveys.reduce((a, s) => a + (+s.distance_km || 0), 0);
  const kills = records.reduce((a, r) => a + r.count, 0);
  const newTrips = trips.filter((t) => +new Date(t.started_at) > d30).length;

  // 12-week series
  const series = React.useMemo(() => {
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const end = now - (11 - i) * 7 * 864e5;
      return { start: end - 7 * 864e5, end, label: new Date(end).toLocaleDateString("en-IN", { day: "numeric", month: "short" }), checklists: 0, individuals: 0 };
    });
    trips.forEach((t) => { const w = weeks.find((w) => +new Date(t.started_at) > w.start && +new Date(t.started_at) <= w.end); if (w) w.checklists++; });
    sightings.forEach((s) => { const w = weeks.find((w) => +new Date(s.observed_at) > w.start && +new Date(s.observed_at) <= w.end); if (w && s.review_status !== "rejected") w.individuals += s.count; });
    return weeks.map(({ label, checklists, individuals }) => ({ week: label, checklists, individuals }));
  }, [trips, sightings, now]);

  const activity = React.useMemo(() => [
    ...trips.map((t) => ({ id: "t" + t.id, who: t.full_name || t.username || "Observer", at: t.started_at, go: "submissions" as NavId,
      text: `submitted a ${PROTOCOLS[t.protocol]?.toLowerCase() || t.protocol} checklist · ${t.sightings.length} species · ${regionName(t.region_code)}` })),
    ...surveys.map((s) => ({ id: "s" + s.id, who: s.username || "Observer", at: s.started_at, go: "roadkill" as NavId,
      text: `logged a road-kill survey on ${s.road_name || "a road"} · ${s.distance_km} km · ${records.filter((r) => r.survey_id === s.id).length} records` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7), [trips, surveys, records, regionName]);

  if (loading) return <OverviewSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Checklists" value={num(trips.length)} hint={`+${newTrips} in the last 30 days`} icon={ClipboardList} />
        <StatCard label="Individuals recorded" value={num(individuals)} hint={`${num(sightings.length)} sighting records`} icon={Binoculars} />
        <StatCard label="Species recorded" value={num(new Set(sightings.map((s) => s.species_id).filter(Boolean)).size)} hint={`across ${new Set(trips.map((t) => t.region_code)).size} regions`} icon={Leaf} />
        <StatCard label="Observers" value={num(observers)} hint="submitted at least once" icon={Users} />
        <StatCard label="Awaiting review" value={num(pending)} hint={pending ? "open Submissions to review" : "all caught up"} icon={Hourglass} tone={pending ? "warn" : undefined} />
        <StatCard label="Road-kills / 100 km" value={km ? ((kills / km) * 100).toFixed(1) : "—"} hint={`${num(kills)} carcasses · ${km.toFixed(1)} km`} icon={Route} />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Submission throughput</CardTitle>
            <CardDescription>Checklists submitted and individuals recorded per week, last 12 weeks</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => go("submissions")}>View all submissions</Button>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <AreaChart data={series} margin={{ left: 4, right: 4, top: 8 }} accessibilityLayer>
              <defs>
                <linearGradient id="hwIndividuals" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-individuals)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-individuals)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Area dataKey="checklists" type="monotone" stroke="var(--color-checklists)" strokeDasharray="4 4" fill="none" strokeWidth={2} />
              <Area dataKey="individuals" type="monotone" stroke="var(--color-individuals)" fill="url(#hwIndividuals)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Checklist coverage</CardTitle>
              <CardDescription>Share of each core checklist recorded so far, most active regions</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => go("checklists")}>Manage</Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {activeRegions.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
            {activeRegions.map((r) => {
              const core = new Set(checklists[r] || []);
              const seen = new Set(sightings.filter((s) => s.region_code === r && s.species_id && s.review_status !== "rejected").map((s) => s.species_id!));
              const covered = [...seen].filter((id) => core.has(id)).length;
              const off = [...seen].filter((id) => !core.has(id)).length;
              const pct = core.size ? Math.round((covered / core.size) * 100) : 0;
              const status = pct >= 60 ? ["Well surveyed", "default"] : pct >= 25 ? ["In progress", "secondary"] : ["Needs surveys", "outline"];
              return (
                <button key={r} className="flex flex-col gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => go("checklists", { region: r })}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-medium">{regionName(r)}</h3>
                    <Badge variant={status[1] as "default" | "secondary" | "outline"}>{status[0]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {covered} of {core.size} checklist species recorded{off ? ` · ${off} recorded but not on the checklist` : ""}
                  </p>
                  <div className="flex items-center gap-3">
                    <Progress value={pct} className="h-2" aria-label={`${regionName(r)} coverage`} />
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest submissions from observers</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-4">
              {activity.map((a) => (
                <li key={a.id}>
                  <button className="flex w-full items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => go(a.go)}>
                    <Avatar className="size-8"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(a.who)}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug"><span className="font-medium">{a.who}</span> <span className="text-muted-foreground">{a.text}</span></p>
                      <p className="text-xs text-muted-foreground">{timeAgo(a.at)}</p>
                    </div>
                  </button>
                </li>
              ))}
              {!activity.length && <p className="text-sm text-muted-foreground">Nothing yet. Submissions appear here as soon as they sync.</p>}
            </ol>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">{regions.length} regions configured · data mode: {hw.DEMO ? "demo (this browser only)" : "Supabase"}</p>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[118px]" />)}</div>
      <Skeleton className="h-80" />
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
    </div>
  );
}
