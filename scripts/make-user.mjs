// Create a regular account (auth user + profiles row) if it doesn't exist yet.
// Used for the demo account (see lib/demo.ts), which gets the mocked review flow.
//
//   npm run make-user -- amaurydelille92500@gmail.com ['optional-password']
//
// Without a password, sign in at /signin with the emailed one-time code.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email) {
  console.error("Usage: npm run make-user -- <email> [password]");
  process.exit(1);
}
if (password && password.length < 8) {
  console.error("Use a password with 8+ characters (or leave it out and sign in with a code).");
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

if (user) {
  console.log(`${target} already exists.`);
  if (password) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log("Password updated.");
  }
} else {
  const { data, error } = await db.auth.admin.createUser({
    email: target,
    password: password || randomBytes(24).toString("base64url"),
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
  console.log(`Created ${target}.`);
}

// The app expects a profiles row for every account (see createAccount in lib/supabase/admin.ts).
const { error: profileError } = await db
  .from("profiles")
  .upsert({ id: user.id, email: target }, { onConflict: "id", ignoreDuplicates: true });
if (profileError) throw profileError;

console.log(`Done. Sign in at /signin with ${target}.`);
