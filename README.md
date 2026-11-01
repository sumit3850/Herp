# HerpWatch

A field recording and species documentation platform for the **reptiles and amphibians** of India: herping sessions with GPS tracks, observations with photos, regional checklists down to districts and islands, expert review and a public map.

| Surface | File | Who |
|---|---|---|
| **Field app** (installable, works offline) | `app.html` + `app.js` | Everyone with an account |
| **Website + live data report** | `index.html` | Public |
| **Dashboard** (React + TypeScript + Tailwind + shadcn/ui) | `dashboard/` → served at `/dashboard/` | Reviewers and the Admin |

## Roles

| Role | Can |
|---|---|
| **User** (observer) | Record sessions and observations, edit or delete their own unverified records, reply to reviewers, see checklists, maps, life list and stats, export their data. |
| **Reviewer** | Everything a user can, plus: verify, reject, ask for more information, mark “needs identification”, suggest or change an identification, mark duplicates, comment; add species to regional checklists; update distribution, endemism, conservation status, reference photos and references; propose new species, taxonomy corrections and regional checklists. |
| **Admin** (platform owner) | Everything, plus: user management (assign/revoke Reviewer, suspend), species and taxonomy, regions, approving reviewer proposals, deleting records, platform settings, full export and audit log. |

**There is exactly one Admin: the platform owner.** The database enforces this (`platform_owner` table, `is_admin()`, the `guard_profile` trigger): no user or reviewer can become Admin, request it, or grant it, through the app or the API. Ownership can only be set or transferred in the Supabase SQL Editor with `select public.set_platform_owner('email');`. When an older database is upgraded, the earliest existing admin becomes the owner automatically and any other admins become reviewers.

## Field app

Six tabs: **Home · Record · Explore · Checklist · My records · Profile.**

- **Home.** A large **START NEW HERPING SESSION** button (or the running session with its timer), **Add an observation without a session**, personal stats (life list, observations, sessions, hours, distance, verified records), observations per month and **your species by year** (to today’s date vs the whole year).
- **Record (herping session).** Pick the survey type: *Day herping, Night herping, Road survey, Transect, Habitat survey, Opportunistic, Creek & mangrove, Stream & wetland*. Date and start time (adjustable), GPS position, accuracy, elevation, place name, state, district and island are captured automatically, and a **Record GPS track** switch records the route. While recording, the screen shows the timer, distance and place, a **Likely species** list (species recorded within 10 km, or the island/district/state checklist when offline) with a one-tap **+** (each tap adds one individual with its own time and GPS point), a search box to add any species or an unidentified animal, and a bar with filters, notes, recorded species and **Stop**. Stop asks “Are you done herping?”; *Stop track* opens a review page (date, location or *Choose location*, survey type, observers, minutes, distance, complete list yes/no, weather, comments, the species list) where you can go back to recording or **Submit**. The session survives app restarts and flat batteries.
- **Observations.** Each keeps its own timestamp and GPS point. Fields: species (with family, genus and order shown) or free text for unidentified animals, ID confidence, evidence (direct sighting, shed skin, eggs, tracks, call, remains, photo only), count, life stage (egg, hatchling, tadpole, juvenile, subadult, adult, unknown), sex, condition (alive, road-kill, other mortality), wild or captive, habitat, microhabitat, behaviour, activity, weather, temperature, notes, several photos (with view labels and metadata) and privacy (public, restricted, private). Animals never need to be handled; the form says so.
- **Species pages** (from Explore, Checklist or My records): full-width photo gallery with credits, name, description, a play button for calls, videos (uploaded or YouTube), safety notes, a **distribution map** (checklist regions plus public records), habitat and conservation, and **research papers** with DOI links.
- **Explore.** *Nearby*: species seen in the region over the last 7/30/365 days, public records, observers, and **life / year / month targets** (species seen nearby that are missing from your lists). *Map*: public observations filtered by species, family, date, region (state, district, island) and status, with your own routes as a separate layer. *Species*: field guide with group, order, family and genus filters and grid or list view. *Identify*: step-by-step helper. *Top*: leaderboard of recorders by distinct species (all time, this year, this month; by region and group).
- **Checklist.** Any state, UT, district, island or region. Filter by group, order, family, genus, seen or not yet recorded. **Only your own observations tick a species**; a species being on a checklist never marks it as seen. Shows first and most recent observation dates.
- **My records.** Observations with verification status, reviewer notes, the review history and your original identification if a reviewer changed it; reply to reviewers; edit; delete unless verified. Sessions split into *On this phone* and *Uploaded*, each with a species tile, route map and GPX download. Life list with first and last dates. Export as **CSV, Excel or PDF**.
- **Profile.** Account, sync status, species packs, apply to become a reviewer, settings (default privacy, species names as common/scientific/both, km or miles, theme), feedback, share, check for updates.

### Verification

Statuses: **Pending review · Verified · Needs identification · More information required · Rejected.** Every reviewer action is stored in `observation_reviews` (append-only) and the observer sees it in the app. **The original identification is never overwritten**: `original_species_id` / `original_species_text` are set when the record is created and can’t be changed. If an observer edits the species, count, place, time, evidence or life stage of a reviewed record, it goes back to *Pending*. Verified records can’t be deleted by the observer.

### Privacy

- *Public*: on the public map. *Restricted*: counted in statistics, exact point hidden from the public. *Private*: only the observer and reviewers.
- **Sensitive species** are always blurred on public maps (precision set by the Admin, default ~10 km), whatever the observer chooses.

### Offline

Everything is written to the phone first (localStorage, IndexedDB and the Cache API, so one cleared store doesn’t lose data). Photos taken offline are kept in IndexedDB and uploaded at sync. Records get their ID on the phone and are sent with upserts, so re-sending never creates duplicates and timestamps stay as recorded. Connectivity is judged by real requests, not `navigator.onLine`. Signed-out users can record offline and upload after signing in.

## Database

`supabase/schema.sql` (one re-runnable file, also bundled into `supabase/setup.sql`):

| Area | Tables |
|---|---|
| Accounts & roles | `profiles`, `platform_owner`, `access_requests` |
| Taxonomy & species | `species_media` (photos, videos, calls, papers), `species` (common/scientific name, authority, family, genus, order, group, IUCN, venom, endemic, sensitive, references, photos), `packs` |
| Regions & checklists | `regions` (country, state, UT, district, island, region, protected area; with centre coordinates), `checklist` |
| Field data | `trips` (sessions), `track_points`, `sightings` (observations), `photos` |
| Review | `observation_reviews`, `reviewer_submissions` (proposals) |
| Platform | `platform_settings`, `audit_log`, `feedback`, `pack_prices`, `entitlements`, `orders` |

Security is row-level security plus triggers; the apps hold only the public key. Public data comes through `public_stats`, `public_points`, `public_observations` and `public_leaderboard`, which apply the privacy rules.

## Install as an app

The website and the field app have **Install app** buttons (`install.js`). On Android and desktop Chrome/Edge they open the browser's install prompt; on iPhone/iPad they show the *Share → Add to Home Screen* steps. Once installed, HerpWatch opens full-screen from the home screen, works offline, and has shortcuts to *New checklist* and *Road-kill survey*. Icons are in `assets/` (`icon-192.png`, `icon-512.png`, maskable, Apple touch).

## Design system

The website, field app and dashboard share one look:
- **Type:** Geist and Geist Mono throughout.
- **Icons:** [Lucide](https://lucide.dev) line icons (ISC). The plain-HTML pages use `assets/icons.js`, generated by `scripts/build-icons.mjs`; the dashboard uses `lucide-react`.
- **Groups:** each group (snakes, lizards, frogs, turtles) is shown by a colour dot, not emoji.
- **Thumbnails:** species without a photo show a specimen-label monogram (e.g. *Nn* for *Naja naja*) on the group colour.
- **Hero:** `assets/hero-herp.svg` is a topographic-contour illustration. Replace it with a licensed field photograph if you prefer.

## Admin dashboard (source `dashboard-app/`, built into `dashboard/`)

An EST-style operations dashboard built on the shadcn **App1** layout: a collapsible sidebar, KPI cards, area charts and activity feeds. It works in light and dark mode, uses a slide-in sidebar on phones, and animates between pages.

- **Sign in / sign up.** Uses the `SignInPage` component, plus a matching `SignUpPage`, with the hero illustration (`assets/hero-herp.svg`) and feature highlights. *Continue with Google* uses Supabase OAuth; enable the Google provider in Supabase → Authentication.
- **Overview.** KPIs, a 12-week chart, checklist coverage per state, recent activity.
- **Observations.** Every observation and session, filtered by status, region (incl. districts and islands), survey type, dates and text; off-checklist records flagged. The review panel shows photos, map and all fields, the observer’s original ID, and the review history, with **Verify, Needs ID, Ask for info, Change ID, Suggest ID, Duplicate, Reject, Comment, Re-open**. CSV export.
- **Checklists.** Reviewers add species and set status; only the Admin removes. Paste a published list, copy another region, export CSV.
- **Species media.** Admin and reviewers add **photos, videos, calls (audio) and research papers** to any species: upload a file (stored in the `species` bucket, up to 50 MB) or paste a link (YouTube, publisher, DOI), with title, credit, licence, caption, full reference and year. Table `species_media`; photos, videos and calls follow the pack rules, papers are public. Reviewers can remove their own items; the Admin can remove any.
- **Species.** Admin: full editing incl. taxonomy (genus, order, group, authority) and bulk import. Reviewers: *Annotate* (distribution, habitat, endemic, IUCN, sensitive, reference photos, references).
- **Proposals / Approvals.** Reviewers propose new species, taxonomy changes, regional checklists and reference photos; the Admin approves (applied automatically) or rejects with a note.
- **Regions** (Admin): add districts, islands, protected areas, with centre coordinates.
- **Users** (Admin): assign or revoke Reviewer, suspend, approve reviewer applications, grant packs. The Admin role is shown as *Admin (owner)* and can’t be assigned.
- **Settings** (Admin): paid packs on/off, default privacy, sensitive-species precision, **full export** (Excel or JSON backup), ownership info.
- **Road-kill, Map, Feedback, Audit log, Packs & pricing, Public report.**

```bash
cd dashboard-app
```
```bash
npm install
```
```bash
npm run dev
```
Open the URL Vite prints. After changing the dashboard, run `npm run build`. It writes the production build into `../dashboard/`, which is committed so GitHub Pages works in either deploy mode. The dashboard reads the shared `../config.js`, `../common.js` and `../data/seed.js`, so it uses the same data as the field app.

`bash scripts/build-site.sh` builds everything into `_site/`. On every push to `main`, `.github/workflows/pages.yml` publishes it to GitHub Pages (set Settings → Pages → Source to **GitHub Actions** once).

### shadcn/ui structure
`dashboard-app/` is a standard shadcn project: `components.json`, the `@/*` path alias, Tailwind v4 with CSS variables in `src/index.css`, and components in **`src/components/ui`**. That folder matters because the shadcn CLI (`npx shadcn@latest add <component>`) and every shadcn component import from `@/components/ui/...`. Keeping that path means new components from the CLI or 21st.dev drop in without editing imports. `App1` (with its `app-1-utils/` sidebar, data and nav) and `SignInPage` live there unchanged; HerpWatch screens are in `src/pages/`.

## Architecture

The architecture deliberately reuses the patterns of the two reference repositories:

| From | Reused here |
|---|---|
| `sumit3850/Tour-management-` (front end + database) | Single-file HTML pages with no build step; the card, pill and button design language and Geist/Calistoga fonts; the Supabase sign-up trigger that creates the profile row from user metadata; idempotent, re-runnable SQL. |
| `sumit3850/EST-v2.0` (back end) | Supabase Auth + RLS as the only security boundary; **licences decided on the server** (`entitlements`, like EST's `licenses`); the Razorpay webhook with HMAC check and idempotency (`supabase/functions/razorpay-webhook`); offline-first PWA with an outbox; GPS `watchPosition` with jitter filtering; satellite and OSM map layers; CSV and GeoJSON exports; Capacitor Android shell. |

```
config.js        deployment settings (the only file you edit)
common.js        HW.api: the shared data layer (Supabase) for app, website and dashboard
data/seed.js     species catalogue, regions, packs, default prices (single source of truth)
style.css        shared design tokens, with light and dark modes
app.html/app.js  field app        index.html  website + report     admin.html → dashboard/
dashboard-app/   React + TS + Tailwind + shadcn admin dashboard source (Vite)
dashboard/       its committed production build (served at /dashboard/)
sw.js            offline cache (app shell + map tiles)
supabase/schema.sql                       tables, RLS, views, RPCs, storage buckets
supabase/seed.sql                         generated: node scripts/build-seed.mjs
supabase/tests/selftest.sql               86 checks with simulated users (rolled back)
tests/local-supabase/                     a small local stand-in for Supabase used for end-to-end tests
supabase/functions/create-order           prices the cart server-side, creates the Razorpay order
supabase/functions/razorpay-webhook       verifies the payment, writes entitlements
```

## Run the tests locally

The end-to-end tests use a local Postgres and `tests/local-supabase/server.mjs`, a small stand-in for Supabase Auth, the REST API and Storage. They are not needed to run the app.

## Go live (Supabase project `xjsigggtlxsscivwgzzl`)

`config.js` already points the website, field app and dashboard at **https://xjsigggtlxsscivwgzzl.supabase.co** with the publishable key. That key is public by design; row-level security in `supabase/schema.sql` protects the data.

**1. Create the back end.** Pick one option.
- **Option A, GitHub Action** (recommended; re-runs automatically when `supabase/**` changes):
  1. Supabase → **Connect** → copy the **Session pooler** URI and put your database password in it.
  2. GitHub → Settings → Secrets and variables → Actions → New repository secret: `SUPABASE_DB_URL` = that URI.
  3. Actions → **Supabase setup (database + backend)** → Run workflow.
- **Option B, SQL Editor:** open `supabase/setup.sql` (schema + catalogue in one file), paste it into Supabase → SQL Editor, and Run.

**Test it.** Paste `supabase/tests/selftest.sql` into the SQL Editor and Run. It runs 86 checks with simulated users: accounts, the sole-Admin rule, sessions, track points, photos, privacy, the review workflow (original ID kept, history, verified records protected), reviewer proposals, purchases and live updates. All its test data is rolled back, so your real data is never touched. Every row should show `ok = true`. The GitHub Action runs the same test after each setup.

**2. Auth settings.** In Supabase → Authentication:
- **URL Configuration → Site URL:** `https://sumit3850.github.io/Herp/app.html`.
- **Redirect URLs:** add `https://sumit3850.github.io/Herp/**`.
- **Providers → Email:** decide whether new users must confirm their e-mail (on by default).
- **Providers → Google:** optional, for "Continue with Google".

**3. The Admin (platform owner).** If you already were admin, running the new `setup.sql` makes you the owner automatically. On a new project: sign up in the app, then in the SQL Editor run `select public.set_platform_owner('you@example.com');` (or run the workflow with **admin_email**). The dashboard is at `/Herp/dashboard/`.

**4. Payments (optional).**
1. Add the secrets `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`.
2. Re-run the workflow. It deploys `create-order` and `razorpay-webhook` and sets the function secrets.
3. In Razorpay → Settings → Webhooks, add `https://xjsigggtlxsscivwgzzl.functions.supabase.co/razorpay-webhook` for the events `payment.captured` and `refund.processed`.

## Before publishing: verify the data

The 32 seed species, their IUCN categories, ranges and notes are **starter data for the prototype**. Check every record against the [IUCN Red List](https://www.iucnredlist.org), the [Reptile Database](https://reptile-database.reptarium.cz) and [Amphibian Species of the World](https://amphibiansoftheworld.amnh.org). Add licensed photos (with credit and licence) from the admin console.

## Roadmap ideas

- Photo identification: a model trained on reviewed sighting photos, as in Merlin Photo ID.
- Frog call identification from audio recordings.
- Reviewer workflow by region, with automatic flagging of out-of-range records.
- Darwin Core / GBIF export.
- Google Play billing for the store build.
