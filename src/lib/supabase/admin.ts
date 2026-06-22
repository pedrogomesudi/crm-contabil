import "server-only";
import { createClient } from "@supabase/supabase-js";
import { required } from "@/lib/env";

// Cliente com service_role: bypassa RLS. SOMENTE no servidor (convites, eliminação).
export function createAdminSupabase() {
  return createClient(
    required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
