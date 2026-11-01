import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Flag, Search, Skull, TriangleAlert, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { useData } from "@/lib/store";
import type { ReviewStatus, Species } from "@/lib/hw";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: "warn" }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className={cn("grid size-9 place-items-center rounded-lg bg-primary/10 text-primary", tone === "warn" && "bg-warning/20 text-foreground")}>
          <Icon aria-hidden className="size-[18px]" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function IucnBadge({ code }: { code: string }) {
  const { hw } = useData();
  const iu = hw.IUCN[code] || hw.IUCN.NE;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: iu.color }} title={iu.name}>
      {code}
    </span>
  );
}

export function VenomBadge({ s }: { s: Pick<Species, "venom" | "toxic" | "pack"> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {s.venom === "venomous" && <Badge variant="destructive" className="gap-1 px-2 py-0 text-[11px]"><TriangleAlert className="size-3" /> Venomous</Badge>}
      {s.venom === "mild" && <Badge variant="warning" className="px-2 py-0 text-[11px]">Mildly venomous</Badge>}
      {s.toxic === "poisonous" && <Badge variant="outline" className="border-purple-400/50 px-2 py-0 text-[11px] text-purple-700 dark:text-purple-300"><Skull className="mr-1 size-3" /> Poisonous</Badge>}
    </span>
  );
}

/** Identity colour of a species group (replaces emoji). */
export function PackDot({ color, className }: { color?: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color || "#888" }} />;
}

/** Group name with its colour dot. */
export function PackLabel({ id }: { id?: string }) {
  const { packOf } = useData();
  const p = packOf(id);
  return <span className="inline-flex items-center gap-2 whitespace-nowrap"><PackDot color={p.color} />{p.name}</span>;
}

export function OffListFlag({ n, title }: { n?: number; title?: string }) {
  return <span title={title} className="ml-1 inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"><Flag className="size-3" />{n ?? ""}</span>;
}

export function ReviewBadge({ status }: { status: ReviewStatus | "mixed" }) {
  if (status === "verified" || status === "accepted") return <Badge variant="success">Verified</Badge>;
  if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  if (status === "needs_id") return <Badge variant="warning">Needs ID</Badge>;
  if (status === "more_info") return <Badge variant="warning">More info</Badge>;
  if (status === "mixed") return <Badge variant="secondary">Partly reviewed</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export function SpeciesName({ id, text, compact }: { id?: string | null; text?: string; compact?: boolean }) {
  const { spById } = useData();
  const s = id ? spById[id] : undefined;
  if (!s) return <span className="italic text-muted-foreground">{text || "Unidentified"}</span>;
  return (
    <span className="min-w-0">
      <span className="font-medium">{s.common}</span>
      {!compact && <span className="block text-xs italic text-muted-foreground">{s.sci}</span>}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Icon className="size-6" /></span>
      <p className="font-medium">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" type="search" />
    </div>
  );
}

/** Region <select>: countries with their states, plus optional "All regions". */
export function RegionSelect({ value, onChange, allowAll, className, id }: { value: string; onChange: (v: string) => void; allowAll?: boolean; className?: string; id?: string }) {
  const { regions } = useData();
  const kids = (code: string | null) => regions.filter((r) => (r.parent || null) === code).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
  const rows: React.ReactNode[] = [];
  const walk = (code: string, depth: number) => kids(code).forEach((r) => {
    rows.push(<option key={r.code} value={r.code}>{"\u00a0\u00a0".repeat(depth) + r.name}{r.kind === "island" ? " (island)" : r.kind === "protected_area" ? " (PA)" : ""}</option>);
    walk(r.code, depth + 1);
  });
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} aria-label="Region">
      {allowAll && <option value="">All regions</option>}
      {kids(null).map((c) => (
        <optgroup key={c.code} label={c.name}>
          <option value={c.code}>{c.name} (country)</option>
          {(() => { rows.length = 0; walk(c.code, 0); return [...rows]; })()}
        </optgroup>
      ))}
    </NativeSelect>
  );
}

/* ───────── Leaflet map ───────── */
export type MapPoint = { lat: number; lng: number; color: string; label: string; kind?: "dot" | "cross" };
export function MapView({ points = [], tracks = [], className, height = 420 }: { points?: MapPoint[]; tracks?: { coords: [number, number][]; label?: string; color?: string }[]; className?: string; height?: number }) {
  const el = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<L.Map | null>(null);
  const layer = React.useRef<L.LayerGroup | null>(null);

  React.useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false }).setView([21, 82], 4);
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri" });
    L.control.layers({ Map: osm, Satellite: sat }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  React.useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const all: [number, number][] = [];
    tracks.forEach((t) => {
      if (t.coords.length < 2) return;
      L.polyline(t.coords, { color: t.color || "#c53030", weight: 3, opacity: 0.75 }).bindTooltip(t.label || "").addTo(g);
      all.push(...t.coords);
    });
    points.forEach((p) => {
      const mk = p.kind === "cross"
        ? L.marker([p.lat, p.lng], { icon: L.divIcon({ html: `<b style="color:${p.color};font-size:16px;text-shadow:0 0 2px #fff">✕</b>`, className: "", iconSize: [14, 14], iconAnchor: [7, 7] }) })
        : L.circleMarker([p.lat, p.lng], { radius: 6, weight: 2, color: "#fff", fillColor: p.color, fillOpacity: 0.95 });
      mk.bindTooltip(p.label).addTo(g);
      all.push([p.lat, p.lng]);
    });
    if (all.length > 1) m.fitBounds(all, { padding: [24, 24], maxZoom: 14 });
    else if (all.length === 1) m.setView(all[0], 13);
  }, [points, tracks]);

  return <div ref={el} className={cn("w-full overflow-hidden rounded-lg border", className)} style={{ height }} />;
}
