// Vendored from AfeefRaza/hisab-kitab supabase/functions/_shared/shopify.ts (client only).
// Shopify Admin GraphQL client. Supports a static Admin API access token
// (legacy custom app, shpat_…) or Dev Dashboard client credentials
// (client_id + client_secret → short-lived token).
import { sleep } from "./util.ts";

export interface ShopifyConfig {
  shop_domain: string;
  api_version?: string;
}
export interface ShopifySecret {
  access_token?: string;
  client_id?: string;
  client_secret?: string;
}

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export class ShopifyClient {
  private token: string | null;
  private readonly endpoint: string;
  private readonly domain: string;

  constructor(private config: ShopifyConfig, private secret: ShopifySecret) {
    this.domain = normalizeDomain(config.shop_domain);
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(this.domain)) {
      throw new Error("Shop domain must look like your-store.myshopify.com");
    }
    this.endpoint = `https://${this.domain}/admin/api/${config.api_version || "2026-07"}/graphql.json`;
    this.token = secret.access_token ?? null;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    if (!this.secret.client_id || !this.secret.client_secret) {
      throw new Error("Shopify credentials missing: provide an Admin API access token or client ID + secret");
    }
    const res = await fetch(`https://${this.domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.secret.client_id,
        client_secret: this.secret.client_secret,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new Error(`Shopify token exchange failed (${res.status}): ${body.error_description ?? body.error ?? "check client ID/secret"}`);
    }
    this.token = body.access_token as string;
    return this.token;
  }

  async query<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await this.getToken() },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Shopify rejected the credentials (HTTP ${res.status}). Check the token and its read_orders scope.`);
      }
      const body = await res.json();
      if (body.errors) {
        const throttled = body.errors.some((e: any) => e.extensions?.code === "THROTTLED");
        if (throttled) {
          await sleep(2000);
          continue;
        }
        throw new Error(`Shopify GraphQL error: ${JSON.stringify(body.errors).slice(0, 500)}`);
      }
      // Respect the cost-based throttle bucket
      const cost = body.extensions?.cost;
      if (cost?.throttleStatus && cost.throttleStatus.currentlyAvailable < (cost.requestedQueryCost ?? 0) * 1.5) {
        await sleep(1000);
      }
      return body.data as T;
    }
    throw new Error("Shopify API kept throttling; try again shortly");
  }

  async testConnection(): Promise<string> {
    const data = await this.query<{ shop: { name: string; currencyCode: string } }>(
      "{ shop { name currencyCode } orders(first: 1) { edges { node { id } } } }",
    );
    return `Connected to ${data.shop.name} (${data.shop.currencyCode})`;
  }
}

