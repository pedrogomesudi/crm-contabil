import { createBrowserClient } from "@supabase/ssr";
import { required } from "@/lib/env";

export function createBrowserSupabase() {
  return createBrowserClient(
    required(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
