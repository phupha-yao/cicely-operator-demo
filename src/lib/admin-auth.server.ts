/**
 * The admin gate, in one place. Every operator server function goes through
 * adminDb(), so there is exactly one authorisation check to get right.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminDb = SupabaseClient<Database>;

export async function assertAdminUser(userId: string): Promise<void> {
  const { isAdminUser } = await import("@/integrations/supabase/is-admin.server");
  if (!(await isAdminUser(userId))) throw new Error("Forbidden");
}

/** Assert admin, then hand back the service-role client. */
export async function adminDb(userId: string): Promise<AdminDb> {
  await assertAdminUser(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
