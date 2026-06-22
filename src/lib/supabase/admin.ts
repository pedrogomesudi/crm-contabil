import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com service_role: bypassa RLS. SOMENTE no servidor (convites, eliminação).
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
