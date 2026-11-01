import * as React from "react";
import { ClipboardPaste, Copy, Download, ListPlus, Plus, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, IucnBadge, PackDot, PackLabel, PageHeader, RegionSelect, SearchInput, VenomBadge } from "@/components/common";
import { useAction, useData } from "@/lib/store";
import { CHECKLIST_STATUSES, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChecklistEntry, ChecklistStatus, Species } from "@/lib/hw";
import type { NavId } from "@/components/ui/app-1-utils/app-1-data";

export function ChecklistsPage({ initialRegion, go }: { initialRegion?: string; go: (id: NavId, q?: Record<string, string>) => void }) {
  const { hw, regions, species, sightings, packs, spById, regionName, reload, isAdmin } = useData();
  const act = useAction();
  const [region, setRegion] = React.useState(initialRegion || hw.C.DEFAULT_REGION || "IN");
  const [entries, setEntries] = React.useState<ChecklistEntry[] | null>(null);
  const [q, setQ] = React.useState("");
  const [rq, setRq] = React.useState("");
  const [pack, setPack] = React.useState("");
  const [dialog, setDialog] = React.useState<null | "add" | "paste" | "copy">(null);

  const load = React.useCallback(async () => setEntries(await hw.api.admin.checklistEntries(region)), [hw, region]);
  React.useEffect(() => { setEntries(null); load(); }, [load]);

  const inList = React.useMemo(() => new Set((entries || []).map((e) => e.species_id)), [entries]);
  const recHere = React.useMemo(() => {
    const m: Record<string, { n: number; last: string }> = {};
    sightings.filter((s) => s.region_code === region && s.species_id && s.review_status !== "rejected").forEach((s) => {
      const r = (m[s.species_id!] ||= { n: 0, last: "" });
      r.n += s.count; if (s.observed_at > r.last) r.last = s.observed_at;
    });
    return m;
  }, [sightings, region]);
  const offList = Object.keys(recHere).filter((id) => !inList.has(id) && spById[id]);
  const counts = React.useMemo(() => Object.fromEntries(regions.map((r) => [r.code, species.filter((s) => s.regions?.includes(r.code)).length])), [regions, species]);

  const setStatus = (id: string, status: ChecklistStatus | null) =>
    act(async () => { await hw.api.admin.setChecklistEntry(region, id, status); await load(); if (status === null || !inList.has(id)) await reload(["catalog"]); },
      status === null ? "Removed from checklist" : inList.has(id) ? undefined : "Added to checklist");

  const rows = (entries || [])
    .map((e) => ({ e, s: spById[e.species_id] }))
    .filter(({ s }) => s && (!pack || s.pack === pack) && (!q || `${s.common} ${s.sci} ${s.family}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => packs.findIndex((p) => p.id === a.s.pack) - packs.findIndex((p) => p.id === b.s.pack) || a.s.common.localeCompare(b.s.common));

  const total = entries?.length || 0;
  const covered = (entries || []).filter((e) => recHere[e.species_id]).length;
  const endemic = (entries || []).filter((e) => e.status === "endemic").length;
  const threatened = (entries || []).filter((e) => ["CR", "EN", "VU"].includes(spById[e.species_id]?.iucn)).length;

  const exportCsv = () => hw.util.download(`checklist-${region}.csv`, hw.util.toCSV(rows.map(({ e, s }) => ({
    region: regionName(region), region_code: region, group: packs.find((p) => p.id === s.pack)?.name, family: s.family, common_name: s.common, scientific_name: s.sci,
    status: e.status, iucn: s.iucn, venom: s.venom, poisonous: s.toxic === "poisonous" ? "yes" : "no", individuals_recorded: recHere[s.id]?.n || 0, last_recorded: recHere[s.id]?.last?.slice(0, 10) || "",
  }))));

  const visibleRegions = regions.filter((r) => !rq || r.name.toLowerCase().includes(rq.toLowerCase()) || r.code.toLowerCase().includes(rq.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Core checklists" description="The authoritative list of species for each state or region. It drives the field app's species list, the state packs, and the review flags on submissions." />

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* region rail */}
        <Card className="hidden h-fit lg:block">
          <CardHeader className="p-4 pb-2"><SearchInput value={rq} onChange={setRq} placeholder="Find a state…" /></CardHeader>
          <CardContent className="max-h-[70vh] overflow-y-auto p-2">
            {visibleRegions.map((r) => (
              <button key={r.code} onClick={() => setRegion(r.code)}
                className={cn("flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent", region === r.code && "bg-accent font-semibold text-accent-foreground", r.parent && "pl-5")}>
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{counts[r.code] || 0}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 lg:hidden"><RegionSelect value={region} onChange={setRegion} /></div>
                <CardTitle className="text-xl">{regionName(region)}</CardTitle>
                <CardDescription>{total} species on the core checklist · {endemic} endemic · {threatened} threatened (CR/EN/VU)</CardDescription>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setDialog("add")}><Plus /> Add species</Button>
                  <Button variant="outline" onClick={() => setDialog("paste")}><ClipboardPaste /> Paste names</Button>
                  <Button variant="outline" onClick={() => setDialog("copy")}><Copy /> Copy from…</Button>
                  <Button variant="outline" onClick={exportCsv}><Download /> CSV</Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <Progress value={total ? (covered / total) * 100 : 0} className="h-2 flex-1" aria-label="Checklist coverage" />
                <span className="shrink-0 text-xs text-muted-foreground"><b className="text-foreground">{covered}</b>/{total} recorded by observers</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {packs.map((p) => {
                  const n = (entries || []).filter((e) => spById[e.species_id]?.pack === p.id).length;
                  return <button key={p.id} onClick={() => setPack(pack === p.id ? "" : p.id)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", pack === p.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}><span className="inline-flex items-center gap-1.5"><PackDot color={pack === p.id ? "currentColor" : p.color} />{p.name} <span className="font-mono">{n}</span></span></button>;
                })}
              </div>
            </CardContent>
          </Card>

          {offList.length > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4" /> Recorded here but not on the checklist</CardTitle>
                <CardDescription>Accepted or pending sightings of these species came from {regionName(region)}. Add them if the records are genuine.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {offList.map((id) => (
                  <span key={id} className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pl-3 pr-1 text-sm">
                    {spById[id].common} <span className="text-xs text-muted-foreground">×{recHere[id].n}</span>
                    {isAdmin && <Button size="sm" variant="secondary" className="h-7 rounded-full px-2.5" onClick={() => setStatus(id, "native")}><Plus /> Add</Button>}
                  </span>
                ))}
                <Button size="sm" variant="ghost" onClick={() => go("submissions", { region, status: "flagged" })}>Review records →</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-3 p-4">
              <SearchInput value={q} onChange={setQ} placeholder="Filter this checklist…" className="min-w-0 flex-1" />
              <span className="text-sm text-muted-foreground">{rows.length} shown</span>
            </CardHeader>
            {entries === null ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
              <EmptyState icon={ListPlus} title={total ? "No species match the filter" : "This region has no checklist yet"}>
                {total ? "Clear the search or group filter." : "Add species one by one, paste a list of scientific names, or copy the checklist of a neighbouring state."}
              </EmptyState>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Species</TableHead><TableHead>Group</TableHead><TableHead>IUCN</TableHead><TableHead className="hidden md:table-cell">Safety</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Recorded</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                <TableBody>
                  {rows.map(({ e, s }) => (
                    <TableRow key={s.id}>
                      <TableCell><span className="font-medium">{s.common}</span><span className="block text-xs italic text-muted-foreground">{s.sci} · {s.family}</span></TableCell>
                      <TableCell className="text-sm"><PackLabel id={s.pack} /></TableCell>
                      <TableCell><IucnBadge code={s.iucn} /></TableCell>
                      <TableCell className="hidden md:table-cell"><VenomBadge s={s} /></TableCell>
                      <TableCell>
                        <NativeSelect value={e.status} disabled={!isAdmin} onChange={(ev) => setStatus(s.id, ev.target.value as ChecklistStatus)} className="w-36" aria-label={`Status of ${s.common}`}>
                          {CHECKLIST_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                        </NativeSelect>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm">
                        {recHere[s.id] ? <><span className="font-mono">{recHere[s.id].n}</span><span className="block text-xs text-muted-foreground">last {fmtDate(recHere[s.id].last)}</span></> : <span className="text-xs text-muted-foreground">not yet</span>}
                      </TableCell>
                      <TableCell>
                        {isAdmin && <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" title="Remove from checklist" onClick={() => { if (confirm(`Remove ${s.common} from the ${regionName(region)} checklist?`)) setStatus(s.id, null); }}><Trash2 /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      <AddSpeciesDialog open={dialog === "add"} onClose={() => setDialog(null)} species={species} inList={inList} onAdd={(id, st) => setStatus(id, st)} onCreate={() => go("species", { new: "1" })} />
      <PasteDialog open={dialog === "paste"} onClose={() => setDialog(null)} species={species} inList={inList}
        onApply={(ids) => act(async () => { for (const id of ids) await hw.api.admin.setChecklistEntry(region, id, spById[id]?.endemic ? "endemic" : "native"); await load(); await reload(["catalog"]); setDialog(null); }, `${ids.length} species added`)} />
      <CopyDialog open={dialog === "copy"} onClose={() => setDialog(null)} target={region}
        onCopy={(from) => act(async () => { const n = await hw.api.admin.copyChecklist(from, region); await load(); await reload(["catalog"]); setDialog(null); return n; }, "Checklist copied")} />
    </div>
  );
}

function AddSpeciesDialog({ open, onClose, species, inList, onAdd, onCreate }: { open: boolean; onClose: () => void; species: Species[]; inList: Set<string>; onAdd: (id: string, st: ChecklistStatus) => void; onCreate: () => void }) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<ChecklistStatus>("native");
  const list = species.filter((s) => !inList.has(s.id) && (!q || `${s.common} ${s.sci} ${s.family}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 60);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add species to this checklist</DialogTitle><DialogDescription>Pick from the species catalogue. Missing a species? Create it first.</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search the catalogue…" className="min-w-0 flex-1" />
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as ChecklistStatus)} className="w-36" aria-label="Status">{CHECKLIST_STATUSES.map((s) => <option key={s}>{s}</option>)}</NativeSelect>
        </div>
        <div className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{s.common}</p><p className="truncate text-xs italic text-muted-foreground">{s.sci} · {s.family}</p></div>
              <IucnBadge code={s.iucn} />
              <Button size="sm" variant="secondary" onClick={() => onAdd(s.id, status)}><Plus /> Add</Button>
            </div>
          ))}
          {!list.length && <p className="p-4 text-sm text-muted-foreground">Every matching species is already on this checklist.</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onCreate}><Plus /> Create a new species</Button><Button variant="outline" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasteDialog({ open, onClose, species, inList, onApply }: { open: boolean; onClose: () => void; species: Species[]; inList: Set<string>; onApply: (ids: string[]) => void }) {
  const [text, setText] = React.useState("");
  const names = text.split(/\n|,|;/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const byName = new Map<string, Species>();
  species.forEach((s) => { byName.set(s.sci.toLowerCase(), s); byName.set(s.common.toLowerCase(), s); });
  const matched = [...new Set(names.map((n) => byName.get(n)).filter(Boolean) as Species[])];
  const unmatched = names.filter((n) => !byName.has(n));
  const toAdd = matched.filter((s) => !inList.has(s.id));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Paste a species list</DialogTitle><DialogDescription>One scientific or common name per line (or comma separated), e.g. from a published state checklist.</DialogDescription></DialogHeader>
        <Label htmlFor="paste-names" className="sr-only">Names</Label>
        <Textarea id="paste-names" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"Naja naja\nDaboia russelii\nIndian Bullfrog"} className="font-mono text-xs" />
        {names.length > 0 && (
          <div className="space-y-1 text-sm">
            <p><Badge variant="success">{toAdd.length} to add</Badge> <Badge variant="secondary">{matched.length - toAdd.length} already listed</Badge> {unmatched.length > 0 && <Badge variant="warning">{unmatched.length} not in catalogue</Badge>}</p>
            {unmatched.length > 0 && <p className="text-xs text-muted-foreground">Not found: {unmatched.slice(0, 12).join(", ")}{unmatched.length > 12 ? "…" : ""}. Add these on the Species page first.</p>}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!toAdd.length} onClick={() => onApply(toAdd.map((s) => s.id))}>Add {toAdd.length} species</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyDialog({ open, onClose, target, onCopy }: { open: boolean; onClose: () => void; target: string; onCopy: (from: string) => void }) {
  const { regionName } = useData();
  const [from, setFrom] = React.useState("IN");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Copy a checklist</DialogTitle><DialogDescription>Adds every species from another region to {regionName(target)}, keeping their statuses. Existing entries stay.</DialogDescription></DialogHeader>
        <RegionSelect value={from} onChange={setFrom} />
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={from === target} onClick={() => onCopy(from)}><Copy /> Copy into {regionName(target)}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
