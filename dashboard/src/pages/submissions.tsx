import * as React from "react";
import { AlertTriangle, Check, Download, Eye, Inbox, MapPin, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, MapView, PageHeader, RegionSelect, ReviewBadge, SearchInput, SpeciesName } from "@/components/common";
import { useAction, useData } from "@/lib/store";
import { fmtDate, fmtDateTime, num, PROTOCOLS } from "@/lib/format";
import type { ReviewStatus, Sighting, Trip } from "@/lib/hw";

type Filters = { q: string; region: string; status: "" | ReviewStatus | "flagged"; protocol: string; from: string; to: string };

const tripStatus = (t: Trip): ReviewStatus | "mixed" => {
  const st = new Set(t.sightings.map((s) => s.review_status));
  if (!st.size) return "pending";
  return st.size === 1 ? [...st][0] : st.has("pending") ? "pending" : "mixed";
};

/** Loads the core checklist of every region that has submissions, to flag off-checklist records. */
function useCoreChecklists(regionCodes: string[]) {
  const { hw } = useData();
  const [map, setMap] = React.useState<Record<string, Set<string>>>({});
  const key = [...new Set(regionCodes)].sort().join(",");
  React.useEffect(() => {
    let off = false;
    const codes = key ? key.split(",") : [];
    Promise.all(codes.map(async (r) => [r, new Set(await hw.api.checklist(r))] as const)).then((rows) => { if (!off) setMap(Object.fromEntries(rows)); });
    return () => { off = true; };
  }, [key, hw]);
  return map;
}

export function SubmissionsPage({ initial }: { initial?: Partial<Filters> }) {
  const { trips, sightings, hw, reload, regionName, spById, packOf } = useData();
  const act = useAction();
  const [f, setF] = React.useState<Filters>({ q: "", region: "", status: "", protocol: "", from: "", to: "", ...initial });
  const [open, setOpen] = React.useState<Trip | null>(null);
  const core = useCoreChecklists(sightings.map((s) => s.region_code));
  const offList = React.useCallback((s: Sighting) => !!s.species_id && !!core[s.region_code] && !core[s.region_code].has(s.species_id), [core]);

  const inDate = (iso: string) => (!f.from || iso.slice(0, 10) >= f.from) && (!f.to || iso.slice(0, 10) <= f.to);
  const q = f.q.trim().toLowerCase();
  const matchQ = (t: Trip) => !q || [t.username, t.full_name, t.notes, ...t.sightings.map((s) => (s.species_id ? `${spById[s.species_id]?.common} ${spById[s.species_id]?.sci}` : s.species_text))]
    .some((x) => (x || "").toLowerCase().includes(q));

  const tripRows = trips.filter((t) => (!f.region || t.region_code === f.region) && (!f.protocol || t.protocol === f.protocol) && inDate(t.started_at) && matchQ(t)
    && (!f.status || (f.status === "flagged" ? t.sightings.some(offList) : t.sightings.some((s) => s.review_status === f.status))));
  const sightRows = sightings.filter((s) => (!f.region || s.region_code === f.region) && inDate(s.observed_at)
    && (!f.status || (f.status === "flagged" ? offList(s) : s.review_status === f.status))
    && (!q || `${s.username} ${s.species_id ? spById[s.species_id]?.common + " " + spById[s.species_id]?.sci : s.species_text} ${s.notes}`.toLowerCase().includes(q)));

  const refresh = () => reload(["submissions"]);
  const reviewTrip = (t: Trip, st: ReviewStatus) => act(async () => { await hw.api.admin.reviewTrip(t.id, st); await refresh(); }, `Checklist ${st}`);
  const reviewOne = (s: Sighting, st: ReviewStatus) => act(async () => { await hw.api.admin.review(s.id, st); await refresh(); });
  const pendingTrips = tripRows.filter((t) => tripStatus(t) === "pending");

  // keep the open sheet in sync after a reload
  const openTrip = open ? trips.find((t) => t.id === open.id) || null : null;

  const exportCsv = () => hw.util.download(`submissions-${new Date().toISOString().slice(0, 10)}.csv`, hw.util.toCSV(sightRows.map((s) => ({
    checklist_id: s.trip_id, observed_at: s.observed_at, observer: s.username, region: regionName(s.region_code), region_code: s.region_code,
    common_name: s.species_id ? spById[s.species_id]?.common : s.species_text, scientific_name: s.species_id ? spById[s.species_id]?.sci : "",
    group: s.species_id ? packOf(spById[s.species_id]?.pack).name : "", count: s.count, life_stage: s.life_stage, sex: s.sex, lat: s.lat, lng: s.lng,
    on_core_checklist: offList(s) ? "no" : "yes", review_status: s.review_status, notes: s.notes,
  }))));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Submissions"
        description="Every checklist and sighting submitted from the field app. Review them, flag records outside the core checklist, and export."
        actions={<>
          {pendingTrips.length > 0 && (
            <Button variant="outline" onClick={() => { if (confirm(`Accept all ${pendingTrips.length} pending checklists shown?`)) act(async () => { for (const t of pendingTrips) await hw.api.admin.reviewTrip(t.id, "accepted"); await refresh(); }, "Accepted"); }}>
              <Check /> Accept {pendingTrips.length} pending
            </Button>
          )}
          <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
        </>}
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput className="lg:col-span-2" value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Observer, species, notes…" />
          <RegionSelect value={f.region} onChange={(region) => setF({ ...f, region })} allowAll />
          <NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Filters["status"] })} aria-label="Review status">
            <option value="">Any status</option><option value="pending">Pending review</option><option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option><option value="flagged">⚑ Not on core checklist</option>
          </NativeSelect>
          <div className="flex items-center gap-2 lg:col-span-2">
            <Label htmlFor="f-from" className="sr-only">From</Label>
            <Input id="f-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From date" />
            <span className="text-muted-foreground">–</span>
            <Input id="f-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To date" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="checklists">
        <TabsList>
          <TabsTrigger value="checklists">Checklists <Badge variant="secondary" className="ml-1 px-1.5">{tripRows.length}</Badge></TabsTrigger>
          <TabsTrigger value="sightings">Sightings <Badge variant="secondary" className="ml-1 px-1.5">{sightRows.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="checklists">
          <Card>
            {tripRows.length === 0 ? <EmptyState icon={Inbox} title="No checklists match">Try clearing the filters.</EmptyState> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Observer</TableHead><TableHead>Region</TableHead><TableHead>Protocol</TableHead>
                    <TableHead className="text-right">Species</TableHead><TableHead className="text-right">Indiv.</TableHead><TableHead className="hidden xl:table-cell">Effort</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tripRows.slice(0, 500).map((t) => {
                    const flagged = t.sightings.filter(offList).length;
                    return (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpen(t)}>
                        <TableCell className="whitespace-nowrap">{fmtDate(t.started_at)}</TableCell>
                        <TableCell><span className="font-medium">{t.full_name || t.username}</span><span className="block text-xs text-muted-foreground">@{t.username}</span></TableCell>
                        <TableCell className="whitespace-nowrap">{regionName(t.region_code)}</TableCell>
                        <TableCell><span className="whitespace-nowrap">{PROTOCOLS[t.protocol] || t.protocol}</span>{t.complete && <span className="block text-xs text-primary">complete list</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.sightings.length}{flagged > 0 && <span title={`${flagged} not on core checklist`} className="ml-1 text-warning">⚑{flagged}</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(t.sightings.reduce((a, s) => a + s.count, 0))}</TableCell>
                        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">{t.duration_min ?? 0} min · {t.distance_km ?? 0} km · {t.observers ?? 1} obs.</TableCell>
                        <TableCell><ReviewBadge status={tripStatus(t)} /></TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="size-8" title="View" onClick={() => setOpen(t)}><Eye /></Button>
                            <Button size="icon" variant="ghost" className="size-8 text-primary" title="Accept all" onClick={() => reviewTrip(t, "accepted")}><Check /></Button>
                            <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Reject all" onClick={() => reviewTrip(t, "rejected")}><X /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="sightings">
          <Card>
            {sightRows.length === 0 ? <EmptyState icon={Inbox} title="No sightings match" /> : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Date</TableHead><TableHead>Species</TableHead><TableHead className="text-right">#</TableHead><TableHead>Region</TableHead><TableHead>Observer</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Review</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {sightRows.slice(0, 800).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(s.observed_at)}</TableCell>
                      <TableCell>
                        <SpeciesName id={s.species_id} text={s.species_text} />
                        {offList(s) && <span className="mt-0.5 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3" /> Not on {regionName(s.region_code)} checklist</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                      <TableCell className="whitespace-nowrap">{regionName(s.region_code)}</TableCell>
                      <TableCell>@{s.username}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{s.lat != null ? <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}>{(+s.lat).toFixed(4)}, {(+s.lng!).toFixed(4)}</a> : "—"}</TableCell>
                      <TableCell><ReviewBadge status={s.review_status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant={s.review_status === "accepted" ? "default" : "ghost"} className="size-8" title="Accept" onClick={() => reviewOne(s, "accepted")}><Check /></Button>
                          <Button size="icon" variant={s.review_status === "rejected" ? "destructive" : "ghost"} className="size-8" title="Reject" onClick={() => reviewOne(s, "rejected")}><X /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!openTrip} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {openTrip && (
            <TripDetail trip={openTrip} offList={offList}
              onReview={(st) => reviewTrip(openTrip, st)} onReviewOne={reviewOne}
              onDelete={() => { if (confirm("Delete this checklist and all its sightings permanently?")) act(async () => { await hw.api.admin.deleteTrip(openTrip.id); setOpen(null); await refresh(); }, "Checklist deleted"); }} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TripDetail({ trip, offList, onReview, onReviewOne, onDelete }: { trip: Trip; offList: (s: Sighting) => boolean; onReview: (s: ReviewStatus) => void; onReviewOne: (s: Sighting, st: ReviewStatus) => void; onDelete: () => void }) {
  const { regionName, spById, packOf } = useData();
  const points = trip.sightings.filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng!, color: packOf(s.species_id ? spById[s.species_id]?.pack : "").color, label: `${s.species_id ? spById[s.species_id]?.common : s.species_text} ×${s.count}` }));
  return (
    <div className="flex flex-col gap-4">
      <SheetHeader className="pr-8">
        <SheetTitle>{PROTOCOLS[trip.protocol] || trip.protocol} checklist</SheetTitle>
        <SheetDescription>{regionName(trip.region_code)} · {fmtDateTime(trip.started_at)} · by {trip.full_name || trip.username}</SheetDescription>
      </SheetHeader>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[[trip.sightings.length, "species"], [trip.sightings.reduce((a, s) => a + s.count, 0), "individuals"], [`${trip.duration_min ?? 0}m`, "duration"], [`${trip.distance_km ?? 0}`, "km"]].map(([v, l]) => (
          <div key={String(l)} className="rounded-lg border bg-muted/40 p-2"><p className="font-mono text-lg font-semibold">{v}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{trip.observers ?? 1} observer(s)</Badge>
        <Badge variant={trip.complete ? "success" : "outline"}>{trip.complete ? "Complete checklist" : "Incomplete / incidental"}</Badge>
        {trip.lat != null && <Badge variant="outline"><MapPin className="mr-1 size-3" />{(+trip.lat).toFixed(4)}, {(+trip.lng!).toFixed(4)}</Badge>}
      </div>
      {(points.length > 0 || (trip.track?.length ?? 0) > 1) && <MapView height={240} points={points} tracks={trip.track && trip.track.length > 1 ? [{ coords: trip.track, label: "Track", color: "#2f7d4f" }] : []} />}
      {trip.notes && <p className="rounded-md bg-muted/50 p-3 text-sm">{trip.notes}</p>}
      <div className="flex flex-col divide-y rounded-lg border">
        {trip.sightings.map((s) => (
          <div key={s.id} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><SpeciesName id={s.species_id} text={s.species_text} compact /><span className="font-mono text-sm">×{s.count}</span></div>
              <p className="text-xs text-muted-foreground">{[s.life_stage, s.sex, s.notes].filter(Boolean).join(" · ") || (s.species_id ? spById[s.species_id]?.sci : "")}</p>
              {offList(s) && <p className="mt-1 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="size-3" /> Not on the core checklist for {regionName(s.region_code)}. Verify, or add it to the checklist.</p>}
              {(s.photos?.length ?? 0) > 0 && <div className="mt-2 flex gap-2">{s.photos!.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" className="size-14 rounded-md object-cover" /></a>)}</div>}
            </div>
            <ReviewBadge status={s.review_status} />
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="size-8 text-primary" title="Accept" onClick={() => onReviewOne(s, "accepted")}><Check /></Button>
              <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Reject" onClick={() => onReviewOne(s, "rejected")}><X /></Button>
            </div>
          </div>
        ))}
        {!trip.sightings.length && <p className="p-4 text-sm text-muted-foreground">Empty checklist (no species reported).</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onReview("accepted")}><Check /> Accept all</Button>
        <Button variant="outline" onClick={() => onReview("rejected")}><X /> Reject all</Button>
        <Button variant="ghost" className="ml-auto text-destructive" onClick={onDelete}><Trash2 /> Delete</Button>
      </div>
    </div>
  );
}
