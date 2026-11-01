export const initials = (s?: string) =>
  (s || "?").split(/[\s._-]+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").slice(0, 2) || "?";

export function timeAgo(iso?: string) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 2) return "yesterday";
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const num = (n?: number) => (n ?? 0).toLocaleString("en-IN");

export const PROTOCOLS: Record<string, string> = {
  incidental: "Incidental",
  stationary: "Stationary",
  traveling: "Traveling",
  night_walk: "Night walk / VES",
  area: "Area search",
};
export const CHECKLIST_STATUSES = ["native", "endemic", "introduced", "vagrant", "uncertain"] as const;
