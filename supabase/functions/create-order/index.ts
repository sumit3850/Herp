// HerpWatch — create a Razorpay order for the packs the user picked.
//
// The PRICE IS COMPUTED HERE from public.pack_prices, never taken from the
// phone. The priced items are stored in public.orders; the webhook later
// grants exactly those items once Razorpay confirms the payment.
//
// Deploy:  supabase functions deploy create-order
// Secrets: supabase secrets set RAZORPAY_KEY_ID=rzp_live_… RAZORPAY_KEY_SECRET=…
//          (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected automatically)

import { createClient } from "jsr:@supabase/supabase-js@2";

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

type Item = { pack: string; region: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!KEY_ID || !KEY_SECRET || !SERVICE) return json(500, { error: "function not configured" });

  // who is buying? (verify the caller's JWT)
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "sign in first" });

  let items: Item[] = [];
  try { items = (await req.json())?.items ?? []; } catch { return json(400, { error: "bad json" }); }
  items = items.filter((i) => i && typeof i.pack === "string" && typeof i.region === "string").slice(0, 20);
  if (!items.length) return json(400, { error: "no items" });

  const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const { data: prices, error } = await sb.from("pack_prices").select("pack_id,region_code,paise,days").eq("active", true);
  if (error) return json(500, { error: error.message });
  const { data: regions } = await sb.from("regions").select("code");
  const known = new Set((regions ?? []).map((r) => r.code));

  const lines = [];
  for (const { pack, region } of items) {
    if (!known.has(region)) return json(400, { error: `unknown region ${region}` });
    const p = prices!.find((x) => x.pack_id === pack && x.region_code === region) ??
      (region.includes("-") ? prices!.find((x) => x.pack_id === pack && x.region_code === "*state") : undefined);
    if (!p) return json(400, { error: `no price for ${pack} in ${region}` });
    lines.push({ pack, region, paise: p.paise, days: p.days });
  }
  const amount = lines.reduce((s, l) => s + l.paise, 0);
  if (amount < 100) return json(400, { error: "amount too small" });

  const rz = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${KEY_ID}:${KEY_SECRET}`), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount, currency: "INR", receipt: `hw_${Date.now()}`,
      notes: { user_id: user.id, items: lines.map((l) => `${l.pack}@${l.region}`).join(",").slice(0, 250) },
    }),
  }).then((r) => r.json());
  if (!rz?.id) return json(502, { error: rz?.error?.description ?? "razorpay order failed" });

  const { error: insErr } = await sb.from("orders").insert({ id: rz.id, user_id: user.id, items: lines, amount_paise: amount });
  if (insErr) return json(500, { error: insErr.message });

  return json(200, {
    order_id: rz.id, amount, key_id: KEY_ID,
    description: lines.map((l) => `${l.pack} · ${l.region}`).join(", "),
  });
});
