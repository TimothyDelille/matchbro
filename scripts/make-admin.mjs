// Make an account an admin (creates it if needed).
//
//   node --env-file=.env.local scripts/make-admin.mjs you@example.com 'a-strong-password'
//
// The password is only used when the account doesn't exist yet.
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/make-admin.mjs <email> [password]");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const target = email.trim().toLowerCase();
let user;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === target);
  if (data.users.length < 1000) break;
}

if (!user) {
  if (!password || password.length < 8) {
    console.error("No account with that email yet. Pass a password (8+ characters) to create one.");
    process.exit(1);
  }
  const { data, error } = await db.auth.admin.createUser({ email: target, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
  console.log(`Created ${target}.`);
}

const { error } = await db.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: "admin" },
});
if (error) throw error;
console.log(`${target} is now an admin. Sign in at /signin and you'll land on /admin.`);
