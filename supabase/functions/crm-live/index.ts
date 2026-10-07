// Havenwear Care — live lookups that need server-side credentials.
//
//   { action: "order",  name: "#haven34001" }       → order newer than Hisab Kitab's last sync
//   { action: "images", product_ids: [123, 456] }    → product thumbnails
//   { action: "track",  tracking_number, courier }   → live courier status + history
//
// Credentials are the ones Hisab Kitab already keeps in Supabase Vault for this project
// (read with the service role inside this function only). Nothing is written to Hisab
// Kitab's tables and no secret is ever returned to the browser.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { authenticateMember, handle, HttpError, json, rateLimit, serviceClient } from "../_shared/http.ts";
import { ShopifyClient, type ShopifyConfig, type ShopifySecret } from "../_shared/shopify.ts";
import { type Courier, detectCourier, trackMany } from "../_shared/couriers.ts";

let shopifyCache: { client: ShopifyClient; at: number } | null = null;

async function shopify(db: SupabaseClient): Promise<ShopifyClient> {
  if (shopifyCache && Date.now() - shopifyCache.at < 10 * 60_000) return shopifyCache.client;
  const { data: integ } = await db.from("integrations").select("config, enabled").eq("provider", "shopify").maybeSingle();
  if (!integ?.enabled) throw new HttpError(503, "Shopify is not connected (Hisab Kitab → Settings → Integrations)");
  const { data: secret, error } = await db.rpc("integration_get_secret", { p_provider: "shopify" });
  if (error || !secret) throw new HttpError(503, "Shopify credentials are not available");
  const client = new ShopifyClient(integ.config as ShopifyConfig, secret as ShopifySecret);
  shopifyCache = { client, at: Date.now() };
  return client;
}

const phoneKey = (p: string | null | undefined): string | null => {
  const d = (p ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0092")) return d.slice(2);
  if (/^92\d{10}$/.test(d)) return d;
  if (/^0\d{10}$/.test(d)) return "92" + d.slice(1);
  if (/^3\d{9}$/.test(d)) return "92" + d;
  return d;
};
const money = (m: any): number => Math.round(parseFloat(m?.shopMoney?.amount ?? "0") * 100) / 100 || 0;
const gidNum = (v: string | null | undefined): number | null => {
  const n = Number(String(v ?? "").split("/").pop());
  return Number.isFinite(n) && n > 0 ? n : null;
};

const ORDER_QUERY = `
query One($q: String!) {
  orders(first: 1, query: $q) {
    nodes {
      legacyResourceId name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
      paymentGatewayNames tags note
      currentTotalPriceSet { shopMoney { amount } }
      totalOutstandingSet { shopMoney { amount } }
      shippingAddress { name phone city province }
      lineItems(first: 30) {
        nodes { id title variantTitle sku quantity currentQuantity
          originalUnitPriceSet { shopMoney { amount } } product { legacyResourceId } }
      }
      fulfillments(first: 5) { status createdAt trackingInfo(first: 3) { number company } }
    }
  }
}`;

async function liveOrder(db: SupabaseClient, raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 9) throw new HttpError(400, "Enter an order number");
  const { data: prefixRow } = await db.from("crm_settings").select("value").eq("key", "order_prefix").maybeSingle();
  const prefix = typeof prefixRow?.value === "string" ? prefixRow.value : "#";
  const name = `${prefix}${digits}`;
  const client = await shopify(db);
  const data = await client.query<{ orders: { nodes: any[] } }>(ORDER_QUERY, { q: `name:${JSON.stringify(name)}` });
  const n = data.orders.nodes[0];
  if (!n) return null;
  const gateways: string[] = n.paymentGatewayNames ?? [];
  const id = Number(n.legacyResourceId);
  const { data: cases } = await db.from("crm_cases").select("id, ref, status, type_id, received_at").eq("order_id", id);
  const shipments = (n.fulfillments ?? [])
    .filter((f: any) => f.status !== "CANCELLED")
    .flatMap((f: any) =>
      (f.trackingInfo ?? []).map((t: any) => {
        const tn = String(t.number ?? "").replace(/[\s'"]+/g, "").toUpperCase();
        return {
          id: 0, tracking_number: tn, courier: detectCourier(tn, t.company), status: "booked", status_raw: null,
          status_at: f.createdAt, fulfilled_at: f.createdAt, delivered_at: null, returned_at: null, last_checked_at: null,
        };
      })
    )
    .filter((s: any) => s.tracking_number);
  return {
    id,
    name: n.name,
    created_at: n.createdAt,
    cancelled_at: n.cancelledAt,
    financial_status: n.displayFinancialStatus,
    fulfillment_status: n.displayFulfillmentStatus,
    is_cod: gateways.length === 0 || gateways.some((g) => /cash on delivery|cod|manual/i.test(g)),
    total: money(n.currentTotalPriceSet),
    outstanding: money(n.totalOutstandingSet),
    customer_name: n.shippingAddress?.name ?? null,
    phone: n.shippingAddress?.phone ?? null,
    phone_key: phoneKey(n.shippingAddress?.phone),
    city: n.shippingAddress?.city ?? null,
    province: n.shippingAddress?.province ?? null,
    tags: n.tags ?? [],
    note: n.note ?? null,
    synced_at: null,
    lines: (n.lineItems?.nodes ?? []).map((l: any) => ({
      id: gidNum(l.id),
      title: l.title,
      variant: l.variantTitle,
      sku: l.sku || null,
      qty: l.currentQuantity ?? l.quantity,
      ordered_qty: l.quantity,
      price: money(l.originalUnitPriceSet),
      product_id: l.product?.legacyResourceId ? Number(l.product.legacyResourceId) : null,
    })),
    shipments,
    cases: cases ?? [],
  };
}

async function productImages(db: SupabaseClient, ids: unknown): Promise<Record<string, string>> {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 50);
  if (!list.length) return {};
  const client = await shopify(db);
  const data = await client.query<{ nodes: any[] }>(
    `query Imgs($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { legacyResourceId
       featuredMedia { preview { image { url(transform: { maxWidth: 160, maxHeight: 160 }) } } } } } }`,
    { ids: list.map((id) => `gid://shopify/Product/${id}`) },
  );
  const out: Record<string, string> = {};
  for (const n of data.nodes ?? []) {
    const url = n?.featuredMedia?.preview?.image?.url;
    if (n?.legacyResourceId && typeof url === "string" && url.startsWith("https://cdn.shopify.com/")) out[n.legacyResourceId] = url;
  }
  return out;
}

async function liveTrack(db: SupabaseClient, tn: string, courierHint: string | null) {
  const tracking = tn.replace(/[\s'"]+/g, "").toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(tracking)) throw new HttpError(400, "Invalid tracking number");
  let courier = (courierHint ?? "").toLowerCase() as Courier;
  if (!["postex", "blueex", "mnp", "tranzo", "xps"].includes(courier)) courier = detectCourier(tracking, courierHint);
  let creds: Record<string, string> | null = null;
  if (courier !== "mnp" && courier !== "unknown") {
    const { data } = await db.rpc("integration_get_secret", { p_provider: courier });
    creds = (data as Record<string, string> | null) ?? null;
  }
  const res = (await trackMany(courier, [tracking], creds)).get(tracking);
  const checked_at = new Date().toISOString();
  if (!res) return { ok: false, error: "No response from courier", checked_at };
  if (!res.ok) return { ok: false, error: res.error, checked_at };
  return {
    ok: true,
    courier,
    status: res.status,
    raw: res.raw,
    at: res.at,
    events: [...res.events].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 40),
    checked_at,
  };
}

Deno.serve(handle(async (req) => {
  const db = serviceClient();
  const caller = await authenticateMember(req, db, "viewer");
  const body = await req.json().catch(() => ({}));
  switch (body?.action) {
    case "order":
      rateLimit(`o:${caller.userId}`, 30, 60_000);
      return json(req, { order: await liveOrder(db, String(body.name ?? "")) });
    case "images":
      rateLimit(`i:${caller.userId}`, 60, 60_000);
      return json(req, { images: await productImages(db, body.product_ids) });
    case "track":
      rateLimit(`t:${caller.userId}`, 20, 60_000);
      return json(req, await liveTrack(db, String(body.tracking_number ?? ""), body.courier ?? null));
    default:
      throw new HttpError(400, "Unknown action");
  }
}));
