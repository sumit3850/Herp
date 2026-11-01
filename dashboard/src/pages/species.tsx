import * as React from "react";
import { BookOpen, Download, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, IucnBadge, PageHeader, SearchInput, VenomBadge } from "@/components/common";
import { useAction, useData } from "@/lib/store";
import type { Species } from "@/lib/hw";

const blank = (pack: string): Species => ({ id: "", pack, common: "", sci: "", family: "", venom: "non", toxic: "non", iucn: "NE", endemic: false, sensitive: false, size: "", habitat: "", distribution: "", id_notes: "", behaviour: "", similar: "", images: [], traits: {}, regions: [] });
const slug = (sci: string) => sci.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

export function SpeciesPage({ startNew }: { startNew?: boolean }) {
  const { species, packs, hw, reload, isAdmin } = useData();
  const act = useAction();
  const [q, setQ] = React.useState("");
  const [pack, setPack] = React.useState("");
  const [edit, setEdit] = React.useState<Species | null>(startNew && packs[0] ? blank(packs[0].id) : null);
  const [importing, setImporting] = React.useState(false);
  React.useEffect(() => { if (startNew && packs[0] && !edit) setEdit(blank(packs[0].id)); }, [startNew, packs]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = species.filter((s) => (!pack || s.pack === pack) && (!q || `${s.common} ${s.sci} ${s.family}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Species catalogue"
        description={`${species.length} species. Edits appear in the field guide, the Identify helper and the checklists.`}
        actions={isAdmin && <>
          <Button variant="outline" onClick={() => hw.util.download("species.csv", hw.util.toCSV(species.map((s) => ({ ...s, regions: s.regions.join(" "), images: (s.images || []).map((i) => (typeof i === "string" ? i : i.url)).join(" "), traits: JSON.stringify(s.traits || {}) }))))}><Download /> CSV</Button>
          <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Bulk import</Button>
          <Button onClick={() => setEdit(blank(packs[0]?.id || "snakes"))}><Plus /> Add species</Button>
        </>}
      />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Common, scientific or family name…" className="min-w-0 flex-1" />
          <NativeSelect value={pack} onChange={(e) => setPack(e.target.value)} className="w-52" aria-label="Group">
            <option value="">All groups</option>{packs.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </NativeSelect>
        </CardHeader>
        {!list.length ? <EmptyState icon={BookOpen} title="No species found" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Species</TableHead><TableHead>Group</TableHead><TableHead>IUCN</TableHead><TableHead>Safety</TableHead><TableHead className="text-right">Regions</TableHead><TableHead className="text-right">Photos</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {list.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><span className="font-medium">{s.common}</span>{s.endemic && <span className="ml-2 text-xs text-primary">endemic</span>}<span className="block text-xs italic text-muted-foreground">{s.sci} · {s.family}</span></TableCell>
                  <TableCell className="whitespace-nowrap">{packs.find((p) => p.id === s.pack)?.emoji} {packs.find((p) => p.id === s.pack)?.name}</TableCell>
                  <TableCell><IucnBadge code={s.iucn} /></TableCell>
                  <TableCell><VenomBadge s={s} />{s.venom === "non" && s.toxic === "non" && <span className="text-xs text-muted-foreground">Harmless</span>}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{s.regions?.length || 0}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{s.images?.length || 0}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin && <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="size-8" title="Edit" onClick={() => setEdit(s)}><Pencil /></Button>
                      <Button size="icon" variant="ghost" className="size-8 hover:text-destructive" title="Delete" onClick={() => { if (confirm(`Delete ${s.common}? It is removed from every checklist; past sightings keep their record but lose the link.`)) act(async () => { await hw.api.admin.deleteSpecies(s.id); await reload(["catalog"]); }, "Species deleted"); }}><Trash2 /></Button>
                    </div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {edit && <SpeciesForm initial={edit} onClose={() => setEdit(null)} />}
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

const F = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;

function SpeciesForm({ initial, onClose }: { initial: Species; onClose: () => void }) {
  const { packs, hw, reload } = useData();
  const act = useAction();
  const [s, setS] = React.useState<Species>(initial);
  const [images, setImages] = React.useState((initial.images || []).map((i) => (typeof i === "string" ? i : [i.url, i.credit, i.license].filter(Boolean).join(" | "))).join("\n"));
  const set = <K extends keyof Species>(k: K, v: Species[K]) => setS((x) => ({ ...x, [k]: v }));
  const area = (k: "id_notes" | "habitat" | "distribution" | "behaviour" | "similar", label: string) =>
    <F id={`sf-${k}`} label={label}><Textarea id={`sf-${k}`} rows={2} value={s[k] || ""} onChange={(e) => set(k, e.target.value)} /></F>;

  const save = () => {
    if (!s.common.trim() || !s.sci.trim()) return alert("Common and scientific names are required.");
    const out: Species = { ...s, id: s.id || slug(s.sci), common: s.common.trim(), sci: s.sci.trim(),
      images: images.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [url, credit, license] = l.split("|").map((x) => x.trim()); return { url, credit: credit || "", license: license || "" }; }) };
    act(async () => { await hw.api.admin.upsertSpecies(out); await reload(["catalog"]); onClose(); }, "Species saved");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{initial.id ? `Edit ${initial.common}` : "Add species"}</DialogTitle><DialogDescription>Where it occurs is managed on the Core checklists page.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <F id="sf-common" label="Common name *"><Input id="sf-common" value={s.common} onChange={(e) => set("common", e.target.value)} /></F>
          <F id="sf-sci" label="Scientific name *"><Input id="sf-sci" className="italic" value={s.sci} onChange={(e) => set("sci", e.target.value)} /></F>
          <F id="sf-family" label="Family"><Input id="sf-family" value={s.family} onChange={(e) => set("family", e.target.value)} /></F>
          <F id="sf-pack" label="Group (pack)"><NativeSelect id="sf-pack" value={s.pack} onChange={(e) => set("pack", e.target.value)}>{packs.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}</NativeSelect></F>
          <F id="sf-iucn" label="IUCN status"><NativeSelect id="sf-iucn" value={s.iucn} onChange={(e) => set("iucn", e.target.value as Species["iucn"])}>{Object.entries(hw.IUCN).map(([k, v]) => <option key={k} value={k}>{k} · {v.name}</option>)}</NativeSelect></F>
          <F id="sf-venom" label="Venom"><NativeSelect id="sf-venom" value={s.venom} onChange={(e) => set("venom", e.target.value as Species["venom"])}>{Object.entries(hw.VENOM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</NativeSelect></F>
          <F id="sf-toxic" label="Poisonous?"><NativeSelect id="sf-toxic" value={s.toxic} onChange={(e) => set("toxic", e.target.value as Species["toxic"])}><option value="non">Non-poisonous</option><option value="poisonous">Poisonous (skin / secretions)</option></NativeSelect></F>
          <F id="sf-size" label="Size"><Input id="sf-size" value={s.size || ""} onChange={(e) => set("size", e.target.value)} /></F>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="custom-checkbox" checked={s.endemic} onChange={(e) => set("endemic", e.target.checked)} /> Endemic</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="custom-checkbox" checked={s.sensitive} onChange={(e) => set("sensitive", e.target.checked)} /> Sensitive (blur public locations to ~10 km)</label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {area("id_notes", "Identification notes")}{area("habitat", "Habitat")}{area("distribution", "Distribution notes")}{area("behaviour", "Behaviour / safety notes")}{area("similar", "Similar species")}
          <F id="sf-img" label="Images: url | credit | licence (one per line)"><Textarea id="sf-img" rows={2} value={images} onChange={(e) => setImages(e.target.value)} placeholder="https://… | © Name | CC BY-SA 4.0" /></F>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <F id="sf-col" label="Identify: colours"><Input id="sf-col" value={(s.traits?.color || []).join(", ")} onChange={(e) => set("traits", { ...s.traits, color: e.target.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) })} placeholder="brown, black" /></F>
          <F id="sf-pat" label="Identify: pattern"><NativeSelect id="sf-pat" value={s.traits?.pattern || ""} onChange={(e) => set("traits", { ...s.traits, pattern: e.target.value })}>{["", "plain", "banded", "spotted", "blotched", "striped", "zigzag", "checkered", "warty", "star"].map((p) => <option key={p}>{p}</option>)}</NativeSelect></F>
          <F id="sf-time" label="Identify: active"><NativeSelect id="sf-time" value={s.traits?.time || ""} onChange={(e) => set("traits", { ...s.traits, time: e.target.value })}>{["", "day", "dusk", "night", "any"].map((p) => <option key={p}>{p}</option>)}</NativeSelect></F>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>Save species</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { hw, reload } = useData();
  const act = useAction();
  const [text, setText] = React.useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bulk import species</DialogTitle><DialogDescription>Paste a JSON array using the same fields as data/seed.js (pack, common, sci, family, venom, toxic, iucn, habitat…). Existing ids are updated.</DialogDescription></DialogHeader>
        <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" placeholder='[{"pack":"lizards","common":"Common Skink","sci":"Eutropis carinata","family":"Scincidae","iucn":"LC"}]' />
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => act(async () => {
            const arr = JSON.parse(text) as Partial<Species>[]; let n = 0;
            for (const x of arr) { if (!x.sci || !x.common || !x.pack) continue; await hw.api.admin.upsertSpecies({ ...blank(x.pack), ...x, id: x.id || slug(x.sci) } as Species); n++; }
            await reload(["catalog"]); onClose(); setText("");
            if (!n) throw new Error("Nothing imported. Each item needs pack, common and sci.");
          }, "Import finished")}><Upload /> Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
