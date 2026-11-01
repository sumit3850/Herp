// HerpWatch — Razorpay webhook → server-side pack entitlements.
// (Adapted from EST-v2.0's licence webhook: same signature check & idempotency,
//  but grants per-pack, per-region entitlements from the server-priced order.)
//
// Deploy:  supabase functions deploy razorpay-webhook --no-verify-jwt
// Secrets: supabase secrets set RAZORPAY_WEBHOOK_SECRET=…
// Razorpay dashboard → Settings → Webhooks → Add:
//   URL     https://<ref>.functions.supabase.co/razorpay-webhook
//   Secret  the same RAZORPAY_WEBHOOK_SECRET
//   Events  payment.captured, refund.processed

import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const enc = new TextEncoder();
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "function not configured" });

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!sig || !timingSafeEqual(sig, await hmacHex(WEBHOOK_SECRET, raw))) return json(401, { error: "bad signature" });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return json(400, { error: "bad json" }); }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const type: string = evt?.event ?? "";

  if (type === "payment.captured") {
    const pay = evt?.payload?.payment?.entity;
    const orderId = String(pay?.order_id ?? "");
    const paymentId = String(pay?.id ?? "");
    const { data: order } = await sb.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) return json(200, { ok: false, reason: "unknown order" });
    if (order.status === "paid") return json(200, { ok: true, duplicate: true });          // idempotent
    if (Number(pay?.amount) < order.amount_paise) return json(200, { ok: false, reason: "amount mismatch" });

    const now = new Date();
    const rows = [];
    for (const it of order.items as { pack: string; region: string; days: number }[]) {
      // extend from the current expiry if the same pack+region is still running
      const { data: cur } = await sb.from("entitlements").select("valid_until")
        .eq("user_id", order.user_id).eq("pack_id", it.pack).eq("region_code", it.region)
        .or("valid_until.is.null,valid_until.gt." + now.toISOString())
        .order("valid_until", { ascending: false, nullsFirst: true }).limit(1).maybeSingle();
      if (cur && cur.valid_until === null) continue;                                        // lifetime already
      const base = cur?.valid_until ? new Date(cur.valid_until) : now;
      rows.push({
        user_id: order.user_id, pack_id: it.pack, region_code: it.region, source: "razorpay",
        valid_until: new Date(base.getTime() + (it.days || 365) * 864e5).toISOString(),
        order_id: orderId, payment_ref: paymentId,
      });
    }
    if (rows.length) {
      const { error } = await sb.from("entitlements").insert(rows);
      if (error) return json(500, { error: error.message });
    }
    await sb.from("orders").update({ status: "paid", payment_ref: paymentId }).eq("id", orderId);
    return json(200, { ok: true, granted: rows.length });
  }

  if (type === "refund.processed") {
    const paymentId = String(evt?.payload?.refund?.entity?.payment_id ?? "");
    if (paymentId) {
      await sb.from("entitlements").update({ valid_until: new Date().toISOString() }).eq("payment_ref", paymentId);
      await sb.from("orders").update({ status: "refunded" }).eq("payment_ref", paymentId);
    }
    return json(200, { ok: true, refunded: paymentId });
  }

  return json(200, { ok: true, ignored: type });
});
