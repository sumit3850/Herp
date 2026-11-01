import * as React from "react";
import { AlertTriangle, Check, Copy, Download, Eye, HelpCircle, History, Inbox, MapPin, MessageSquare, RotateCcw, Replace, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, MapView, OffListFlag, PageHeader, RegionSelect, ReviewBadge, SearchInput, SpeciesName } from "@/components/common";
import { useAction, useData } from "@/lib/store";
import { fmtDate, fmtDateTime, num, PROTOCOLS } from "@/lib/format";
import type { ReviewAction, ReviewStatus, Sighting, Trip } from "@/lib/hw";

type Filters = { q: string; region: string; status: "" | ReviewStatus | "flagged"; type: string; from: string; to: string };

const STATUS_OPTS: [ReviewStatus, string][] = [["pending", "Pending review"], ["verified", "Verified"], ["needs_id", "Needs identification"], ["more_info", "More info required"], ["rejected", "Rejected"]];
const ACTION_LABEL: Record<string, string> = {
  verify: "Verified", reject: "Rejected", needs_id: "Marked “needs identification”", more_info: "Requested more information", suggest_id: "Suggested an identification",
  reidentify: "Changed the identification", duplicate: "Marked as duplicate", comment: "Comment", reopen: "Re-opened for review",
};
const REASONS = [
  "Photo needed to confirm this species",
  "Identification doesn't match the photo / description",
  "Outside the known range: please add a photo or details",
  "Location looks wrong (check GPS)",
  "Captive / released animal recorded as wild",
];

const tripStatus = (t: Trip): ReviewStatus | "mixed" => {
  const st = new Set(t.sightings.map((s) => s.review_status));
  if (!st.size) return "pending";
  return st.size === 1 ? [...st][0] : st.has("pending") ? "pending" : "mixed";
};

/** Loads the checklist of every region that has submissions, to flag off-checklist records. */
function useCoreChecklists(regionCodes: string[]) {
  const { hw } = useData();
  const [map, setMap] = React.useState<Record<string, Set<string>>>({});
  const key = [...new Set(regionCodes.filter(Boolean))].sort().join(",");
  React.useEffect(() => {
    let off = false;
    const codes = key ? key.split(",") : [];
    Promise.all(codes.map(async (r) => [r, new Set(await hw.api.checklist(r))] as const)).then((rows) => { if (!off) setMap(Object.fromEntries(rows)); });
    return () => { off = true; };
  }, [key, hw]);
  return map;
}

export function SubmissionsPage({ initial }: { initial?: Partial<Filters> }) {
  const { trips, sightings, hw, reload, regionName, spById } = useData();
  const act = useAction();
  const [f, setF] = React.useState<Filters>({ q: "", region: "", status: "pending", type: "", from: "", to: "", ...initial });
  const [openTrip, setOpenTrip] = React.useState<string | null>(null);
  const [openObs, setOpenObs] = React.useState<string | null>(null);
  const core = useCoreChecklists(sightings.map((s) => s.region_code));
  const offList = React.useCallback((s: Sighting) => !!s.species_id && !!core[s.region_code] && !core[s.region_code].has(s.species_id), [core]);
  const ST = hw.SURVEY_TYPES || {};

  const inDate = (iso: string) => (!f.from || iso.slice(0, 10) >= f.from) && (!f.to || iso.slice(0, 10) <= f.to);
  const inRegion = (codes: (string | null | undefined)[]) => !f.region || codes.includes(f.region);
  const q = f.q.trim().toLowerCase();
  const spText = (s: Sighting) => (s.species_id ? `${spById[s.species_id]?.common} ${spById[s.species_id]?.sci}` : s.species_text || "");
  const matchStatus = (s: Sighting) => !f.status || (f.status === "flagged" ? offList(s) : s.review_status === f.status);

  const sightRows = sightings.filter((s) => inRegion([s.region_code, s.state_code, s.district_code, s.island_code]) && inDate(s.observed_at) && matchStatus(s)
    && (!q || `${s.username} ${s.full_name} ${spText(s)} ${s.notes} ${s.location_name}`.toLowerCase().includes(q)));
  const tripRows = trips.filter((t) => inRegion([t.region_code, t.state_code, t.district_code, t.island_code]) && (!f.type || t.survey_type === f.type) && inDate(t.started_at)
    && (!f.status || t.sightings.some(matchStatus))
    && (!q || [t.username, t.full_name, t.notes, t.title, t.location_name, ...t.sightings.map(spText)].some((x) => (x || "").toLowerCase().includes(q))));

  const refresh = () => reload(["submissions"]);
  const counts = Object.fromEntries(STATUS_OPTS.map(([k]) => [k, sightings.filter((s) => s.review_status === k).length]));
  const pendingShown = sightRows.filter((s) => s.review_status === "pending");

  const exportCsv = () => hw.util.download(`observations-${new Date().toISOString().slice(0, 10)}.csv`, hw.util.toCSV(sightRows.map((s) => ({
    observation_id: s.id, session_id: s.trip_id, observed_at: s.observed_at, observer: s.username, common_name: s.species_id ? spById[s.species_id]?.common : s.species_text,
    scientific_name: s.species_id ? spById[s.species_id]?.sci : "", family: s.species_id ? spById[s.species_id]?.family : "",
    original_identification: s.original_species_id || s.original_species_text || "", count: s.count, life_stage: s.life_stage, sex: s.sex, evidence: s.evidence, condition: s.mortality,
    origin: s.origin, id_confidence: s.id_confidence, lat: s.lat, lng: s.lng, accuracy_m: s.accuracy_m, elevation_m: s.elevation_m, location: s.location_name,
    state: regionName(s.state_code), district: s.district_code ? regionName(s.district_code) : "", island: s.island_code ? regionName(s.island_code) : "",
    habitat: s.habitat, microhabitat: s.microhabitat, behaviour: s.behaviour, weather: s.weather, temperature_c: s.temperature_c, privacy: s.privacy,
    on_checklist: offList(s) ? "no" : "yes", verification_status: s.review_status, reviewer_note: s.review_note, notes: s.notes,
    photos: (s.photo_rows || []).map((p) => p.url).concat(s.photos || []).filter((v, i, a) => a.indexOf(v) === i).join(" "),
  }))));

  const obs = openObs ? sightings.find((s) => s.id === openObs) || null : null;
  const trip = openTrip ? trips.find((t) => t.id === openTrip) || null : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Observations"
        description="Everything submitted from the field app. Verify records, ask for more information or a better photo, or correct the identification. The observer’s original identification is always kept."
        actions={<>
          {pendingShown.length > 0 && (
            <Button variant="outline" onClick={() => { if (confirm(`Verify all ${pendingShown.length} pending observations shown? Only do this if you have checked them.`)) act(async () => { for (const s of pendingShown) await hw.api.admin.reviewObservation(s.id, "verify"); await refresh(); }, "Verified"); }}>
              <Check /> Verify {pendingShown.length} shown
            </Button>
          )}
          <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
        </>}
      />

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setF({ ...f, status: "" })} className={`rounded-full border px-3 py-1 text-sm ${!f.status ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}>All {sightings.length}</button>
        {STATUS_OPTS.map(([k, l]) => <button key={k} onClick={() => setF({ ...f, status: k })} className={`rounded-full border px-3 py-1 text-sm ${f.status === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}>{l} <b className="tabular-nums">{counts[k]}</b></button>)}
        <button onClick={() => setF({ ...f, status: "flagged" })} className={`rounded-full border px-3 py-1 text-sm ${f.status === "flagged" ? "border-amber-500 bg-amber-500/10" : "hover:bg-accent"}`}><AlertTriangle className="mr-1 inline size-3.5 text-amber-500" />Off checklist</button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchInput className="lg:col-span-2" value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="Observer, species, place, notes…" />
          <RegionSelect value={f.region} onChange={(region) => setF({ ...f, region })} allowAll />
          <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Survey type">
            <option value="">Any survey type</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <div className="flex items-center gap-2 lg:col-span-2">
            <Label htmlFor="f-from" className="sr-only">From</Label>
            <Input id="f-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From date" />
            <span className="text-muted-foreground">–</span>
            <Input id="f-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To date" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="obs">
        <TabsList>
          <TabsTrigger value="obs">Observations <Badge variant="secondary" className="ml-1 px-1.5">{sightRows.length}</Badge></TabsTrigger>
          <TabsTrigger value="sessions">Sessions <Badge variant="secondary" className="ml-1 px-1.5">{tripRows.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="obs">
          <Card>
            {sightRows.length === 0 ? <EmptyState icon={Inbox} title="Nothing to review here">Try another status or clear the filters.</EmptyState> : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="w-14" /><TableHead>Species</TableHead><TableHead className="text-right">#</TableHead><TableHead>When</TableHead><TableHead>Where</TableHead><TableHead>Observer</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Review</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {sightRows.slice(0, 800).map((s) => {
                    const ph = s.photo_rows?.[0]?.url || s.photos?.[0];
                    const changed = s.original_species_id !== undefined && (s.original_species_id || s.original_species_text) && (s.original_species_id !== s.species_id);
                    return (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpenObs(s.id)}>
                        <TableCell>{ph ? <img src={ph} alt="" className="size-10 rounded-md object-cover" /> : <div className="grid size-10 place-items-center rounded-md bg-muted text-[10px] text-muted-foreground">no photo</div>}</TableCell>
                        <TableCell>
                          <SpeciesName id={s.species_id} text={s.species_text} />
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                            {s.evidence && s.evidence !== "direct" && <span>{hw.EVIDENCE?.[s.evidence] || s.evidence}</span>}
                            {s.mortality && <span className="text-destructive">{s.mortality === "roadkill" ? "Road-kill" : "Dead"}</span>}
                            {s.id_confidence && s.id_confidence !== "certain" && <span>{s.id_confidence}</span>}
                            {changed && <span className="text-primary">ID changed</span>}
                            {offList(s) && <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3" /> off checklist</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(s.observed_at)}</TableCell>
                        <TableCell className="max-w-48 truncate">{s.location_name || regionName(s.island_code || s.district_code || s.state_code || s.region_code)}</TableCell>
                        <TableCell>@{s.username}</TableCell>
                        <TableCell><ReviewBadge status={s.review_status} /></TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant={s.review_status === "verified" ? "default" : "ghost"} className="size-8" title="Verify" onClick={() => act(async () => { await hw.api.admin.reviewObservation(s.id, "verify"); await refresh(); })}><Check /></Button>
                            <Button size="icon" variant="ghost" className="size-8" title="Open review" onClick={() => setOpenObs(s.id)}><Eye /></Button>
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

        <TabsContent value="sessions">
          <Card>
            {tripRows.length === 0 ? <EmptyState icon={Inbox} title="No sessions match">Try clearing the filters.</EmptyState> : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Date</TableHead><TableHead>Observer</TableHead><TableHead>Survey</TableHead><TableHead>Where</TableHead><TableHead className="text-right">Obs.</TableHead><TableHead className="hidden xl:table-cell">Effort</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {tripRows.slice(0, 500).map((t) => {
                    const flagged = t.sightings.filter(offList).length;
                    return (
                      <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenTrip(t.id)}>
                        <TableCell className="whitespace-nowrap">{fmtDateTime(t.started_at)}</TableCell>
                        <TableCell><span className="font-medium">{t.full_name || t.username}</span><span className="block text-xs text-muted-foreground">@{t.username}</span></TableCell>
                        <TableCell><span className="whitespace-nowrap">{(t.survey_type && ST[t.survey_type]) || PROTOCOLS[t.protocol] || t.protocol}</span>{t.title && <span className="block text-xs text-muted-foreground">{t.title}</span>}</TableCell>
                        <TableCell className="max-w-48 truncate">{t.location_name || regionName(t.island_code || t.district_code || t.state_code || t.region_code)}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.sightings.length}{flagged > 0 && <OffListFlag n={flagged} title={`${flagged} not on the checklist`} />}</TableCell>
                        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">{t.duration_min ?? 0} min · {t.distance_km ?? 0} km · {t.observers ?? 1} obs.</TableCell>
                        <TableCell><ReviewBadge status={tripStatus(t)} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!trip} onOpenChange={(o) => !o && setOpenTrip(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {trip && <TripDetail trip={trip} offList={offList} onOpen={(id) => { setOpenTrip(null); setOpenObs(id); }}
            onVerifyAll={() => act(async () => { for (const s of trip.sightings) if (s.review_status === "pending") await hw.api.admin.reviewObservation(s.id, "verify"); await refresh(); }, "Pending records verified")}
            onDelete={() => { if (confirm("Delete this session and all its observations permanently?")) act(async () => { await hw.api.admin.deleteTrip(trip.id); setOpenTrip(null); await refresh(); }, "Session deleted"); }} />}
        </SheetContent>
      </Sheet>
      <Sheet open={!!obs} onOpenChange={(o) => !o && setOpenObs(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {obs && <ObservationReview s={obs} offList={offList(obs)} onDone={refresh} onClose={() => setOpenObs(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ObservationReview({ s, offList, onDone, onClose }: { s: Sighting; offList: boolean; onDone: () => Promise<void>; onClose: () => void }) {
  const { hw, isAdmin, regionName, spById, species, sightings } = useData();
  const act = useAction();
  const [comment, setComment] = React.useState("");
  const [mode, setMode] = React.useState<null | "reidentify" | "suggest_id" | "duplicate">(null);
  const [spQ, setSpQ] = React.useState("");
  const [spPick, setSpPick] = React.useState<string>("");
  const [dup, setDup] = React.useState("");
  React.useEffect(() => { setComment(""); setMode(null); setSpPick(""); setSpQ(""); }, [s.id]);
  const sp = s.species_id ? spById[s.species_id] : undefined;
  const origName = s.original_species_id ? spById[s.original_species_id]?.common || s.original_species_id : s.original_species_text;
  const changed = (s.original_species_id || s.original_species_text) && (s.original_species_id || null) !== (s.species_id || null);
  const photos = [...new Set([...(s.photo_rows || []).map((p) => p.url), ...(s.photos || [])])];
  const history = (s.reviews || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const run = (action: ReviewAction, species: string | null = null, note = comment, dupOf: string | null = null, msg?: string) =>
    act(async () => { await hw.api.admin.reviewObservation(s.id, action, species, note.trim(), dupOf); setComment(""); setMode(null); await onDone(); }, msg || ACTION_LABEL[action]);
  const needComment = (a: ReviewAction) => { if (!comment.trim()) { alert("Add a comment for the observer first (it is shown in their app)."); return false; } return run(a), true; };
  const hits = spQ.trim().length > 1 ? species.filter((x) => `${x.common} ${x.sci} ${x.family}`.toLowerCase().includes(spQ.toLowerCase())).slice(0, 8) : [];
  const dupCands = sightings.filter((x) => x.id !== s.id && x.species_id === s.species_id && x.species_id && Math.abs(new Date(x.observed_at).getTime() - new Date(s.observed_at).getTime()) < 3 * 864e5).slice(0, 10);
  const row = (k: string, v: React.ReactNode) => (v || v === 0 ? <><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></> : null);
  return (
    <div className="flex flex-col gap-4">
      <SheetHeader className="pr-8">
        <div className="flex items-center gap-2"><ReviewBadge status={s.review_status} />{s.privacy && s.privacy !== "public" && <Badge variant="outline">{s.privacy}</Badge>}{sp?.sensitive && <Badge variant="warning">Sensitive species</Badge>}</div>
        <SheetTitle className="text-xl">{sp ? sp.common : s.species_text || "Unidentified"}{s.count > 1 ? ` ×${s.count}` : ""}</SheetTitle>
        <SheetDescription>{sp ? <i>{sp.sci}</i> : "Not matched to a catalogue species"}{sp ? ` · ${sp.family}` : ""} · by {s.full_name || s.username} (@{s.username})</SheetDescription>
      </SheetHeader>
      {changed && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><History className="mr-1 inline size-4" />Observer’s original identification: <b>{origName}</b>. It is kept in the record and exports.</div>}
      {offList && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><AlertTriangle className="mr-1 inline size-4 text-amber-500" />Not on the {regionName(s.region_code)} checklist. Check carefully, then add it to the checklist if confirmed.</div>}
      {photos.length > 0 ? <div className="grid grid-cols-3 gap-2">{photos.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="aspect-square w-full rounded-md object-cover" /></a>)}</div>
        : <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">No photos attached.</p>}
      {s.lat != null && <MapView height={180} points={[{ lat: s.lat, lng: s.lng!, color: "#c53030", label: sp?.common || s.species_text || "" }]} />}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {row("When", fmtDateTime(s.observed_at))}
        {row("Where", [s.location_name, s.island_code && regionName(s.island_code), s.district_code && regionName(s.district_code), s.state_code && regionName(s.state_code)].filter(Boolean).join(" · "))}
        {s.lat != null && row("GPS", <a className="font-mono text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}>{(+s.lat).toFixed(5)}, {(+s.lng!).toFixed(5)}{s.accuracy_m != null ? ` ±${Math.round(+s.accuracy_m)} m` : ""}{s.elevation_m != null ? ` · ${Math.round(+s.elevation_m)} m` : ""}</a>)}
        {row("Evidence", s.evidence && (hw.EVIDENCE?.[s.evidence] || s.evidence))}{row("Confidence", s.id_confidence)}{row("Life stage", s.life_stage)}{row("Sex", s.sex)}
        {row("Condition", s.mortality ? (s.mortality === "roadkill" ? "Road-kill" : `Dead (${s.mortality})`) : "")}{row("Origin", s.origin && s.origin !== "wild" ? s.origin : "")}
        {row("Habitat", [s.habitat, s.microhabitat].filter(Boolean).join(" · "))}{row("Behaviour", [s.behaviour, s.activity].filter(Boolean).join(" · "))}
        {row("Weather", [s.weather, s.temperature_c != null ? `${s.temperature_c} °C` : ""].filter(Boolean).join(" · "))}{row("Notes", s.notes)}
        {row("Duplicate of", s.duplicate_of)}
      </dl>

      <div className="rounded-lg border p-3">
        <Label htmlFor="rv-c" className="text-sm font-medium">Comment for the observer</Label>
        <div className="mt-2 flex flex-wrap gap-1.5">{REASONS.map((r) => <button key={r} type="button" onClick={() => setComment(r)} className={`rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent ${comment === r ? "border-primary bg-primary/10" : ""}`}>{r}</button>)}</div>
        <Textarea id="rv-c" className="mt-2" rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Shown to the observer next to the record" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run("verify")}><Check /> Verify</Button>
          <Button size="sm" variant="outline" onClick={() => needComment("needs_id")}><HelpCircle /> Needs ID</Button>
          <Button size="sm" variant="outline" onClick={() => needComment("more_info")}><MessageSquare /> Ask for info</Button>
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "reidentify" ? null : "reidentify")}><Replace /> Change ID</Button>
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "suggest_id" ? null : "suggest_id")}>Suggest ID</Button>
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "duplicate" ? null : "duplicate")}><Copy /> Duplicate</Button>
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => needComment("reject")}><X /> Reject</Button>
          <Button size="sm" variant="ghost" disabled={!comment.trim()} onClick={() => run("comment")}>Comment only</Button>
          {s.review_status !== "pending" && <Button size="sm" variant="ghost" onClick={() => run("reopen")}><RotateCcw /> Re-open</Button>}
        </div>
        {(mode === "reidentify" || mode === "suggest_id") && (
          <div className="mt-3 rounded-md bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{mode === "reidentify" ? "Changes the species and verifies the record. The observer’s original ID stays on file." : "Suggests a species to the observer (status: needs identification). A comment is required."}</p>
            <Input className="mt-2" value={spQ} onChange={(e) => setSpQ(e.target.value)} placeholder="Search species…" autoFocus />
            <div className="mt-1 flex flex-col">{hits.map((x) => <button key={x.id} type="button" onClick={() => { setSpPick(x.id); setSpQ(`${x.common} (${x.sci})`); }} className={`rounded px-2 py-1 text-left text-sm hover:bg-accent ${spPick === x.id ? "bg-primary/10" : ""}`}>{x.common} <i className="text-muted-foreground">{x.sci}</i></button>)}</div>
            <Button size="sm" className="mt-2" disabled={!spPick} onClick={() => { if (mode === "suggest_id" && !comment.trim()) return alert("Add a comment for the observer."); run(mode, spPick); }}>{mode === "reidentify" ? "Change identification" : "Send suggestion"}</Button>
          </div>
        )}
        {mode === "duplicate" && (
          <div className="mt-3 rounded-md bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Marks this record as a duplicate (rejected) and links it to the original.</p>
            <NativeSelect className="mt-2" value={dup} onChange={(e) => setDup(e.target.value)} aria-label="Original record">
              <option value="">Choose the original record…</option>
              {dupCands.map((x) => <option key={x.id} value={x.id}>{fmtDateTime(x.observed_at)} · @{x.username} · ×{x.count}</option>)}
            </NativeSelect>
            <Input className="mt-2" value={dup} onChange={(e) => setDup(e.target.value)} placeholder="…or paste the original observation ID" />
            <Button size="sm" className="mt-2" disabled={!dup} onClick={() => run("duplicate", null, comment || "Duplicate record", dup)}>Mark as duplicate</Button>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Review history</h4>
        {history.length ? <ol className="space-y-2 border-l pl-4 text-sm">{history.map((r) => (
          <li key={r.id}><b>{ACTION_LABEL[r.action] || r.action}</b>{r.to_species_id && <> → {spById[r.to_species_id]?.common || r.to_species_id}</>}
            <span className="block text-xs text-muted-foreground">{fmtDateTime(r.created_at)}{r.reviewer_name ? ` · @${r.reviewer_name}` : ""}{r.from_species_id && r.to_species_id ? ` · was ${spById[r.from_species_id]?.common || r.from_species_id}` : ""}</span>
            {r.comment && <span className="block">{r.comment}</span>}</li>))}</ol>
          : <p className="text-sm text-muted-foreground">No reviews yet.</p>}
      </div>
      {isAdmin && <Button variant="ghost" className="self-start text-destructive" onClick={() => { if (confirm("Delete this observation permanently? (Audit log keeps a copy.)")) act(async () => { await hw.api.admin.deleteSighting(s.id); onClose(); await onDone(); }, "Deleted"); }}><Trash2 /> Delete observation</Button>}
    </div>
  );
}

function TripDetail({ trip, offList, onOpen, onVerifyAll, onDelete }: { trip: Trip; offList: (s: Sighting) => boolean; onOpen: (id: string) => void; onVerifyAll: () => void; onDelete: () => void }) {
  const { hw, isAdmin, regionName, spById, packOf } = useData();
  const points = trip.sightings.filter((s) => s.lat != null).map((s) => ({ lat: s.lat!, lng: s.lng!, color: packOf(s.species_id ? spById[s.species_id]?.pack : "").color, label: `${s.species_id ? spById[s.species_id]?.common : s.species_text} ×${s.count}` }));
  const ST = hw.SURVEY_TYPES || {};
  return (
    <div className="flex flex-col gap-4">
      <SheetHeader className="pr-8">
        <SheetTitle>{trip.title || (trip.survey_type && ST[trip.survey_type]) || PROTOCOLS[trip.protocol] || "Session"}</SheetTitle>
        <SheetDescription>{(trip.survey_type && ST[trip.survey_type]) || ""} · {fmtDateTime(trip.started_at)} · by {trip.full_name || trip.username}</SheetDescription>
      </SheetHeader>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[[trip.sightings.length, "observations"], [num(trip.sightings.reduce((a, s) => a + s.count, 0)), "individuals"], [`${trip.duration_min ?? 0}m`, "duration"], [`${trip.distance_km ?? 0}`, "km"]].map(([v, l]) => (
          <div key={String(l)} className="rounded-lg border bg-muted/40 p-2"><p className="font-mono text-lg font-semibold">{v}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{trip.observers ?? 1} observer(s)</Badge>
        <Badge variant={trip.complete ? "success" : "outline"}>{trip.complete ? "Complete list" : "Incomplete list"}</Badge>
        {trip.weather && <Badge variant="outline">{trip.weather}</Badge>}
        {trip.lat != null && <Badge variant="outline"><MapPin className="mr-1 size-3" />{(+trip.lat).toFixed(4)}, {(+trip.lng!).toFixed(4)}{trip.start_elevation_m != null ? ` · ${trip.start_elevation_m} m` : ""}</Badge>}
        {(trip.location_name || trip.state_code) && <Badge variant="outline">{[trip.location_name, trip.island_code && regionName(trip.island_code), trip.state_code && regionName(trip.state_code)].filter(Boolean).join(" · ")}</Badge>}
      </div>
      {(points.length > 0 || (trip.track?.length ?? 0) > 1) && <MapView height={240} points={points} tracks={trip.track && trip.track.length > 1 ? [{ coords: trip.track, label: "Route", color: "#2f7d4f" }] : []} />}
      {trip.notes && <p className="rounded-md bg-muted/50 p-3 text-sm">{trip.notes}</p>}
      <div className="flex flex-col divide-y rounded-lg border">
        {trip.sightings.map((s) => (
          <button key={s.id} type="button" onClick={() => onOpen(s.id)} className="flex items-start gap-3 p-3 text-left hover:bg-accent/50">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2"><SpeciesName id={s.species_id} text={s.species_text} compact /><span className="font-mono text-sm">×{s.count}</span></div>
              <p className="text-xs text-muted-foreground">{fmtDateTime(s.observed_at)} · {[s.evidence !== "direct" && s.evidence, s.life_stage, s.notes].filter(Boolean).join(" · ")}</p>
              {offList(s) && <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="size-3" /> Not on the {regionName(s.region_code)} checklist</p>}
            </div>
            <ReviewBadge status={s.review_status} />
          </button>
        ))}
        {!trip.sightings.length && <p className="p-4 text-sm text-muted-foreground">No observations in this session.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onVerifyAll}><Check /> Verify pending</Button>
        {isAdmin && <Button variant="ghost" className="ml-auto text-destructive" onClick={onDelete}><Trash2 /> Delete session</Button>}
      </div>
    </div>
  );
}
