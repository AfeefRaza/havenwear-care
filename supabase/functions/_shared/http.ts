import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Browsers may only call these functions from the app's own origins. (Auth is a bearer
// token, so CORS is defence in depth, not the access control — that is the member check.)
const allowed = (Deno.env.get("CRM_ALLOWED_ORIGINS") ??
  "https://afeefraza.github.io,http://localhost:5173,http://localhost:4173")
  .split(",").map((s) => s.trim()).filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Service-role client. Lives only inside the function; never returned to the browser. */
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type CrmRole = "viewer" | "agent" | "admin";
const RANK: Record<CrmRole, number> = { viewer: 1, agent: 2, admin: 3 };

export interface Caller {
  userId: string;
  email: string | null;
  role: CrmRole;
}

/** Valid session AND an active Havenwear Care membership with at least `minRole`. */
export async function authenticateMember(req: Request, db: SupabaseClient, minRole: CrmRole): Promise<Caller> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Missing authorization");
  const { data: userData, error } = await db.auth.getUser(token);
  if (error || !userData?.user) throw new HttpError(401, "Invalid or expired session");
  const { data: m } = await db.from("crm_members").select("role, active").eq("user_id", userData.user.id).maybeSingle();
  if (!m || !m.active) throw new HttpError(403, "No access to Havenwear Care");
  const role = m.role as CrmRole;
  if (RANK[role] < RANK[minRole]) throw new HttpError(403, `Requires ${minRole} role`);
  return { userId: userData.user.id, email: userData.user.email ?? null, role };
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json(req, { error: err.message }, err.status);
      console.error(err);
      return json(req, { error: err instanceof Error ? err.message : "Unexpected error" }, 500);
    }
  };
}

/** Very small per-instance rate limiter (protects the courier / Shopify quotas). */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, "Too many requests — try again in a minute");
  arr.push(now);
  hits.set(key, arr);
}
