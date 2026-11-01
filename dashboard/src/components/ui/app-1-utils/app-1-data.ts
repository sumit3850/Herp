import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Inbox,
  LayoutDashboard,
  Map,
  Route,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { ChartConfig } from "@/components/ui/chart";

/* Navigation shared by the App1 demo and the live HerpWatch dashboard. */
export type NavId = "overview" | "submissions" | "checklists" | "species" | "roadkill" | "users" | "packs" | "map" | "reports";
export const app1Nav: { group: string; items: { id: NavId; label: string; icon: LucideIcon }[] }[] = [
  { group: "Monitor", items: [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "submissions", label: "Submissions", icon: Inbox },
    { id: "roadkill", label: "Road-kill", icon: Route },
    { id: "map", label: "Map", icon: Map },
  ] },
  { group: "Manage", items: [
    { id: "checklists", label: "Core checklists", icon: ClipboardCheck },
    { id: "species", label: "Species", icon: BookOpen },
    { id: "users", label: "Users", icon: Users },
    { id: "packs", label: "Packs & pricing", icon: Wallet },
  ] },
  { group: "Share", items: [{ id: "reports", label: "Public report", icon: BarChart3 }] },
];

/* ── Static sample data for the stand-alone <App1 /> demo ── */
export const app1User = { name: "Sumit Rao", email: "admin@herpwatch.app", initials: "SR", avatar: "" };

export const app1Chart = [
  { week: "W1", opened: 18, completed: 12 },
  { week: "W2", opened: 22, completed: 17 },
  { week: "W3", opened: 19, completed: 18 },
  { week: "W4", opened: 27, completed: 21 },
  { week: "W5", opened: 31, completed: 26 },
  { week: "W6", opened: 24, completed: 25 },
  { week: "W7", opened: 29, completed: 27 },
  { week: "W8", opened: 35, completed: 30 },
];
export const app1ChartConfig = {
  opened: { label: "Checklists submitted", color: "var(--chart-3)" },
  completed: { label: "Checklists reviewed", color: "var(--chart-1)" },
} satisfies ChartConfig;

type Person = { name: string; initials: string; avatar: string };
const p = (name: string): Person => ({ name, initials: name.split(" ").map((w) => w[0]).join("").slice(0, 2), avatar: "" });

export const app1Projects: { id: string; name: string; description: string; status: "In progress" | "In review" | "Planning"; progress: number; team: Person[]; dueDate: string }[] = [
  { id: "an", name: "Andaman & Nicobar core checklist", description: "Verify island endemics against the latest literature", status: "In review", progress: 82, team: [p("Sumit Rao"), p("Anu K")], dueDate: "Dec 15" },
  { id: "wg", name: "Western Ghats frog survey", description: "Monsoon night-walk transects in Kerala & Karnataka", status: "In progress", progress: 54, team: [p("Ravi S"), p("Anu K")], dueDate: "Jan 30" },
  { id: "rk", name: "NH-4 road-kill monitoring", description: "Fortnightly road-kill transects on the Andaman Trunk Road", status: "Planning", progress: 18, team: [p("Sumit Rao")], dueDate: "Feb 28" },
];

export const app1Activity = [
  { id: 1, person: p("Anu K"), action: "accepted 6 sightings in Kerala", time: "12 min ago" },
  { id: 2, person: p("Ravi S"), action: "submitted a night-walk checklist (9 species)", time: "1 h ago" },
  { id: 3, person: p("Sumit Rao"), action: "added Bungarus andamanensis to the A&N checklist", time: "3 h ago" },
  { id: 4, person: p("Ravi S"), action: "logged 4 road-kills on NH-4 (12.4 km)", time: "Yesterday" },
];
