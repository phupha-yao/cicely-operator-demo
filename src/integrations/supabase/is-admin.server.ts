import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server-only admin check: an `admin` row in public.user_roles. There is no
 * email allowlist — grants are data, created with `npm run demo:admin`.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Could not verify role");
  return !!data;
}
