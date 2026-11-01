import * as React from "react";
import { BarChart3, Download, ExternalLink, Gift, Pencil, Plus, Route, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, MapView, PageHeader, RegionSelect, SearchInput, SpeciesName, StatCard, type MapPoint } from "@/components/common";
import { useAction, useData } from "@/lib/store";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import type { Entitlement, Price, Profile, Survey } from "@/lib/hw";

/* ═════════════ Road-kill ═════════════ */
export function RoadkillPage() {
  const { surveys, records, hw, reload, regionName, packOf, spById } = useData();
  const act = useAction();
  const [sel, setSel] = React.useState<Survey | null>(null);
  const km = surveys.reduce((a, s) => a + (+s.distance_km || 0), 0);
  const kills = records.reduce((a, r) => a + r.count, 0);
  const shown = sel ? records.filter((r) => r.survey_id === sel.id) : records;
  const points: MapPoint[] = shown.map((r) => ({ lat: r.lat, lng: r.lng, color: packOf(r.pack).color, kind: "cross", label: `${r.species_id ? spById[r.species_id]?.common : r.species_text || "Unidentified " + packOf(r.pack).name} · ${r.condition}` }));
  const tracks = (sel ? [sel] : surveys).map((s) => ({ coords: s.track || [], label: `${s.road_name} · ${s.distance_km} km` }));
  const geojson = () => hw.util.download("roadkill.geojson", JSON.stringify({ type: "FeatureCollection", features: [
    ...surveys.map((s) => ({ type: "Feature", properties: { kind: "survey", id: s.id, road: s.road_name, km: s.distance_km, observer: s.username, started: s.started_at }, geometry: { type: "LineString", coordinates: (s.track || []).map(([a, b]) => [b, a]) } })),
    ...records.map((r) => ({ type: "Feature", properties: { kind: "roadkill", survey: r.survey_id, species: r.species_id ? spById[r.species_id]?.sci : r.species_text, group: r.pack, count: r.count, condition: r.condition, at: r.observed_at }, geometry: { type: "Point", coordinates: [r.lng, r.lat] } })),
  ] }), "application/geo+json");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Road-kill surveys" description="GPS-tracked road transects and the carcasses logged on them."
        actions={<><Button variant="outline" onClick={() => hw.util.download("roadkill-records.csv", hw.util.toCSV(records.map(({ photos, ...r }) => ({ ...r, common_name: r.species_id ? spById[r.species_id]?.common : r.species_text, scientific_name: r.species_id ? spById[r.species_id]?.sci : "", group: packOf(r.pack).name, photos: (photos || []).join(" ") }))))}><Download /> Records CSV</Button>
          <Button variant="outline" onClick={geojson}><Download /> GeoJSON</Button></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Surveys" value={num(surveys.length)} icon={Route} />
        <StatCard label="Road surveyed" value={`${km.toFixed(1)} km`} icon={Route} />
        <StatCard label="Carcasses logged" value={num(kills)} icon={X} />
        <StatCard label="Kills per 100 km" value={km ? ((kills / km) * 100).toFixed(1) : "—"} icon={BarChart3} />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <div><CardTitle className="text-base">{sel ? sel.road_name || "Survey" : "All surveys"}</CardTitle><CardDescription>{sel ? `${fmtDateTime(sel.started_at)} · ${sel.distance_km} km · @${sel.username}` : "Click a survey below to focus the map"}</CardDescription></div>
          {sel && <Button size="sm" variant="outline" onClick={() => setSel(null)}>Show all</Button>}
        </CardHeader>
        <CardContent><MapView points={points} tracks={tracks} height={380} /></CardContent>
      </Card>
      <Card>
        {!surveys.length ? <EmptyState icon={Route} title="No road-kill surveys yet">Surveys appear here once observers finish them in the field app.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>Road</TableHead><TableHead>Date</TableHead><TableHead>Observer</TableHead><TableHead>Mode</TableHead><TableHead className="text-right">km</TableHead><TableHead className="text-right">Kills</TableHead><TableHead className="text-right">/100 km</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {surveys.map((s) => {
                const n = records.filter((r) => r.survey_id === s.id).reduce((a, r) => a + r.count, 0);
                return (
                  <TableRow key={s.id} className="cursor-pointer" data-state={sel?.id === s.id ? "selected" : undefined} onClick={() => { setSel(s); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    <TableCell><span className="font-medium">{s.road_name || "—"}</span><span className="block text-xs text-muted-foreground">{s.road_type} · {regionName(s.region_code)}</span></TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(s.started_at)}</TableCell>
                    <TableCell>@{s.username}</TableCell>
                    <TableCell className="capitalize">{s.mode}</TableCell>
                    <TableCell className="text-right font-mono">{s.distance_km}</TableCell>
                    <TableCell className="text-right font-mono">{n}</TableCell>
                    <TableCell className="text-right font-mono">{s.distance_km > 0 ? ((n / s.distance_km) * 100).toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="size-8 hover:text-destructive" title="Delete survey" onClick={() => { if (confirm("Delete this survey and all its records?")) act(async () => { await hw.api.admin.deleteSurvey(s.id); setSel(null); await reload(["submissions"]); }, "Survey deleted"); }}><Trash2 /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      {sel && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Records on this survey</CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Species</TableHead><TableHead className="text-right">#</TableHead><TableHead>Condition</TableHead><TableHead>Location</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {records.filter((r) => r.survey_id === sel.id).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{new Date(r.observed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell><SpeciesName id={r.species_id} text={r.species_text || `Unidentified ${packOf(r.pack).name.toLowerCase()}`} /></TableCell>
                  <TableCell className="text-right font-mono">{r.count}</TableCell>
                  <TableCell className="capitalize">{r.condition} {r.side && <span className="text-xs text-muted-foreground">· {r.side}</span>}</TableCell>
                  <TableCell className="font-mono text-xs"><a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}>{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</a></TableCell>
                  <TableCell className="text-right"><Button size="icon" variant="ghost" className="size-8 hover:text-destructive" onClick={() => { if (confirm("Delete this record?")) act(async () => { await hw.api.admin.deleteRoadkill(r.id); await reload(["submissions"]); }); }}><Trash2 /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/* ═════════════ Users ═════════════ */
type UserRow = Profile & { packs: Entitlement[] };
export function UsersPage() {
  const { hw, packs, regionName, trips } = useData();
  const act = useAction();
  const [users, setUsers] = React.useState<UserRow[] | null>(null);
  const [q, setQ] = React.useState("");
  const [grantTo, setGrantTo] = React.useState<UserRow | null>(null);
  const load = React.useCallback(async () => setUsers(await hw.api.admin.users()), [hw]);
  React.useEffect(() => { load().catch(() => setUsers([])); }, [load]);
  const list = (users || []).filter((u) => !q || `${u.full_name} ${u.username} ${u.email} ${u.phone}`.toLowerCase().includes(q.toLowerCase()));
  const pending = (users || []).filter((u) => u.status === "pending").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Users" description={`${users?.length ?? "…"} accounts${pending ? ` · ${pending} awaiting approval` : ""}. Set roles, approve or block accounts, and grant packs (for invoices, researchers, forest staff…).`}
        actions={<Button variant="outline" onClick={() => hw.util.download("users.csv", hw.util.toCSV(list.map(({ packs, ...u }) => ({ ...u, packs: packs.map((e) => `${e.pack}@${e.region}`).join(" ") }))))}><Download /> CSV</Button>} />
      <Card>
        <CardHeader className="p-4"><SearchInput value={q} onChange={setQ} placeholder="Name, username, email, phone…" /></CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Home</TableHead><TableHead className="text-right">Checklists</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Active packs</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {list.map((u) => (
              <TableRow key={u.id}>
                <TableCell><span className="font-medium">{u.full_name || u.username}</span><span className="block text-xs text-muted-foreground">@{u.username} · {u.email}</span></TableCell>
                <TableCell className="whitespace-nowrap text-sm">{regionName(u.home_region)}</TableCell>
                <TableCell className="text-right font-mono">{trips.filter((t) => t.user_id === u.id).length}</TableCell>
                <TableCell><NativeSelect value={u.role} className="w-32" aria-label="Role" onChange={(e) => act(async () => { await hw.api.admin.setUser(u.id, { role: e.target.value as Profile["role"] }); await load(); }, "Role updated")}>{["user", "reviewer", "admin"].map((r) => <option key={r}>{r}</option>)}</NativeSelect></TableCell>
                <TableCell><NativeSelect value={u.status} className="w-32" aria-label="Status" onChange={(e) => act(async () => { await hw.api.admin.setUser(u.id, { status: e.target.value as Profile["status"] }); await load(); }, "Status updated")}>{["approved", "pending", "blocked"].map((r) => <option key={r}>{r}</option>)}</NativeSelect></TableCell>
                <TableCell>
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {u.packs.map((e) => (
                      <Badge key={e.id} variant="secondary" className="gap-1 font-normal">
                        {packs.find((p) => p.id === e.pack)?.emoji} {e.region}
                        <button aria-label="Revoke" className="hover:text-destructive" onClick={() => { if (confirm("Revoke this pack now?")) act(async () => { await hw.api.admin.revoke(e.id); await load(); }, "Revoked"); }}><X className="size-3" /></button>
                      </Badge>
                    ))}
                    {!u.packs.length && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setGrantTo(u)}><Gift /> Grant</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {grantTo && <GrantDialog user={grantTo} onClose={() => setGrantTo(null)} onDone={load} />}
    </div>
  );
}

function GrantDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => Promise<void> }) {
  const { packs, hw } = useData();
  const act = useAction();
  const [pack, setPack] = React.useState(packs[0]?.id || "snakes");
  const [region, setRegion] = React.useState("IN");
  const [days, setDays] = React.useState("365");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Grant a pack to {user.full_name || user.username}</DialogTitle><DialogDescription>No payment is taken. Leave days empty for lifetime access.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label htmlFor="g-pack">Pack</Label><NativeSelect id="g-pack" value={pack} onChange={(e) => setPack(e.target.value)}>{packs.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}</NativeSelect></div>
          <div className="grid gap-1.5"><Label htmlFor="g-reg">Region</Label><RegionSelect id="g-reg" value={region} onChange={setRegion} /></div>
          <div className="grid gap-1.5"><Label htmlFor="g-days">Days</Label><Input id="g-days" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => act(async () => { await hw.api.admin.grant(user.id, pack, region, days ? +days : null); await onDone(); onClose(); }, "Pack granted")}><Gift /> Grant</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════ Packs & pricing ═════════════ */
export function PacksPage() {
  const { hw, packs, regions, regionName } = useData();
  const act = useAction();
  const [prices, setPrices] = React.useState<Price[]>([]);
  const [edit, setEdit] = React.useState<Partial<Price> | null>(null);
  const load = React.useCallback(async () => setPrices(await hw.api.prices()), [hw]);
  React.useEffect(() => { load(); }, [load]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Packs & pricing" description="Users pay only for the groups they choose. An exact pack + region price wins; any single state falls back to the “any state” price. The server enforces these prices."
        actions={<Button onClick={() => setEdit({ pack: packs[0]?.id, region: "*state", paise: 4900, days: 365 })}><Plus /> Add price</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {packs.map((p) => {
          const st = prices.find((x) => x.pack === p.id && x.region === "*state"), all = prices.find((x) => x.pack === p.id && x.region === "IN");
          return (
            <Card key={p.id} className="overflow-hidden">
              <div className="h-1.5" style={{ background: p.color }} />
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span className="text-2xl">{p.emoji}</span>{p.name}</CardTitle><CardDescription>{p.blurb}</CardDescription></CardHeader>
              <CardContent className="font-mono text-sm">{st ? `${hw.util.rupees(st.paise)} / state` : "—"} · {all ? `${hw.util.rupees(all.paise)} / India` : "—"}</CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow><TableHead>Pack</TableHead><TableHead>Region</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Validity</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {[...prices].sort((a, b) => a.pack.localeCompare(b.pack) || a.region.localeCompare(b.region)).map((p) => (
              <TableRow key={p.id}>
                <TableCell>{packs.find((x) => x.id === p.pack)?.emoji} {packs.find((x) => x.id === p.pack)?.name}</TableCell>
                <TableCell>{p.region === "*state" ? <i>Any single state (default)</i> : regionName(p.region)}</TableCell>
                <TableCell className="text-right font-mono">{hw.util.rupees(p.paise)}</TableCell>
                <TableCell className="text-right">{p.days} days</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => setEdit(p)}><Pencil /></Button>
                  <Button size="icon" variant="ghost" className="size-8 hover:text-destructive" onClick={() => { if (confirm("Delete this price?")) act(async () => { await hw.api.admin.deletePrice(p.id); await load(); }, "Deleted"); }}><Trash2 /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{edit.id ? "Edit price" : "Add price"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label htmlFor="p-pack">Pack</Label><NativeSelect id="p-pack" value={edit.pack} onChange={(e) => setEdit({ ...edit, pack: e.target.value })}>{packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></div>
              <div className="grid gap-1.5"><Label htmlFor="p-reg">Region</Label>
                <NativeSelect id="p-reg" value={edit.region} onChange={(e) => setEdit({ ...edit, region: e.target.value })}>
                  <option value="*state">Any single state (default)</option>
                  {regions.map((r) => <option key={r.code} value={r.code}>{r.parent ? "— " : ""}{r.name}</option>)}
                </NativeSelect></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label htmlFor="p-rs">Price (₹)</Label><Input id="p-rs" type="number" min={1} value={(edit.paise || 0) / 100} onChange={(e) => setEdit({ ...edit, paise: Math.round(+e.target.value * 100) })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="p-days">Days</Label><Input id="p-days" type="number" min={1} value={edit.days} onChange={(e) => setEdit({ ...edit, days: +e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => act(async () => { await hw.api.admin.upsertPrice(edit); setEdit(null); await load(); }, "Price saved")}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ═════════════ Map ═════════════ */
export function MapPage() {
  const { sightings, records, surveys, packs, packOf, spById } = useData();
  const [pack, setPack] = React.useState("");
  const [layers, setLayers] = React.useState({ sightings: true, roadkill: true, tracks: true });
  const [status, setStatus] = React.useState("");
  const pts: MapPoint[] = [
    ...(layers.sightings ? sightings.filter((s) => s.lat != null && (!status || s.review_status === status) && (!pack || spById[s.species_id || ""]?.pack === pack))
      .map((s) => ({ lat: s.lat!, lng: s.lng!, color: packOf(spById[s.species_id || ""]?.pack).color, label: `${s.species_id ? spById[s.species_id]?.common : s.species_text} ×${s.count} · ${fmtDate(s.observed_at)} · @${s.username} · ${s.review_status}` })) : []),
    ...(layers.roadkill ? records.filter((r) => !pack || r.pack === pack).map((r) => ({ lat: r.lat, lng: r.lng, kind: "cross" as const, color: packOf(r.pack).color, label: `Road-kill: ${r.species_id ? spById[r.species_id]?.common : r.species_text || "unidentified"}` })) : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Map" description="Exact locations of every record. Only admins and reviewers can see this map; the public website blurs locations." />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 p-4">
          <NativeSelect value={pack} onChange={(e) => setPack(e.target.value)} className="w-52" aria-label="Group"><option value="">All groups</option>{packs.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}</NativeSelect>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Review status"><option value="">Any review status</option><option value="pending">Pending</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option></NativeSelect>
          {(["sightings", "roadkill", "tracks"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" className="custom-checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {k === "roadkill" ? "Road-kill" : k}</label>
          ))}
          <span className="ml-auto text-sm text-muted-foreground">{pts.length} points</span>
        </CardHeader>
        <CardContent>
          <MapView points={pts} tracks={layers.tracks ? surveys.map((s) => ({ coords: s.track || [], label: s.road_name })) : []} height={560} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {packs.map((p) => <span key={p.id} className="flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />{p.name}</span>)}
            <span>● sighting</span><span>✕ road-kill</span><span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-[#c53030]" />survey route</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ═════════════ Reports ═════════════ */
export function ReportsPage() {
  const { hw } = useData();
  const [stats, setStats] = React.useState<Awaited<ReturnType<typeof hw.api.publicStats>> | null>(null);
  React.useEffect(() => { hw.api.publicStats().then(setStats); }, [hw]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Public report" description="The website shows these numbers live, with charts and a privacy-safe map. It prints to an A4 PDF." actions={<Button asChild><a href="../index.html#report" target="_blank" rel="noreferrer"><ExternalLink /> Open public report</a></Button>} />
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Individuals (public)" value={num(stats.totals.sightings)} hint="excludes rejected records" icon={BarChart3} />
          <StatCard label="Species" value={num(stats.totals.species)} icon={BarChart3} />
          <StatCard label="Contributors" value={num(stats.totals.observers)} icon={BarChart3} />
          <StatCard label="Road-kills / 100 km" value={stats.totals.roadkill_per_100km} icon={Route} />
        </div>
      )}
      {stats && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top species</CardTitle></CardHeader>
          <Table><TableBody>{stats.top_species.map((s) => <TableRow key={s.species_id}><TableCell><span className="font-medium">{s.common}</span> <i className="text-xs text-muted-foreground">{s.sci}</i></TableCell><TableCell className="text-right font-mono">{s.n}</TableCell></TableRow>)}</TableBody></Table>
        </Card>
      )}
    </div>
  );
}
