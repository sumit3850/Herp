/* HerpWatch — deployment config. The ONLY file you edit per deployment.
 *
 * Leave SUPABASE_URL empty to run in DEMO MODE: everything works offline in the
 * browser with the seed catalogue + generated sample records stored in
 * localStorage, and pack purchases are granted instantly (no money moves).
 *
 * The anon key is public by design — all protection lives in the RLS policies
 * of supabase/schema.sql. Never put the service-role key or Razorpay secret here.
 */
window.HW_CONFIG = {
  APP_NAME: 'HerpWatch',
  TAGLINE: 'Reptiles & amphibians of India — field guide, sightings & road-kill logger',
  SUPABASE_URL: '',          // e.g. https://abcd1234.supabase.co
  SUPABASE_ANON_KEY: '',     // Project Settings → API → anon public
  RAZORPAY_KEY_ID: '',       // rzp_live_… (public key id only)
  SUPPORT_EMAIL: 'explorer3850@gmail.com',
  DEFAULT_REGION: 'IN-AN',
};
