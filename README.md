# HerpWatch

A field guide, sightings recorder and road-kill logger for the **reptiles and amphibians** of India, organised by state and country.

It combines a field guide, a guided identification helper, eBird-style checklists and a road-kill logger. Users pay only for the species groups they need, either for one state or for the whole country.

| Surface | File | Who |
|---|---|---|
| **Website + live data report** | `index.html` | Public |
| **Field app** (installable PWA) | `app.html` | Signed-in users |
| **Admin console** | `admin.html` | Admins |

## Features

**Field guide.** Each species has a photo gallery, *Common name (Scientific name)*, family, IUCN Red List status, and flags for venomous, mildly venomous, non-venomous, poisonous and endemic. Entries also cover ID notes, size, habitat, distribution notes, behaviour and similar species. The list is filtered to the selected state's checklist and can be searched or filtered by venomous, poisonous, threatened or endemic.

**Paid packs.** There are four packs: 🐍 Snakes · 🦎 Lizards & Geckos · 🐸 Frogs & Toads · 🐢 Turtles & Crocodiles. Each can be bought for **one state** or **the whole country**.
- **Free:** species names, safety flags, snakebite first aid, and all recording.
- **Paid:** photos, full field notes, offline download and the Identify helper.
- **Payments:** handled by Razorpay. The price is worked out on the server, and access is granted only by the payment webhook. The phone is never trusted.

**Identify.** A step-by-step helper: pick the group, then colours, pattern and time of day. It ranks likely species from the region's checklist and works offline.

**Checklists (eBird-style).** Choose a protocol: incidental, stationary, traveling, night walk or area search. The app runs a timer and records a GPS track and distance. For each species you can log a count, life stage, sex, notes, photos and a location pin, and add unlisted or unidentified animals. A "complete checklist" flag records whether every detected species was reported. Recording works offline and syncs when the phone is back online.

**Road-kill logger.** Start a survey (travel mode, road name, road type) and the app records the GPS track as survey effort. Tap **Road-kill here** at each carcass to log the group, species or "unidentified", count, condition, position on the road and a photo. A live map shows the track and the points, along with km covered and kills per 100 km. Data exports as CSV or GeoJSON.

**Admin.**
- Species: add, edit, delete and bulk-import, including images, IUCN status, venom and poison flags, and identification traits.
- Regional checklists per state or country, with a paste-scientific-names option.
- Pack prices per region.
- Users: role (user, reviewer, admin), block, and grant or revoke packs.
- Sighting review: accept or reject.
- Road-kill surveys and records, plus a map with exact locations (admins only).
- CSV and GeoJSON exports.

**Website.** Feature overview, pack prices and a **live report**:
- KPI tiles
- monthly trend
- sightings by group, by IUCN category and by venom status
- top species and top road-kill species
- a distribution map with survey tracks

Each chart has a table view, and the page prints to an A4 PDF.

**Privacy for threatened species.** Public maps round locations to about 1 km, or about 10 km for species flagged *sensitive* (traded or threatened). Exact points are visible only to the observer and to reviewers.

## Architecture

The architecture deliberately reuses the patterns of the two reference repositories:

| From | Reused here |
|---|---|
| `sumit3850/Tour-management-` (front end + database) | Single-file HTML pages with no build step; the card, pill and button design language and Geist/Calistoga fonts; the Supabase sign-up trigger that creates the profile row from user metadata; idempotent, re-runnable SQL. |
| `sumit3850/EST-v2.0` (back end) | Supabase Auth + RLS as the only security boundary; **licences decided on the server** (`entitlements`, like EST's `licenses`); the Razorpay webhook with HMAC check and idempotency (`supabase/functions/razorpay-webhook`); offline-first PWA with an outbox; GPS `watchPosition` with jitter filtering; satellite and OSM map layers; CSV and GeoJSON exports; Capacitor Android shell. |

```
config.js        deployment settings (the only file you edit). Empty SUPABASE_URL = demo mode
common.js        HW.api: one data API with two back-ends (Supabase | localStorage demo)
data/seed.js     species catalogue, regions, packs, default prices (single source of truth)
style.css        shared design tokens, with light and dark modes
app.html         field app        admin.html  admin console        index.html  website + report
sw.js            offline cache (app shell + map tiles)
supabase/schema.sql                       tables, RLS, views, RPCs, storage buckets
supabase/seed.sql                         generated: node scripts/build-seed.mjs
supabase/functions/create-order           prices the cart server-side, creates the Razorpay order
supabase/functions/razorpay-webhook       verifies the payment, writes entitlements
```

## Try it now (demo mode)

```bash
cd herpwatch
```

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/app.html` and sign in as **field@demo / field**, or as **admin@demo / admin** for `admin.html`. In demo mode, data lives in `localStorage`, "purchases" are free and instant, and sample records fill the report.

## Go live

1. **Supabase.** Create a project.
   - In the SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
   - Under Authentication → Email, turn "Confirm email" on or off as you prefer.
2. **Config.** Put the project URL and anon key in `config.js`.
3. **Make yourself admin.** Sign up in the app, then run:
   ```sql
   update public.profiles set role = 'admin' where username = '<you>';
   ```
4. **Payments (Razorpay).** Deploy both functions and set their secrets:
   ```bash
   supabase functions deploy create-order
   ```
   ```bash
   supabase functions deploy razorpay-webhook --no-verify-jwt
   ```
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=xxx
   ```
   Then in Razorpay, go to Settings → Webhooks and add `https://<ref>.functions.supabase.co/razorpay-webhook` for the events `payment.captured` and `refund.processed`.
5. **Host.** Any static host works (GitHub Pages, Vercel, Netlify). Everything is plain files.
6. **Android / iOS (optional).** Copy `native/` from EST-v2.0 and change `appId` and `appName` in `capacitor.config.ts`. Add `@capacitor-community/background-geolocation` so road-kill tracks keep recording while the screen is off. The web version holds a screen wake-lock instead.

## Before publishing: verify the data

The 32 seed species, their IUCN categories, ranges and notes are **starter data for the prototype**. Check every record against the [IUCN Red List](https://www.iucnredlist.org), the [Reptile Database](https://reptile-database.reptarium.cz) and [Amphibian Species of the World](https://amphibiansoftheworld.amnh.org). Add licensed photos (with credit and licence) from the admin console.

## Roadmap ideas

- Photo identification: a model trained on reviewed sighting photos, as in Merlin Photo ID.
- Frog call identification from audio recordings.
- Reviewer workflow by region, with automatic flagging of out-of-range records.
- Darwin Core / GBIF export.
- Google Play billing for the store build.
