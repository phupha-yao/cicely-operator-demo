/**
 * Create (or re-grant) a dashboard admin on the project in .env.
 *
 *   npm run demo:admin -- you@example.com 'a-password'
 *
 * Email/password only — fine for the local stack and a demo project. Google
 * sign-in for a hosted project is configured in the Supabase dashboard.
 */
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error("Usage: npm run demo:admin -- <email> <password>");
const url = process.env.SUPABASE_URL!;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
console.log(`Target: ${url}`);

const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) throw listErr;
let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
if (user) {
  const { error } = await db.auth.admin.updateUserById(user.id, { password });
  if (error) throw error;
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
}
const { error } = await db
  .from("user_roles")
  .upsert({ user_id: user!.id, role: "admin" }, { onConflict: "user_id,role" });
if (error) throw error;
console.log(`${email} is an admin.`);
