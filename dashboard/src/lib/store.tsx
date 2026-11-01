import * as React from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

import type { HWGlobal, Pack, Profile, Region, Species, Survey, RoadkillRecord, Trip, Sighting } from "@/lib/hw";

/* ───────── toast ───────── */
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = React.createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="flex max-w-sm items-center gap-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
            {t.tone === "ok" ? <CheckCircle2 className="size-4 text-primary" /> : <AlertTriangle className="size-4 text-destructive" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────── shared catalogue + submissions data ───────── */
export interface DataState {
  hw: HWGlobal;
  me: Profile;
  isAdmin: boolean;
  packs: Pack[];
  regions: Region[];
  species: Species[];
  trips: Trip[];
  sightings: Sighting[];
  surveys: Survey[];
  records: RoadkillRecord[];
  loading: boolean;
  reload: (what?: ("catalog" | "submissions")[]) => Promise<void>;
  // lookups
  spById: Record<string, Species>;
  packOf: (id?: string | null) => Pack;
  regionName: (code?: string | null) => string;
}
const DataCtx = React.createContext<DataState | null>(null);
export function useData() {
  const v = React.useContext(DataCtx);
  if (!v) throw new Error("useData outside provider");
  return v;
}

export function DataProvider({ hw, me, children }: { hw: HWGlobal; me: Profile; children: React.ReactNode }) {
  const toast = useToast();
  const isAdmin = me.role === "admin";
  const [s, set] = React.useState({
    packs: [] as Pack[], regions: [] as Region[], species: [] as Species[],
    trips: [] as Trip[], sightings: [] as Sighting[], surveys: [] as Survey[], records: [] as RoadkillRecord[], loading: true,
  });

  const reload = React.useCallback(async (what: ("catalog" | "submissions")[] = ["catalog", "submissions"]) => {
    try {
      const patch: Partial<typeof s> = {};
      if (what.includes("catalog")) {
        const [packs, regions, species] = await Promise.all([hw.api.packs(), hw.api.regions(), isAdmin ? hw.api.admin.allSpecies() : hw.api.speciesIndex()]);
        Object.assign(patch, { packs, regions, species });
      }
      if (what.includes("submissions")) {
        const [trips, sightings, rk] = await Promise.all([hw.api.admin.trips(), hw.api.admin.sightings(), hw.api.admin.roadkill()]);
        Object.assign(patch, { trips, sightings, surveys: rk.surveys, records: rk.records });
      }
      set((old) => ({ ...old, ...patch, loading: false }));
    } catch (e) {
      toast((e as Error).message, "error");
      set((old) => ({ ...old, loading: false }));
    }
  }, [hw, isAdmin, toast]);

  React.useEffect(() => { reload(); }, [reload]);

  const value = React.useMemo<DataState>(() => {
    const spById = Object.fromEntries(s.species.map((x) => [x.id, x]));
    const packMap = Object.fromEntries(s.packs.map((p) => [p.id, p]));
    const regMap = Object.fromEntries(s.regions.map((r) => [r.code, r.name]));
    return {
      hw, me, isAdmin, ...s, reload, spById,
      packOf: (id) => packMap[id || ""] || { id: id || "", name: id || "Unknown", emoji: "", color: "#888", blurb: "" },
      regionName: (code) => (code ? regMap[code] || code : "—"),
    };
  }, [hw, me, isAdmin, s, reload]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** Run an async action with a toast on success / failure. */
export function useAction() {
  const toast = useToast();
  return React.useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast((e as Error).message, "error"); return false; }
  }, [toast]);
}
