// Havenwear Care — team management (admins only).
//
//   { action: "create_user", email, full_name, role, password }
//       Creates a login (no public sign-up needed) and grants Care access. If the email
//       already has a login in this project (e.g. a Hisab Kitab user) only access is
//       granted — their password is never touched.
//   { action: "set_password", user_id, password }
//       Resets the password of a Care-only account. Accounts that also have Hisab Kitab
//       access are refused, so a Care admin can never take over a finance login.
import { authenticateMember, handle, HttpError, json, rateLimit, serviceClient } from "../_shared/http.ts";

const ROLES = ["viewer", "agent", "admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkPassword(p: unknown): string {
  const s = String(p ?? "");
  if (s.length < 10) throw new HttpError(400, "Password must be at least 10 characters");
  if (s.length > 72) throw new HttpError(400, "Password is too long");
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw new HttpError(400, "Use letters and numbers in the password");
  return s;
}

Deno.serve(handle(async (req) => {
  const db = serviceClient();
  const caller = await authenticateMember(req, db, "admin");
  rateLimit(`a:${caller.userId}`, 20, 60_000);
  const body = await req.json().catch(() => ({}));

  if (body?.action === "create_user") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim().slice(0, 80) || null;
    const role = String(body.role ?? "agent");
    if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email");
    if (!ROLES.includes(role)) throw new HttpError(400, "Invalid role");

    // Existing login in this project?
    let userId: string | null = null;
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new HttpError(500, error.message);
      userId = data.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      if (data.users.length < 200) break;
    }
    const existing = !!userId;
    if (!userId) {
      const password = checkPassword(body.password);
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, created_for: "havenwear-care" },
      });
      if (error || !data.user) throw new HttpError(400, error?.message ?? "Could not create the user");
      userId = data.user.id;
    }
    const { error: mErr } = await db.from("crm_members").upsert(
      { user_id: userId, email, full_name: fullName, role, active: true },
      { onConflict: "user_id" },
    );
    if (mErr) throw new HttpError(500, mErr.message);
    return json(req, { user_id: userId, existing });
  }

  if (body?.action === "set_password") {
    const userId = String(body.user_id ?? "");
    const password = checkPassword(body.password);
    if (userId === caller.userId) throw new HttpError(400, "Change your own password from Account");
    const { data: member } = await db.from("crm_members").select("user_id").eq("user_id", userId).maybeSingle();
    if (!member) throw new HttpError(404, "Not a Havenwear Care member");
    // Refuse accounts that hold any Hisab Kitab (finance) role.
    const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profile && profile.role !== "pending") {
      throw new HttpError(403, "This login also has Hisab Kitab access — the person must reset it themselves");
    }
    const { error } = await db.auth.admin.updateUserById(userId, { password });
    if (error) throw new HttpError(400, error.message);
    return json(req, { ok: true });
  }

  throw new HttpError(400, "Unknown action");
}));
