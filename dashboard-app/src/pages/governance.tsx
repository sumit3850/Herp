import * as React from "react";
import { Check, Database, Download, FileSpreadsheet, GitPullRequest, Lock, Pencil, Plus, Settings, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, RegionSelect, SearchInput } from "@/components/common";
import { useAction, useData } from "@/lib/store";
import { fmtDateTime } from "@/lib/format";
import type { Region, ReviewerSubmission } from "@/lib/hw";

const KIND_LABEL: Record<ReviewerSubmission["kind"], string> = {
  new_species: "New species", species_update: "Species / taxonomy change", regional_checklist: "Regional checklist", checklist_change: "Checklist change", reference_photo: "Reference photo",
};
const F = ({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) => <div className={`grid gap-1.5 ${className || ""}`}><Label htmlFor={id}>{label}</Label>{children}</div>;

/* ───────── Proposals (reviewers) & Approvals (Admin) ───────── */
export function ProposalsPage() {
  const { hw, isAdmin, spById, regionName } = useData();
  const act = useAction();
  const [rows, setRows] = React.useState<ReviewerSubmission[] | null>(null);
  const [tab, setTab] = React.useState<"pending" | "approved" | "rejected">("pending");
  const [creating, setCreating] = React.useState(false);
  const [decideNote, setDecideNote] = React.useState<Record<string, string>>({});
  const load = React.useCallback(async () => { try { setRows(await hw.api.admin.submissions()); } catch { setRows([]); } }, [hw]);
  React.useEffect(() => { load(); }, [load]);
  const list = (rows || []).filter((r) => r.status === tab);
  const count = (st: string) => (rows || []).filter((r) => r.status === st).length;
  const summary = (r: ReviewerSubmission) => {
    const p = r.payload as Record<string, unknown>;
    if (r.kind === "new_species") return <><b>{String(p.common_name || "")}</b> <i>{String(p.scientific_name || "")}</i> · {String(p.family || "")}{r.region_code ? ` → ${regionName(r.region_code)} checklist` : ""}</>;
    if (r.kind === "species_update" || r.kind === "reference_photo") {
      const ch = (p.changes || {}) as Record<string, unknown>;
      return <><b>{spById[r.species_id || ""]?.common || r.species_id}</b>: {Object.entries(ch).map(([k, v]) => <span key={k} className="mr-2 inline-block"><span className="text-muted-foreground">{k}</span> → {k === "images" ? `${(v as unknown[]).length} photo(s)` : String(v)}</span>)}</>;
    }
    const add = (p.add || []) as { species_id: string; status?: string }[], rem = (p.remove || []) as string[];
    return <><b>{regionName(r.region_code)}</b>: {add.length ? `add ${add.length} (${add.slice(0, 4).map((a) => spById[a.species_id]?.common || a.species_id).join(", ")}${add.length > 4 ? "…" : ""})` : ""}{rem.length ? ` · remove ${rem.length} (${rem.slice(0, 4).map((x) => spById[x]?.common || x).join(", ")})` : ""}</>;
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={isAdmin ? "Approvals" : "My proposals"}
        description={isAdmin ? "Changes proposed by reviewers: new species, taxonomy corrections, regional checklists and reference photos. Nothing changes until you approve it." : "Propose new species, taxonomy corrections, regional checklists or reference photos. The Admin reviews each proposal."}
        actions={<Button onClick={() => setCreating(true)}><Plus /> New proposal</Button>}
      />
      <div className="flex gap-2">{(["pending", "approved", "rejected"] as const).map((k) => <button key={k} onClick={() => setTab(k)} className={`rounded-full border px-3 py-1 text-sm capitalize ${tab === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}>{k} <b>{count(k)}</b></button>)}</div>
      <Card>
        {rows === null ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : !list.length ? <EmptyState icon={GitPullRequest} title={`No ${tab} proposals`} /> : (
          <div className="divide-y">
            {list.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{KIND_LABEL[r.kind]}</Badge><span className="text-xs text-muted-foreground">by @{r.username} · {fmtDateTime(r.created_at)}</span>
                  {r.status !== "pending" && <Badge variant={r.status === "approved" ? "success" : "destructive"}>{r.status}</Badge>}</div>
                <p className="text-sm">{summary(r)}</p>
                {r.note && <p className="text-sm text-muted-foreground">“{r.note}”</p>}
                {r.refs && <p className="text-xs text-muted-foreground">Sources: {r.refs}</p>}
                {r.decision_note && <p className="text-xs">Admin: {r.decision_note}</p>}
                {isAdmin && r.status === "pending" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="h-8 max-w-sm" placeholder="Note to the reviewer (optional)" value={decideNote[r.id] || ""} onChange={(e) => setDecideNote({ ...decideNote, [r.id]: e.target.value })} />
                    <Button size="sm" onClick={() => act(async () => { await hw.api.admin.decideSubmission(r.id, true, decideNote[r.id] || ""); await load(); }, "Approved and applied")}><Check /> Approve & apply</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => act(async () => { await hw.api.admin.decideSubmission(r.id, false, decideNote[r.id] || ""); await load(); }, "Rejected")}><X /> Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {creating && <ProposalDialog onClose={() => setCreating(false)} onDone={load} />}
    </div>
  );
}

function ProposalDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const { hw, species, spById } = useData();
  const act = useAction();
  const [kind, setKind] = React.useState<ReviewerSubmission["kind"]>("regional_checklist");
  const [region, setRegion] = React.useState("");
  const [sp, setSp] = React.useState("");
  const [note, setNote] = React.useState("");
  const [refs, setRefs] = React.useState("");
  const [ns, setNs] = React.useState<Record<string, string>>({ common_name: "", scientific_name: "", family: "", order_name: "", taxon_group: "", iucn: "NE", venom: "non", toxic: "non", distribution: "", authority: "" });
  const [field, setField] = React.useState("scientific_name");
  const [value, setValue] = React.useState("");
  const [photo, setPhoto] = React.useState({ url: "", credit: "", license: "" });
  const [adds, setAdds] = React.useState<string[]>([]);
  const [rems, setRems] = React.useState<string[]>([]);
  const [q, setQ] = React.useState("");
  const hits = q.trim().length > 1 ? species.filter((x) => `${x.common} ${x.sci}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const FIELDS: [string, string][] = [["scientific_name", "Scientific name"], ["common_name", "Common name"], ["family", "Family"], ["genus", "Genus"], ["order_name", "Order"], ["authority", "Authority"], ["iucn", "IUCN status"], ["venom", "Venom (venomous/mild/non)"], ["distribution", "Distribution"], ["habitat", "Habitat"], ["endemic", "Endemic (true/false)"]];
  const submit = () => act(async () => {
    if (kind === "new_species") {
      if (!ns.common_name || !ns.scientific_name) throw new Error("Common and scientific names are required");
      await hw.api.admin.submit(kind, { region: region || null, payload: ns, note, refs });
    } else if (kind === "species_update") {
      if (!sp || !value) throw new Error("Choose a species and the new value");
      await hw.api.admin.submit(kind, { species: sp, payload: { changes: { [field]: value } }, note, refs });
    } else if (kind === "reference_photo") {
      if (!sp || !photo.url) throw new Error("Choose a species and give the photo URL");
      await hw.api.admin.submit(kind, { species: sp, payload: { changes: { images: [photo] } }, note, refs });
    } else {
      if (!region || (!adds.length && !rems.length)) throw new Error("Choose a region and at least one species");
      await hw.api.admin.submit(kind, { region, payload: { add: adds.map((id) => ({ species_id: id, status: spById[id]?.endemic ? "endemic" : "native" })), remove: rems }, note, refs });
    }
    await onDone(); onClose();
  }, "Proposal sent to the Admin");
  const picker = (onPick: (id: string) => void) => (
    <div><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search species…" />
      <div className="mt-1 flex flex-col">{hits.map((x) => <button key={x.id} type="button" className="rounded px-2 py-1 text-left text-sm hover:bg-accent" onClick={() => { onPick(x.id); setQ(""); }}>{x.common} <i className="text-muted-foreground">{x.sci}</i></button>)}</div></div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New proposal</DialogTitle><DialogDescription>The Admin reviews it; approved changes are applied automatically and logged.</DialogDescription></DialogHeader>
        <div className="grid gap-4">
          <F id="pk" label="What do you propose?"><NativeSelect id="pk" value={kind} onChange={(e) => setKind(e.target.value as ReviewerSubmission["kind"])}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></F>
          {kind === "new_species" && <div className="grid gap-3 sm:grid-cols-2">
            {([["common_name", "Common name *"], ["scientific_name", "Scientific name *"], ["authority", "Authority"], ["family", "Family"], ["order_name", "Order"]] as const).map(([k, l]) => <F key={k} id={`ns-${k}`} label={l}><Input id={`ns-${k}`} value={ns[k]} onChange={(e) => setNs({ ...ns, [k]: e.target.value })} /></F>)}
            <F id="ns-g" label="Group"><NativeSelect id="ns-g" value={ns.taxon_group} onChange={(e) => setNs({ ...ns, taxon_group: e.target.value })}><option value="">—</option>{Object.entries(hw.GROUPS || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></F>
            <F id="ns-i" label="IUCN"><NativeSelect id="ns-i" value={ns.iucn} onChange={(e) => setNs({ ...ns, iucn: e.target.value })}>{Object.keys(hw.IUCN).map((k) => <option key={k}>{k}</option>)}</NativeSelect></F>
            <F id="ns-v" label="Venom"><NativeSelect id="ns-v" value={ns.venom} onChange={(e) => setNs({ ...ns, venom: e.target.value })}>{Object.entries(hw.VENOM).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</NativeSelect></F>
            <F id="ns-d" label="Distribution" className="sm:col-span-2"><Textarea id="ns-d" rows={2} value={ns.distribution} onChange={(e) => setNs({ ...ns, distribution: e.target.value })} /></F>
            <F id="ns-r" label="Also add to checklist (optional)" className="sm:col-span-2"><RegionSelect id="ns-r" value={region} onChange={setRegion} allowAll /></F>
          </div>}
          {(kind === "species_update" || kind === "reference_photo") && <>
            <F id="sp" label="Species">{sp ? <div className="flex items-center gap-2 rounded-md border p-2 text-sm"><b>{spById[sp]?.common}</b> <i>{spById[sp]?.sci}</i><Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSp("")}>Change</Button></div> : picker(setSp)}</F>
            {kind === "species_update" ? <div className="grid gap-3 sm:grid-cols-2"><F id="fld" label="Field"><NativeSelect id="fld" value={field} onChange={(e) => setField(e.target.value)}>{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></F>
              <F id="val" label={`New value${sp && field in (spById[sp] || {}) ? "" : ""}`}><Input id="val" value={value} onChange={(e) => setValue(e.target.value)} /></F></div>
              : <div className="grid gap-3 sm:grid-cols-3"><F id="pu" label="Photo URL" className="sm:col-span-3"><Input id="pu" value={photo.url} onChange={(e) => setPhoto({ ...photo, url: e.target.value })} placeholder="https://…" /></F>
                <F id="pc" label="Credit"><Input id="pc" value={photo.credit} onChange={(e) => setPhoto({ ...photo, credit: e.target.value })} /></F><F id="pl" label="Licence"><Input id="pl" value={photo.license} onChange={(e) => setPhoto({ ...photo, license: e.target.value })} placeholder="CC BY 4.0" /></F></div>}
          </>}
          {(kind === "regional_checklist" || kind === "checklist_change") && <>
            <F id="rg" label="Region (state, district, island, protected area…)"><RegionSelect id="rg" value={region} onChange={setRegion} /></F>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Add species</Label>{picker((id) => setAdds((a) => (a.includes(id) ? a : [...a, id])))}<div className="mt-1 flex flex-wrap gap-1">{adds.map((id) => <Badge key={id} variant="success" className="gap-1">{spById[id]?.common}<button onClick={() => setAdds(adds.filter((x) => x !== id))}><X className="size-3" /></button></Badge>)}</div></div>
              <div><Label>Remove species</Label><NativeSelect value="" onChange={(e) => e.target.value && setRems((r) => [...new Set([...r, e.target.value])])}><option value="">Choose…</option>{species.filter((x) => x.regions?.includes(region)).map((x) => <option key={x.id} value={x.id}>{x.common}</option>)}</NativeSelect>
                <div className="mt-1 flex flex-wrap gap-1">{rems.map((id) => <Badge key={id} variant="destructive" className="gap-1">{spById[id]?.common}<button onClick={() => setRems(rems.filter((x) => x !== id))}><X className="size-3" /></button></Badge>)}</div></div>
            </div>
          </>}
          <F id="nt" label="Why? (evidence)"><Textarea id="nt" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></F>
          <F id="rf" label="Sources / references"><Textarea id="rf" rows={2} value={refs} onChange={(e) => setRefs(e.target.value)} maxLength={2000} placeholder="Publication, museum specimen, verified records…" /></F>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit}><GitPullRequest /> Send proposal</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Regions (Admin) ───────── */
const KINDS = ["country", "state", "ut", "district", "island", "region", "protected_area"];
export function RegionsPage() {
  const { hw, regions, reload, species } = useData();
  const act = useAction();
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState<Partial<Region> | null>(null);
  const depth = (r: Region) => { let d = 0, x: Region | undefined = r; while (x?.parent && d < 6) { x = regions.find((y) => y.code === x!.parent); d++; } return d; };
  const ordered: Region[] = [];
  const walk = (p: string | null) => regions.filter((r) => (r.parent || null) === p).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name)).forEach((r) => { ordered.push(r); walk(r.code); });
  walk(null);
  const list = ordered.filter((r) => !q || `${r.code} ${r.name} ${r.kind}`.toLowerCase().includes(q.toLowerCase()));
  const nSp = (code: string) => species.filter((s) => s.regions?.includes(code)).length;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Regions" description="Countries, states/UTs, districts, islands, protected areas and other regions that checklists and observations are organised by. Coordinates let the field app work out the region offline."
        actions={<Button onClick={() => setEdit({ code: "", name: "", parent: "IN", kind: "district" })}><Plus /> Add region</Button>} />
      <Card>
        <CardHeader className="p-4"><SearchInput value={q} onChange={setQ} placeholder="Search regions…" /></CardHeader>
        <Table>
          <TableHeader><TableRow><TableHead>Region</TableHead><TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Species</TableHead><TableHead>Centre</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{list.map((r) => (
            <TableRow key={r.code}>
              <TableCell style={{ paddingLeft: 16 + depth(r) * 18 }}>{r.name}</TableCell>
              <TableCell className="font-mono text-xs">{r.code}</TableCell>
              <TableCell><Badge variant="outline">{(r.kind || "").replace("_", " ")}</Badge></TableCell>
              <TableCell className="text-right font-mono text-sm">{nSp(r.code)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{r.lat != null ? `${(+r.lat).toFixed(2)}, ${(+r.lng!).toFixed(2)}` : "—"}</TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" className="size-8" title="Edit" onClick={() => setEdit(r)}><Pencil /></Button>
                <Button size="icon" variant="ghost" className="size-8 hover:text-destructive" title="Delete" onClick={() => { if (confirm(`Delete ${r.name}? Only possible when no sub-regions, checklist entries or records use it.`)) act(async () => { await hw.api.admin.deleteRegion(r.code); await reload(["catalog"]); }, "Region deleted"); }}><Trash2 /></Button>
              </div></TableCell>
            </TableRow>))}</TableBody>
        </Table>
      </Card>
      {edit && <RegionDialog initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
function RegionDialog({ initial, onClose }: { initial: Partial<Region>; onClose: () => void }) {
  const { hw, reload } = useData();
  const act = useAction();
  const isNew = !initial.code;
  const [r, setR] = React.useState<Partial<Region>>(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isNew ? "Add region" : `Edit ${initial.name}`}</DialogTitle><DialogDescription>Codes follow ISO 3166-2 where possible (IN-KL); sub-regions add a suffix (IN-AN-I-SAI).</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <F id="r-code" label="Code"><Input id="r-code" disabled={!isNew} value={r.code || ""} onChange={(e) => setR({ ...r, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} /></F>
          <F id="r-name" label="Name"><Input id="r-name" value={r.name || ""} onChange={(e) => setR({ ...r, name: e.target.value })} /></F>
          <F id="r-par" label="Inside"><RegionSelect id="r-par" value={r.parent || ""} onChange={(v) => setR({ ...r, parent: v || null })} allowAll /></F>
          <F id="r-kind" label="Type"><NativeSelect id="r-kind" value={r.kind || "region"} onChange={(e) => setR({ ...r, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</NativeSelect></F>
          <F id="r-lat" label="Centre latitude"><Input id="r-lat" inputMode="decimal" value={r.lat ?? ""} onChange={(e) => setR({ ...r, lat: e.target.value === "" ? null : +e.target.value })} /></F>
          <F id="r-lng" label="Centre longitude"><Input id="r-lng" inputMode="decimal" value={r.lng ?? ""} onChange={(e) => setR({ ...r, lng: e.target.value === "" ? null : +e.target.value })} /></F>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!r.code || !r.name) return alert("Code and name are required"); act(async () => { await hw.api.admin.upsertRegion({ ...r, parent: r.parent || null }); await reload(["catalog"]); onClose(); }, "Region saved"); }}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── Platform settings & full export (Admin) ───────── */
export function SettingsPage() {
  const { hw } = useData();
  const act = useAction();
  const [st, setSt] = React.useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = React.useState("");
  const load = React.useCallback(async () => setSt(await hw.api.settings()), [hw]);
  React.useEffect(() => { load(); }, [load]);
  const save = (k: string, v: unknown) => act(async () => { await hw.api.admin.setSetting(k, v); await load(); }, "Setting saved");
  const reqPacks = st ? st.require_packs !== false && st.require_packs !== "false" : true;
  const doExport = async (fmt: "json" | "xlsx") => {
    setBusy(fmt);
    try {
      const all = await hw.api.admin.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      if (fmt === "json") hw.util.download(`herpwatch-backup-${stamp}.json`, JSON.stringify({ exported_at: new Date().toISOString(), tables: all }, null, 1), "application/json");
      else await hw.util.downloadXlsx(`herpwatch-export-${stamp}.xlsx`, Object.fromEntries(Object.entries(all).map(([t, rows]) => [t, rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])))])));
    } catch (e) { alert((e as Error).message); }
    setBusy("");
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Platform settings" description="Settings for the whole platform. Only the Admin (platform owner) can change them; every change is in the audit log." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings className="size-4" /> Access & privacy</CardTitle><CardDescription>Applies to the field app, website and dashboard immediately.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <label className="flex items-start gap-3"><input type="checkbox" className="custom-checkbox mt-1" checked={reqPacks} onChange={(e) => save("require_packs", e.target.checked)} />
              <span><b className="block text-sm">Paid packs required for full species pages</b><span className="text-sm text-muted-foreground">Off = every signed-in user sees photos, ID notes and the Identify helper free. Recording is always free.</span></span></label>
            <F id="s-priv" label="Default privacy for new observations"><NativeSelect id="s-priv" value={String(st?.default_privacy ?? "public")} onChange={(e) => save("default_privacy", e.target.value)}>
              <option value="public">Public (shown on the public map)</option><option value="restricted">Restricted (counts only; reviewers see the point)</option><option value="private">Private (observer and reviewers only)</option></NativeSelect></F>
            <F id="s-blur" label="Sensitive species: public location precision"><NativeSelect id="s-blur" value={String(st?.sensitive_blur_decimals ?? 1)} onChange={(e) => save("sensitive_blur_decimals", +e.target.value)}>
              <option value="0">~100 km (whole degrees)</option><option value="1">~10 km (1 decimal)</option><option value="2">~1 km (2 decimals)</option></NativeSelect></F>
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Database className="size-4" /> Full data export & backup</CardTitle><CardDescription>Everything the Admin can read: users, regions, species, checklists, sessions, observations, photos, reviews, GPS points, proposals, audit log.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" disabled={!!busy} onClick={() => doExport("xlsx")}><FileSpreadsheet /> {busy === "xlsx" ? "Exporting…" : "Export everything to Excel"}</Button>
            <Button variant="outline" disabled={!!busy} onClick={() => doExport("json")}><Download /> {busy === "json" ? "Exporting…" : "Download JSON backup"}</Button>
            <p className="text-xs text-muted-foreground">Supabase also keeps automatic daily database backups (Project → Database → Backups). Photos are stored in the “photos” storage bucket.</p>
          </CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Lock className="size-4" /> Platform ownership</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You are the only Admin. The database refuses any attempt by users or reviewers to become Admin or to grant Admin rights, including through the API. Ownership can only be transferred from the Supabase SQL Editor with <code className="rounded bg-muted px-1">select public.set_platform_owner('new-owner@email');</code>
          </CardContent></Card>
      </div>
    </div>
  );
}
