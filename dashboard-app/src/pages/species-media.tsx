import * as React from "react";
import { FileText, Film, Image as ImageIcon, Link2, Music, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAction, useData } from "@/lib/store";
import type { Species } from "@/lib/hw";

export type MediaKind = "image" | "video" | "audio" | "paper";
export interface SpeciesMedia { id: string; species_id: string; kind: MediaKind; url: string; storage_path: string; title: string; caption: string; credit: string; license: string; citation: string; doi: string; year: number | null; sort: number; added_by: string | null; created_at: string }

const KINDS: Record<MediaKind, { label: string; icon: typeof ImageIcon; accept: string; hint: string }> = {
  image: { label: "Photo", icon: ImageIcon, accept: "image/*", hint: "Reference photo shown in the species gallery (JPG/PNG/WebP)." },
  video: { label: "Video", icon: Film, accept: "video/*", hint: "Upload an MP4/WebM, or paste a YouTube link." },
  audio: { label: "Call (audio)", icon: Music, accept: "audio/*", hint: "Frog calls etc. (MP3/M4A/WAV/OGG)." },
  paper: { label: "Research paper", icon: FileText, accept: "application/pdf", hint: "Upload the PDF (if the licence allows) or link to the publisher / DOI." },
};
const MAX_MB = 50;

export function MediaDialog({ species, onClose }: { species: Species; onClose: () => void }) {
  const { hw, me, isAdmin } = useData();
  const act = useAction();
  const api = hw.api as unknown as { speciesMedia(id: string): Promise<SpeciesMedia[]>; admin: { uploadSpeciesFile(f: File, id: string): Promise<{ url: string; storage_path: string }>; addMedia(m: Partial<SpeciesMedia>): Promise<SpeciesMedia>; deleteMedia(id: string): Promise<void> } };
  const [items, setItems] = React.useState<SpeciesMedia[] | null>(null);
  const [kind, setKind] = React.useState<MediaKind>("image");
  const [file, setFile] = React.useState<File | null>(null);
  const [f, setF] = React.useState({ url: "", title: "", caption: "", credit: "", license: "", citation: "", doi: "", year: "" });
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const load = React.useCallback(async () => { try { setItems(await api.speciesMedia(species.id)); } catch { setItems([]); } }, [api, species.id]);
  React.useEffect(() => { load(); }, [load]);
  const reset = () => { setFile(null); setF({ url: "", title: "", caption: "", credit: "", license: "", citation: "", doi: "", year: "" }); if (fileRef.current) fileRef.current.value = ""; };
  const add = async () => {
    if (!file && !f.url.trim() && !(kind === "paper" && f.doi.trim())) return alert("Choose a file or paste a link.");
    if (file && file.size > MAX_MB * 1024 * 1024) return alert(`Files up to ${MAX_MB} MB.`);
    if (kind === "paper" && !f.title.trim()) return alert("Give the paper a title.");
    setBusy(true);
    await act(async () => {
      let url = f.url.trim(), storage_path = "";
      if (file) ({ url, storage_path } = await api.admin.uploadSpeciesFile(file, species.id));
      if (!url && f.doi.trim()) url = f.doi.trim().startsWith("http") ? f.doi.trim() : `https://doi.org/${f.doi.trim()}`;
      if (!/^https?:\/\//.test(url)) throw new Error("Links must start with http:// or https://");
      await api.admin.addMedia({ species_id: species.id, kind, url, storage_path, title: f.title.trim(), caption: f.caption.trim(), credit: f.credit.trim(), license: f.license.trim(),
        citation: f.citation.trim(), doi: f.doi.trim(), year: f.year ? +f.year : null, sort: (items || []).filter((x) => x.kind === kind).length });
      reset(); await load();
    }, `${KINDS[kind].label} added`);
    setBusy(false);
  };
  const K = KINDS[kind];
  const groups = (["image", "video", "audio", "paper"] as MediaKind[]).map((k) => [k, (items || []).filter((x) => x.kind === k)] as const);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Media for {species.common} <i className="font-normal text-muted-foreground">{species.sci}</i></DialogTitle>
          <DialogDescription>Photos, videos and calls appear on the species page in the field app (following the pack rules); research papers are visible to everyone. Credit the author and give a licence.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap gap-2">{(Object.keys(KINDS) as MediaKind[]).map((k) => { const Ic = KINDS[k].icon; return (
            <button key={k} type="button" onClick={() => { setKind(k); reset(); }} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${kind === k ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}><Ic className="size-4" />{KINDS[k].label}</button>); })}</div>
          <p className="mt-2 text-xs text-muted-foreground">{K.hint}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="m-file">Upload a file</Label>
              <Input ref={fileRef} id="m-file" type="file" accept={K.accept} onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="m-url"><Link2 className="mr-1 inline size-3.5" />…or paste a link</Label>
              <Input id="m-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder={kind === "video" ? "https://youtu.be/…" : "https://…"} disabled={!!file} /></div>
            <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="m-title">{kind === "paper" ? "Title *" : "Title"}</Label><Input id="m-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={kind === "image" ? "Adult female, dorsal view" : kind === "audio" ? "Advertisement call" : ""} /></div>
            {kind === "paper" ? <>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="m-cit">Full reference</Label><Textarea id="m-cit" rows={2} value={f.citation} onChange={(e) => setF({ ...f, citation: e.target.value })} placeholder="Author A, Author B (2024). Title. Journal 12(3): 45–67." /></div>
              <div className="grid gap-1.5"><Label htmlFor="m-doi">DOI</Label><Input id="m-doi" value={f.doi} onChange={(e) => setF({ ...f, doi: e.target.value })} placeholder="10.11646/zootaxa.1234.1.1" /></div>
              <div className="grid gap-1.5"><Label htmlFor="m-year">Year</Label><Input id="m-year" type="number" min={1700} max={2100} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} /></div>
            </> : <>
              <div className="grid gap-1.5"><Label htmlFor="m-credit">Credit (photographer / recordist)</Label><Input id="m-credit" value={f.credit} onChange={(e) => setF({ ...f, credit: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label htmlFor="m-lic">Licence</Label><NativeSelect id="m-lic" value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })}>
                {["", "CC0", "CC BY 4.0", "CC BY-SA 4.0", "CC BY-NC 4.0", "CC BY-NC-SA 4.0", "All rights reserved (used with permission)"].map((l) => <option key={l} value={l}>{l || "Choose…"}</option>)}</NativeSelect></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="m-cap">Caption / locality</Label><Input id="m-cap" value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} placeholder="Mount Harriet, South Andaman" /></div>
            </>}
          </div>
          <Button className="mt-3" disabled={busy} onClick={add}><Upload /> {busy ? "Uploading…" : `Add ${K.label.toLowerCase()}`}</Button>
        </div>

        {items === null ? <p className="text-sm text-muted-foreground">Loading…</p> : groups.map(([k, list]) => list.length > 0 && (
          <div key={k}>
            <h4 className="mb-2 text-sm font-semibold">{({ image: "Photos", video: "Videos", audio: "Calls", paper: "Research papers" } as const)[k]} <Badge variant="secondary">{list.length}</Badge></h4>
            <div className={k === "image" ? "grid grid-cols-3 gap-2 sm:grid-cols-4" : "flex flex-col gap-2"}>
              {list.map((m) => {
                const canDel = isAdmin || m.added_by === me.id;
                const del = canDel && <Button size="icon" variant="ghost" className="size-8 shrink-0 hover:text-destructive" title="Remove" onClick={() => { if (confirm("Remove this item?")) act(async () => { await api.admin.deleteMedia(m.id); await load(); }, "Removed"); }}><Trash2 /></Button>;
                if (k === "image") return <div key={m.id} className="relative"><a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={m.title} className="aspect-square w-full rounded-md object-cover" /></a><div className="absolute right-1 top-1 rounded-md bg-background/80">{del}</div><p className="truncate text-[11px] text-muted-foreground">{m.title || m.credit}</p></div>;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-md border p-2">
                    <div className="min-w-0 flex-1">
                      <a href={m.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{m.title || m.url}</a>{m.year && <span className="text-muted-foreground"> ({m.year})</span>}
                      <p className="truncate text-xs text-muted-foreground">{[m.citation, m.doi && `doi:${m.doi}`, m.credit && `© ${m.credit}`, m.license].filter(Boolean).join(" · ")}</p>
                      {k === "audio" && <audio controls preload="none" src={m.url} className="mt-1 h-8 w-full" />}
                    </div>{del}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {items && !items.length && <p className="text-sm text-muted-foreground">No media yet.</p>}
      </DialogContent>
    </Dialog>
  );
}
