import type { Testimonial } from "@/components/ui/sign-in";

/*
 * The SignInPage "testimonials" slots are used for honest feature highlights
 * (no invented users or quotes). Avatars are tiny inline emoji tiles.
 */
const tile = (emoji: string, bg: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='${bg}'/><text x='32' y='44' font-size='34' text-anchor='middle'>${emoji}</text></svg>`);

export const HIGHLIGHTS: Testimonial[] = [
  { avatarSrc: tile("📝", "#e3efe6"), name: "eBird-style checklists", handle: "Timed · GPS tracked · offline", text: "Every submission lands here for review within seconds of syncing." },
  { avatarSrc: tile("🛣️", "#fde4e4"), name: "Road-kill transects", handle: "Tracks + carcass points", text: "Kills per 100 km, by road, species and season." },
  { avatarSrc: tile("✅", "#fbf0d6"), name: "Core checklists", handle: "Per state & region", text: "Curate what occurs where — it drives the app, the paywall and the review flags." },
];

// shared with the field app; in production /dashboard/ sits next to /assets/
export const HERO_IMAGE = import.meta.env.DEV ? "/assets/hero-herp.svg" : "../assets/hero-herp.svg"; // swap for a licensed photo if you like
