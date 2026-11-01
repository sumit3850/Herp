import * as React from "react";
import { BarChart3, Crown, Download, ExternalLink, Gift, Pencil, Plus, Route, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, MapView, PackDot, PackLabel, PageHeader, RegionSelect, SearchInput, SpeciesName, StatCard, type MapPoint } from "@/components/common";
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
  const [requests, setRequests] = React.useState<Awaited<ReturnType<typeof hw.api.admin.accessRequests>>>([]);
  const loadReq = React.useCallback(() => hw.api.admin.accessRequests().then(setRequests).catch(() => setRequests([])), [hw]);
  React.useEffect(() => { loadReq(); }, [loadReq]);
  const open = requests.filter((r) => r.status === "pending");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Users" description={`${users?.length ?? "…"} accounts${pending ? ` · ${pending} awaiting approval` : ""}. Assign or revoke the Reviewer role, suspend accounts and grant packs. The Admin role belongs only to the platform owner and can’t be given to anyone.`}
        actions={<Button variant="outline" onClick={() => hw.util.download("users.csv", hw.util.toCSV(list.map(({ packs, ...u }) => ({ ...u, packs: packs.map((e) => `${e.pack}@${e.region}`).join(" ") }))))}><Download /> CSV</Button>} />
      {open.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2"><CardTitle className="text-base">Access requests ({open.length})</CardTitle><CardDescription>People asking for reviewer or admin access to this dashboard.</CardDescription></CardHeader>
          <CardContent className="flex flex-col divide-y p-0">
            {open.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <div className="min-w-0 flex-1"><p className="font-medium">{r.full_name || r.username} <span className="text-xs text-muted-foreground">@{r.username}</span></p>
                  <p className="text-sm text-muted-foreground">wants <Badge variant="secondary">{r.requested_role}</Badge> · {fmtDate(r.created_at)}{r.note ? ` · “${r.note}”` : ""}</p></div>
                <Button size="sm" onClick={() => act(async () => { await hw.api.admin.decideAccess(r.id, true); await Promise.all([loadReq(), load()]); }, `Approved: ${r.username} is now ${r.requested_role}`)}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => act(async () => { await hw.api.admin.decideAccess(r.id, false); await loadReq(); }, "Declined")}>Decline</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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
                <TableCell>{u.is_owner || u.role === "admin" ? <Badge className="gap-1"><Crown className="size-3" /> Admin (owner)</Badge>
                  : <NativeSelect value={u.role} className="w-32" aria-label="Role" onChange={(e) => act(async () => { await hw.api.admin.setUser(u.id, { role: e.target.value as Profile["role"] }); await load(); }, "Role updated")}>{[["user", "Observer"], ["reviewer", "Reviewer"]].map(([r, l]) => <option key={r} value={r}>{l}</option>)}</NativeSelect>}</TableCell>
                <TableCell>{u.is_owner || u.role === "admin" ? <span className="text-xs text-muted-foreground">always active</span> : <NativeSelect value={u.status} className="w-32" aria-label="Status" onChange={(e) => act(async () => { await hw.api.admin.setUser(u.id, { status: e.target.value as Profile["status"] }); await load(); }, "Status updated")}>{[["approved", "Active"], ["pending", "Pending"], ["blocked", "Suspended"]].map(([r, l]) => <option key={r} value={r}>{l}</option>)}</NativeSelect>}</TableCell>
                <TableCell>
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {u.packs.map((e) => (
                      <Badge key={e.id} variant="secondary" className="gap-1 font-normal">
                        <PackDot color={packs.find((p) => p.id === e.pack)?.color} /> {e.region}
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
          <div className="grid gap-1.5"><Label htmlFor="g-pack">Pack</Label><NativeSelect id="g-pack" value={pack} onChange={(e) => setPack(e.target.value)}>{packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></div>
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
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><PackDot color={p.color} className="size-2.5" />{p.name}</CardTitle><CardDescription>{p.blurb}</CardDescription></CardHeader>
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
                <TableCell><PackLabel id={p.pack} /></TableCell>
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
          <NativeSelect value={pack} onChange={(e) => setPack(e.target.value)} className="w-52" aria-label="Group"><option value="">All groups</option>{packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Review status"><option value="">Any review status</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></NativeSelect>
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

/* ═════════════ Audit log ═════════════ */
const ACTION_LABEL: Record<string, string> = { INSERT: "added", UPSERT: "set", UPDATE: "changed", DELETE: "removed" };
const TABLE_LABEL: Record<string, string> = { checklist: "Checklist", species: "Species", pack_prices: "Price", entitlements: "Pack access", profiles: "User" };
function auditSummary(e: import("@/lib/hw").AuditEntry, spName: (id: string) => string, regionName: (c: string) => string) {
  const n = e.new_row || {}, o = e.old_row || {};
  if (e.tbl === "checklist") { const [reg, sp] = e.row_key.split(":"); const st = (n as Record<string, string>).status; return `${spName(sp)} · ${regionName(reg)}${st ? ` → ${st}` : ""}${(o as Record<string, string>).status && st && (o as Record<string, string>).status !== st ? ` (was ${(o as Record<string, string>).status})` : ""}`; }
  if (e.tbl === "species") return spName(e.row_key) || String((n as Record<string, string>).common_name || (o as Record<string, string>).common_name || e.row_key);
  if (e.tbl === "profiles") return `@${(n as Record<string, string>).username || ""}: role ${(o as Record<string, string>).role} → ${(n as Record<string, string>).role}, status ${(o as Record<string, string>).status} → ${(n as Record<string, string>).status}`;
  if (e.tbl === "entitlements") return `${(n as Record<string, string>).pack_id || (o as Record<string, string>).pack_id} @ ${(n as Record<string, string>).region_code || (o as Record<string, string>).region_code} (${(n as Record<string, string>).source || ""})`;
  if (e.tbl === "pack_prices") return `${(n as Record<string, string>).pack_id || (o as Record<string, string>).pack_id} @ ${(n as Record<string, string>).region_code || (o as Record<string, string>).region_code}: ₹${Number((n as Record<string, number>).paise || 0) / 100}`;
  return e.row_key;
}
export function AuditPage() {
  const { hw, spById, regionName } = useData();
  const [rows, setRows] = React.useState<import("@/lib/hw").AuditEntry[] | null>(null);
  const [q, setQ] = React.useState("");
  React.useEffect(() => { hw.api.admin.auditLog(500).then(setRows).catch(() => setRows([])); }, [hw]);
  const sp = (id: string) => spById[id]?.common || id;
  const list = (rows || []).filter((e) => !q || `${e.actor_name} ${e.tbl} ${auditSummary(e, sp, regionName)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Audit log" description="Every change to core checklists, species, prices, pack access and user roles: who made it, and when. Kept by the database and readable only by admins."
        actions={<Button variant="outline" onClick={() => hw.util.download("audit-log.csv", hw.util.toCSV(list.map((e) => ({ at: e.at, by: e.actor_name, table: e.tbl, action: e.action, item: auditSummary(e, sp, regionName) }))))}><Download /> CSV</Button>} />
      <Card>
        <CardHeader className="p-4"><SearchInput value={q} onChange={setQ} placeholder="Filter by person, area or item…" /></CardHeader>
        {rows === null ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : !list.length ? <EmptyState icon={Route} title="No changes recorded yet">Edits made in this dashboard appear here.</EmptyState> : (
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Area</TableHead><TableHead>Change</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDateTime(e.at)}</TableCell>
                  <TableCell className="text-sm">{e.actor_name ? `@${e.actor_name}` : <span className="text-muted-foreground">system / SQL</span>}</TableCell>
                  <TableCell><Badge variant="secondary">{TABLE_LABEL[e.tbl] || e.tbl}</Badge></TableCell>
                  <TableCell className="text-sm"><span className="font-medium">{ACTION_LABEL[e.action] || e.action}</span> {auditSummary(e, sp, regionName)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ═════════════ Feedback inbox ═════════════ */
function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="whitespace-nowrap text-sm tracking-tight text-amber-500" aria-label={`${n} of 5`}>{"★".repeat(n)}<span className="text-border">{"★".repeat(5 - n)}</span></span>;
}
export function FeedbackPage() {
  const { hw, spById } = useData();
  const act = useAction();
  const [rows, setRows] = React.useState<import("@/lib/hw").FeedbackEntry[] | null>(null);
  const [filter, setFilter] = React.useState<"" | "new" | "read" | "done" | "corrections">("new");
  const load = React.useCallback(() => hw.api.admin.feedback().then(setRows).catch(() => setRows([])), [hw]);
  React.useEffect(() => { load(); }, [load]);
  const all = rows || [];
  const avg = (k: "r_guide" | "r_identify" | "r_recording" | "r_overall") => { const v = all.map((r) => r[k]).filter((x): x is number => !!x); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—"; };
  const list = all.filter((r) => !filter || (filter === "corrections" ? !!r.species_id : r.status === filter));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Feedback" description={<>Ratings and corrections sent from the <a className="text-primary hover:underline" href="../feedback.html" target="_blank" rel="noreferrer">feedback page</a> (linked in the app and on every species page).</>}
        actions={<Button variant="outline" onClick={() => hw.util.download("feedback.csv", hw.util.toCSV(all.map((r) => ({ ...r, species: r.species_id ? spById[r.species_id]?.common : "" }))))}><Download /> CSV</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Responses" value={num(all.length)} hint={`${all.filter((r) => r.status === "new").length} new`} icon={BarChart3} />
        <StatCard label="Overall" value={avg("r_overall")} hint="average of 5" icon={BarChart3} />
        <StatCard label="Field guide" value={avg("r_guide")} icon={BarChart3} />
        <StatCard label="Identification" value={avg("r_identify")} icon={BarChart3} />
        <StatCard label="Recording" value={avg("r_recording")} icon={BarChart3} />
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap gap-2 p-4">
          {([["new", "New"], ["read", "Read"], ["done", "Done"], ["corrections", "Species corrections"], ["", "All"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{l}</Button>
          ))}
        </CardHeader>
        {rows === null ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : !list.length ? <EmptyState icon={BarChart3} title="Nothing here">New feedback appears here as soon as it is sent.</EmptyState> : (
          <div className="divide-y">
            {list.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium">{r.name || "Anonymous"}</span>
                    {r.email && <a className="text-primary hover:underline" href={`mailto:${r.email}`}>{r.email}</a>}
                    <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Overall <Stars n={r.r_overall} /></span><span>Guide <Stars n={r.r_guide} /></span><span>ID <Stars n={r.r_identify} /></span><span>Recording <Stars n={r.r_recording} /></span>
                  </div>
                  {r.species_id && <p className="rounded-md bg-amber-500/10 p-2 text-sm"><b>Correction · {spById[r.species_id]?.common || r.species_id}:</b> {r.correction}</p>}
                  {r.comment && <p className="text-sm">{r.comment}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {(["new", "read", "done"] as const).map((st) => (
                    <Button key={st} size="sm" variant={r.status === st ? "secondary" : "ghost"} onClick={() => act(async () => { await hw.api.admin.setFeedbackStatus(r.id, st); await load(); })}>{st}</Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
