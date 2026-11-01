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
export type ReviewStatus = "pending" | "verified" | "needs_id" | "more_info" | "rejected" | "accepted";
export type ReviewAction = "verify" | "reject" | "needs_id" | "more_info" | "suggest_id" | "reidentify" | "duplicate" | "comment" | "reopen";
export type ChecklistStatus = "native" | "endemic" | "introduced" | "vagrant" | "uncertain";

export interface Pack { id: PackId; name: string; emoji: string; color: string; blurb: string }
export interface Region { code: string; name: string; parent: string | null; kind?: string; lat?: number | null; lng?: number | null; sort?: number }
export interface Price { id: string; pack: PackId; region: string; paise: number; days: number; active?: boolean }
export interface SpeciesImage { url: string; credit?: string; license?: string }
export interface Species {
  id: string; pack: PackId; common: string; sci: string; family: string; venom: Venom; toxic: "poisonous" | "non";
  iucn: Iucn; endemic: boolean; sensitive: boolean; size?: string; habitat?: string; distribution?: string; id_notes?: string;
  genus?: string; order?: string; group?: string; authority?: string; refs?: string;
  behaviour?: string; similar?: string; images?: (SpeciesImage | string)[]; traits?: { color?: string[]; pattern?: string; time?: string }; regions: string[];
}
export interface Profile { is_owner?: boolean; id: string; email?: string; username: string; full_name?: string; phone?: string; home_region?: string; role: "user" | "reviewer" | "admin"; status: "approved" | "pending" | "blocked"; created_at?: string }
export interface Entitlement { id: string; user_id?: string; pack: PackId; region: string; valid_until: string | null; source: string }
export interface Sighting {
  id: string; trip_id: string | null; user_id: string; username?: string; species_id: string | null; species_text?: string; count: number;
  lat: number | null; lng: number | null; observed_at: string; region_code: string; life_stage?: string; sex?: string; notes?: string; photos?: string[]; review_status: ReviewStatus; reviewed_by?: string | null; reviewed_at?: string | null;
  review_note?: string; original_species_id?: string | null; original_species_text?: string | null; id_confidence?: string; evidence?: string; mortality?: string; origin?: string;
  habitat?: string; microhabitat?: string; behaviour?: string; activity?: string; weather?: string; temperature_c?: number | null; elevation_m?: number | null; accuracy_m?: number | null;
  location_name?: string; state_code?: string | null; district_code?: string | null; island_code?: string | null; privacy?: string; duplicate_of?: string | null; full_name?: string;
  photo_rows?: { id: string; url: string; feature?: string; taken_at?: string | null }[]; reviews?: ObservationReview[];
}
export interface ObservationReview { id: number; sighting_id: string; reviewer_id: string | null; reviewer_name: string; action: ReviewAction; from_species_id: string | null; to_species_id: string | null; status_after: string | null; comment: string; created_at: string }
export interface ReviewerSubmission { id: string; submitted_by: string; user_id?: string; username?: string; full_name?: string; kind: "new_species" | "species_update" | "regional_checklist" | "checklist_change" | "reference_photo"; region_code: string | null; species_id: string | null; payload: Record<string, unknown>; note: string; refs: string; status: "pending" | "approved" | "rejected"; decided_by?: string | null; decided_at?: string | null; decision_note?: string; created_at: string }
export interface Trip {
  id: string; user_id: string; username?: string; full_name?: string; region_code: string; protocol: string; started_at: string; ended_at?: string;
  survey_type?: string; title?: string; status?: string; paused_min?: number; location_name?: string; state_code?: string | null; district_code?: string | null; island_code?: string | null; weather?: string;
  start_accuracy_m?: number | null; start_elevation_m?: number | null;
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
export interface AuditEntry { id: number; at: string; actor: string | null; actor_name: string; tbl: string; action: string; row_key: string; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null }
export interface FeedbackEntry { id: string; created_at: string; user_id: string | null; name: string; email: string; r_guide: number | null; r_identify: number | null; r_recording: number | null; r_overall: number; species_id: string | null; correction: string; comment: string; page: string; status: "new" | "read" | "done" }
export interface AccessRequest { id: string; user_id: string; requested_role: "reviewer" | "admin"; note: string; status: "pending" | "approved" | "declined"; created_at: string; decided_at?: string | null }
export interface ChecklistEntry { species_id: string; status: ChecklistStatus }

export interface HWApi {
  session(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<Profile>;
  signUp(f: { email: string; password: string; username: string; full_name: string; phone?: string; home_region: string; requested_role?: string }): Promise<Profile | null>;
  signInWithGoogle(redirectTo?: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  isRecovery(): boolean;
  /** null = the database is older than the app (setup.sql not re-run) */
  hasAdmin(): Promise<boolean | null>;
  requestAccess(note?: string): Promise<AccessRequest>;
  settings(): Promise<Record<string, unknown>>;
  myAccessRequest(): Promise<AccessRequest | null>;
  linkError(): string;
  updatePassword(password: string): Promise<Profile | null>;
  submitFeedback(f: Record<string, unknown>): Promise<void>;
  checklistEntries(region: string): Promise<ChecklistEntry[]>;
  onCatalogChange?(cb: (what: string) => void): () => void;
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
    review(id: string, status: ReviewStatus, note?: string): Promise<void>;
    reviewObservation(id: string, action: ReviewAction, speciesId?: string | null, comment?: string, duplicateOf?: string | null): Promise<Sighting>;
    annotateSpecies(id: string, patch: Record<string, unknown>): Promise<void>;
    upsertRegion(r: Partial<Region>): Promise<void>;
    deleteRegion(code: string): Promise<void>;
    submissions(): Promise<ReviewerSubmission[]>;
    submit(kind: ReviewerSubmission["kind"], o: { region?: string | null; species?: string | null; payload?: Record<string, unknown>; note?: string; refs?: string }): Promise<ReviewerSubmission>;
    decideSubmission(id: string, approve: boolean, note?: string): Promise<unknown>;
    setSetting(key: string, value: unknown): Promise<void>;
    exportAll(): Promise<Record<string, Record<string, unknown>[]>>;
    reviewTrip(tripId: string, status: ReviewStatus, note?: string): Promise<void>;
    deleteSighting(id: string): Promise<void>;
    deleteTrip(id: string): Promise<void>;
    roadkill(): Promise<{ surveys: Survey[]; records: RoadkillRecord[] }>;
    deleteRoadkill(id: string): Promise<void>;
    deleteSurvey(id: string): Promise<void>;
    auditLog(limit?: number): Promise<AuditEntry[]>;
    feedback(): Promise<FeedbackEntry[]>;
    accessRequests(): Promise<(AccessRequest & { username?: string; full_name?: string })[]>;
    decideAccess(id: string, approve: boolean): Promise<void>;
    setFeedbackStatus(id: string, status: string): Promise<void>;
  };
}

export interface HWGlobal {
  C: { APP_NAME: string; TAGLINE: string; SUPPORT_EMAIL: string; DEFAULT_REGION: string; SUPABASE_URL: string };
  DEMO: boolean;
  IUCN: Record<string, { name: string; color: string }>;
  VENOM: Record<string, { label: string; short: string; color: string }>;
  api: HWApi;
  STATUSES: Record<string, { label: string; tone: string }>;
  SURVEY_TYPES: Record<string, string>;
  EVIDENCE: Record<string, string>;
  GROUPS: Record<string, string>;
  util: { toCSV(rows: object[]): string; download(name: string, text: string | Blob, type?: string): void; downloadXlsx(name: string, sheets: Record<string, object[]>): Promise<void>; rupees(paise: number): string; uid(): string };
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
