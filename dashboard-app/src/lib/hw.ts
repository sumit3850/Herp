/*
 * Typed bridge to the shared HerpWatch data layer (../common.js).
 * The field app, website and this dashboard all use the same HW.api, so a record
 * saved in the field shows up here with no extra sync code. Demo vs Supabase mode
 * is decided by ../config.js.
 */
import { createClient } from "@supabase/supabase-js";

export type PackId = "snakes" | "lizards" | "frogs" | "turtles" | string;
export type Venom = "venomous" | "mild" | "non";
export type Iucn = "CR" | "EN" | "VU" | "NT" | "LC" | "DD" | "NE";
export type ReviewStatus = "pending" | "accepted" | "rejected";
export type ChecklistStatus = "native" | "endemic" | "introduced" | "vagrant" | "uncertain";

export interface Pack { id: PackId; name: string; emoji: string; color: string; blurb: string }
export interface Region { code: string; name: string; parent: string | null }
export interface Price { id: string; pack: PackId; region: string; paise: number; days: number; active?: boolean }
export interface SpeciesImage { url: string; credit?: string; license?: string }
export interface Species {
  id: string; pack: PackId; common: string; sci: string; family: string; venom: Venom; toxic: "poisonous" | "non";
  iucn: Iucn; endemic: boolean; sensitive: boolean; size?: string; habitat?: string; distribution?: string; id_notes?: string;
  behaviour?: string; similar?: string; images?: (SpeciesImage | string)[]; traits?: { color?: string[]; pattern?: string; time?: string }; regions: string[];
}
export interface Profile { id: string; email?: string; username: string; full_name?: string; phone?: string; home_region?: string; role: "user" | "reviewer" | "admin"; status: "approved" | "pending" | "blocked"; created_at?: string }
export interface Entitlement { id: string; user_id?: string; pack: PackId; region: string; valid_until: string | null; source: string }
export interface Sighting {
  id: string; trip_id: string | null; user_id: string; username?: string; species_id: string | null; species_text?: string; count: number;
  lat: number | null; lng: number | null; observed_at: string; region_code: string; life_stage?: string; sex?: string; notes?: string; photos?: string[]; review_status: ReviewStatus;
}
export interface Trip {
  id: string; user_id: string; username?: string; full_name?: string; region_code: string; protocol: string; started_at: string; ended_at?: string;
  duration_min?: number; distance_km?: number; observers?: number; complete?: boolean; track?: [number, number][]; lat?: number; lng?: number; notes?: string; sightings: Sighting[];
}
export interface Survey { id: string; user_id: string; username?: string; region_code: string; mode: string; road_name: string; road_type: string; started_at: string; ended_at?: string; distance_km: number; track: [number, number][]; notes?: string }
export interface RoadkillRecord { id: string; survey_id: string; user_id: string; username?: string; species_id: string | null; species_text?: string; pack: PackId; count: number; lat: number; lng: number; observed_at: string; condition: string; side?: string; notes?: string; photos?: string[]; region_code: string }
export interface Stats {
  totals: { sightings: number; records: number; species: number; observers: number; roadkill: number; roadkill_surveys: number; roadkill_km: number; roadkill_per_100km: number };
  by_pack: { pack: string; n: number }[]; by_iucn: { iucn: string; n: number }[]; by_region: { region: string; n: number }[];
  by_month: { month: string; sightings: number; roadkill: number }[]; top_species: { species_id: string; common: string; sci: string; n: number }[];
  roadkill_species: { species_id: string; common: string; sci: string; n: number }[];
}
export interface ChecklistEntry { species_id: string; status: ChecklistStatus }

export interface HWApi {
  mode: "demo" | "supabase";
  session(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<Profile>;
  signUp(f: { email: string; password: string; username: string; full_name: string; phone?: string; home_region: string }): Promise<Profile | null>;
  signInWithGoogle(redirectTo?: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  packs(): Promise<Pack[]>;
  regions(): Promise<Region[]>;
  prices(): Promise<Price[]>;
  speciesIndex(): Promise<Species[]>;
  checklist(region: string): Promise<string[]>;
  publicStats(): Promise<Stats>;
  resetDemo?: () => void;
  admin: {
    allSpecies(): Promise<Species[]>;
    upsertSpecies(s: Species): Promise<Species>;
    deleteSpecies(id: string): Promise<void>;
    checklistEntries(region: string): Promise<ChecklistEntry[]>;
    setChecklistEntry(region: string, speciesId: string, status: ChecklistStatus | null): Promise<void>;
    copyChecklist(from: string, to: string): Promise<number>;
    upsertPrice(p: Partial<Price>): Promise<void>;
    deletePrice(id: string): Promise<void>;
    users(): Promise<(Profile & { packs: Entitlement[] })[]>;
    setUser(id: string, patch: Partial<Profile>): Promise<void>;
    grant(userId: string, pack: string, region: string, days: number | null): Promise<void>;
    revoke(entId: string): Promise<void>;
    trips(): Promise<Trip[]>;
    sightings(): Promise<Sighting[]>;
    review(id: string, status: ReviewStatus): Promise<void>;
    reviewTrip(tripId: string, status: ReviewStatus): Promise<void>;
    deleteSighting(id: string): Promise<void>;
    deleteTrip(id: string): Promise<void>;
    roadkill(): Promise<{ surveys: Survey[]; records: RoadkillRecord[] }>;
    deleteRoadkill(id: string): Promise<void>;
    deleteSurvey(id: string): Promise<void>;
  };
}

export interface HWGlobal {
  C: { APP_NAME: string; TAGLINE: string; SUPPORT_EMAIL: string; DEFAULT_REGION: string; SUPABASE_URL: string };
  DEMO: boolean;
  IUCN: Record<string, { name: string; color: string }>;
  VENOM: Record<string, { label: string; short: string; color: string }>;
  CENTROIDS: Record<string, [number, number]>;
  api: HWApi;
  util: { toCSV(rows: object[]): string; download(name: string, text: string, type?: string): void; rupees(paise: number): string; uid(): string };
}

declare global {
  interface Window { HW: HWGlobal; supabase?: { createClient: typeof createClient } }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

/** Loads config → seed → common.js in order (shared with the field app) and returns window.HW. */
export async function bootHW(): Promise<HWGlobal> {
  if (window.HW) return window.HW;
  window.supabase = { createClient };
  // dev: Vite serves these from the repo root; prod: they sit one level above /dashboard/
  const base = import.meta.env.DEV ? "/" : new URL("../", window.location.href).href;
  for (const f of ["config.js", "data/seed.js", "common.js"]) await loadScript(base + f);
  return window.HW;
}

export const hw = () => window.HW;
