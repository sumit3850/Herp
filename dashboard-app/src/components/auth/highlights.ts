import type { Testimonial } from "@/components/ui/sign-in";

/*
 * The SignInPage "testimonials" slots hold honest feature highlights (no invented
 * users or quotes). Each avatar is a Lucide icon on a tinted tile.
 */
const ICONS = {"clipboard-list": "<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" /><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" /><path d=\"M12 11h4\" /><path d=\"M12 16h4\" /><path d=\"M8 11h.01\" /><path d=\"M8 16h.01\" />", "route": "<circle cx=\"6\" cy=\"19\" r=\"3\" /><path d=\"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15\" /><circle cx=\"18\" cy=\"5\" r=\"3\" />", "list-checks": "<path d=\"m3 17 2 2 4-4\" /><path d=\"m3 7 2 2 4-4\" /><path d=\"M13 6h8\" /><path d=\"M13 12h8\" /><path d=\"M13 18h8\" />"} as const;
const tile = (icon: keyof typeof ICONS, bg: string, fg: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='${bg}'/><g transform='translate(18 18) scale(1.17)' fill='none' stroke='${fg}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${ICONS[icon]}</g></svg>`);

export const HIGHLIGHTS: Testimonial[] = [
  { avatarSrc: tile("clipboard-list", "#e3efe6", "#1f5b3c"), name: "eBird-style checklists", handle: "Timed · GPS tracked · offline", text: "Every submission lands here for review within seconds of syncing." },
  { avatarSrc: tile("route", "#fde4e4", "#9b2c2c"), name: "Road-kill transects", handle: "Tracks + carcass points", text: "Kills per 100 km, by road, species and season." },
  { avatarSrc: tile("list-checks", "#fbf0d6", "#8a5a0b"), name: "Core checklists", handle: "Per state & region", text: "Curate what occurs where. It drives the app, the paywall and the review flags." },
];

// shared with the field app; in production /dashboard/ sits next to /assets/
export const HERO_IMAGE = import.meta.env.DEV ? "/assets/hero-herp.svg" : "../assets/hero-herp.svg"; // swap for a licensed photo if you like
