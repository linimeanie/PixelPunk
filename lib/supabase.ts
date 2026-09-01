import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Every write goes through
// server routes gated by the admin-key middleware, so RLS is not the
// enforcement point here — treat this module as server-only (never import
// it from a client component).
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
