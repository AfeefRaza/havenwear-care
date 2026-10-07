# Havenwear Care

The private customer-support and complaint desk for **Havenwear Pakistan**. It replaces the *Havenwear Complaint log* Google Sheet with a fast, automated case system that already knows every Shopify order, customer and courier parcel.

**Stack:** Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · Radix · cmdk · TanStack Query (IndexedDB-persisted) · Recharts · SheetJS · Supabase (Postgres + Auth + RLS + Storage + Edge Functions + pg_cron) · vite-plugin-pwa · Vitest · GitHub Actions → GitHub Pages.

**Live:** https://afeefraza.github.io/havenwear-care/

---

## Contents
1. [What was wrong with the sheet](#what-was-wrong-with-the-sheet)
2. [What it does](#what-it-does)
3. [Automations](#automations)
4. [Architecture](#architecture)
5. [Security model](#security-model)
6. [Keeping Supabase usage small](#keeping-supabase-usage-small)
7. [Setup](#setup)
8. [Team & access](#team--access)
9. [Importing the old sheet](#importing-the-old-sheet)
10. [Local development](#local-development)
11. [Project structure](#project-structure)
12. [Operations & troubleshooting](#operations--troubleshooting)

---

## What was wrong with the sheet

The sheet had one row per complaint with 14 columns (received date, order number, customer name, phone, product, complaint, type, severity, status, courier, assigned to, follow-up date, resolved date, notes), 13 complaint types, 4 statuses, and a formula dashboard. Working through it showed these problems:

| Problem in the sheet | What Havenwear Care does instead |
|---|---|
| Name, phone, product and courier are typed in by hand although they already exist in Shopify / PostEx. | Type an **order number, phone, tracking number or name** → customer, items (with pictures), payment type, courier, tracking and delivery status fill in automatically. |
| No customer view. The dashboard even warns that counts are “not unique customers”. | A **customer 360** keyed by phone number: every order, delivered / returned / return rate, lifetime value, every complaint, team flag (VIP / Watch / Blocked) and notes. Repeat complainers are tagged automatically. |
| Follow-up date is just a cell — nothing reminds anyone. | **Follow-ups due** and **Overdue** queues with live counts, SLA deadlines per complaint type, one-click snooze (“tomorrow morning”, “in 3 days”). |
| “Assigned to” is free text; no one owns the work. | Real team members, **auto-assignment to the least busy agent**, *My queue*, bulk re-assignment. |
| Follow-ups overwrite the same row; history is lost. | A full **activity timeline**: every WhatsApp sent, call, customer reply, note, status / owner / type change — with who and when, written by the database. |
| Customer messages are typed into WhatsApp from scratch. | **WhatsApp templates** (English + Roman Urdu) with the name, order, courier and tracking link filled in; opens WhatsApp ready to send and logs it. |
| Courier status is checked by hand on the PostEx site. | Tracking history from the hourly sync on every case, plus a **live courier check** button. |
| Complaints are only handled after the customer is angry. | **Delivery watch** — failed delivery attempts, stuck and not-picked-up COD parcels appear automatically so the team can call *before* the parcel is returned. Shows the COD amount at risk. |
| Type and severity are picked manually; quality varies. | **Type and severity are suggested from the customer’s own words** (English + Roman Urdu keywords such as *chota, phata, galat, nahi mila*), escalation words (*refund, fraud, review…*) and customer history. |
| The dashboard counts rows; it can’t say *which product* is the problem or how fast the team is. | **Insights**: complaint rate per 100 orders, complaints per product vs units sold, by type / courier / city / channel, first-response time, resolution time, SLA %, resolution cost, team performance. |
| Photos sent by customers live in someone’s phone. | Photos are attached to the case (drag, paste or upload; compressed to ~150 KB in the browser). |
| 5,000 pre-made rows, one shared file, no permissions, no audit. | Unlimited cases, per-person logins with roles, Row Level Security, no public sign-up. |

## What it does

| Screen | Highlights |
|---|---|
| **Queues** (sidebar) | My queue · Follow-ups due · Overdue · Unassigned · Serious · Awaiting customer · All open · Resolved — each with a live badge. Work queues are sorted by priority (overdue → serious → VIP → repeat → follow-up due). Filter by type / severity / owner, free-text search, bulk assign / status / snooze, CSV export. Keyboard: **J/K** next/previous, **C** new case, **R** resolve, **M** assign to me, **/** or **Ctrl+K** search. |
| **Case** | Status, owner, follow-up and resolve in the header; complaint text and affected items; composer with four modes (**WhatsApp**, **Log call** with outcome, **Customer replied**, **Internal note**); full timeline; side panels for the customer (stats, flags, WhatsApp / call buttons), courier tracking with live check, the Shopify order with product pictures, and photos. |
| **New case** | One search box for order # / phone / tracking / name (falls back to a **live Shopify lookup** for orders placed after the last sync). Pick the affected items, paste the message, and the type, severity, SLA, follow-up and owner are set. Warns if the order already has an open case. **Create & acknowledge on WhatsApp** sends the acknowledgement in the same click. |
| **Command palette** (Ctrl+K) | Finds cases and Shopify orders at once; Enter opens the case or starts a new one for that order. |
| **Delivery watch** | Failed attempts, stuck in transit (> 5 days), not picked up (> 3 days) and just-returning parcels, with the COD amount at risk, one-tap WhatsApp (“delivery attempt failed — please confirm your address”), call, outcome log (reached / will receive / address updated / no answer / refused / wants to cancel) and “create case”. A parcel comes back to the list automatically if its courier status changes after the call. |
| **Customers** | Search any Shopify customer; recently complained; flagged customers. Profile shows all orders, deliveries, returns, return rate, lifetime value, complaints and their cost, team flag and notes. |
| **Insights** | Period switcher; KPIs; complaints over time (chart + table); by type; resolutions and cost; products with the most complaints vs units sold; courier, city and channel; team performance; delivery-watch outcomes. |
| **Settings** (admins) | Complaint types (SLA, follow-up days, default severity, keywords), WhatsApp templates (with live preview and optional automatic status change), team (create logins, roles, auto-assign, access, password reset), automation, tracking-link patterns, and the old-sheet import. |

Installable as an app (PWA) on phones and desktops; light and dark themes.

## Automations

All of these run without anyone clicking anything:

1. **Order autofill** — the database links the case to the Shopify order and fills customer name, phone, city, courier and tracking (`crm_cases_before_insert`). Orders entered as `33919`, `haven33919` or `#HAVEN33919` all match.
2. **Type & severity suggestion** from the message (browser, `src/domain/classify.ts`).
3. **SLA deadline and first follow-up** from the complaint type; VIP customers get half the SLA.
4. **Repeat-customer and VIP tags.**
5. **Auto-assignment** to the active agent with the fewest open cases.
6. **Status moves**: the first outbound WhatsApp/call moves *Open → In progress*; logging a customer reply moves *Awaiting customer → In progress*; templates can set a status (e.g. *Ask for photos → Awaiting customer*).
7. **First-response time** recorded automatically.
8. **Timeline** written by triggers for every status / owner / follow-up / type / severity change — the app never double-writes history.
9. **Nightly auto-close** (pg_cron, 05:15 PKT) of cases waiting on the customer for 7+ days, as “No customer response”.
10. **Delivery watch** built from the courier tracking Hisab Kitab syncs hourly.
11. **Live badges** refresh every minute while the tab is visible; the browser tab title shows what needs attention.

## Architecture

```
┌────────────────────┐  publishable key + user JWT   ┌──────────────────────────── Supabase (shared with Hisab Kitab) ───────────────────────────┐
│  Havenwear Care    │ ─────────────────────────────▶ │  crm_* tables (RLS)  ◀── triggers: autofill, SLA, assignment, timeline                 │
│  React PWA         │  PostgREST + RPCs              │  crm_* RPCs (security definer, membership-checked) ──reads──▶ orders, order_lines,      │
│  GitHub Pages      │                                │                                                              shipments, shipment_events │
│                    │  Edge Functions                │  crm-live  ──▶ Shopify Admin API (live order, product images)   ▲ synced every 30 min /  │
│  IndexedDB cache   │ ─────────────────────────────▶ │            ──▶ PostEx / XPS / Tranzo / M&P (live tracking)      │ hourly by Hisab Kitab  │
└────────────────────┘                                │  crm-admin ──▶ Auth admin (create logins)                                              │
                                                      │  Vault: Shopify + courier credentials (already configured in Hisab Kitab)              │
                                                      │  Storage: crm-attachments (private)   ·   pg_cron: crm-auto-close                         │
                                                      └─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why it shares the Hisab Kitab project:** Hisab Kitab already syncs every Shopify order (with customer name, phone, city and line items) every 30 minutes and every courier parcel hourly, with credentials in Vault. Re-syncing the same data into a second project would double the API calls, storage and secrets. Havenwear Care only *reads* that data through narrow functions and keeps its own data in `crm_*` tables. It never writes to Hisab Kitab tables. The one shared-schema change is an extra index on `orders` (customer phone) for instant customer lookups.

**Separation from finance data:** CRM access is a separate membership (`crm_members`), independent of Hisab Kitab roles. CRM functions return only support-relevant columns: no costs, COGS, courier charges, settlements, payments or bank data. A Hisab Kitab user does not get CRM access (and a CRM user gets no finance access) unless explicitly granted.

**Data model** (`supabase/migrations`)

| Table | Purpose |
|---|---|
| `crm_cases` | One complaint. Snapshot of customer/order/items, type, severity, status, owner, SLA, follow-up, first response, resolution + cost, tags |
| `crm_case_events` | Timeline (notes, contacts, status/owner/type changes, resolutions) |
| `crm_attachments` | Photo metadata (files in the private `crm-attachments` bucket) |
| `crm_customer_profiles` | Only what the team adds: flag, tags, note (stats are computed from orders) |
| `crm_complaint_types`, `crm_templates`, `crm_settings` | Admin-editable configuration |
| `crm_delivery_contacts` | Delivery-watch outreach log (one row per parcel) |
| `crm_members` | Who may use the app, and their role |

## Security model

* **No public sign-up in the app.** Logins are created by an admin (Settings → Team, via the `crm-admin` function) or in the Supabase dashboard. Signing in is not enough on its own: a login only gets access with an **active row in `crm_members`**, which only an admin can create.
* **Row Level Security on every `crm_*` table**: viewers read, agents work cases, admins configure. Agents can only add timeline entries *as themselves* and only of kinds *note / contact / attachment*; status/owner history is written by triggers. Members cannot change their own role or remove themselves.
* **Functions:** every RPC a browser can call checks membership itself (`crm_assert`). Internal helpers have `EXECUTE` revoked from `anon` and `authenticated`. All functions pin `search_path`. The anon role has no table or function privileges at all.
* **Secrets never reach the browser.** The frontend contains only the Supabase URL and the publishable key, both public by design. Shopify and courier credentials stay in Supabase Vault and are read only inside the Edge Functions with the service role. The functions require a valid session, an active membership and the right role, restrict CORS to the app's origins, and rate-limit per user.
* **Admin password resets are limited to Care-only logins.** A Care admin cannot reset the password of an account that also has Hisab Kitab access.
* **Browser hardening:** a Content-Security-Policy meta tag (scripts only from the app; connections only to Supabase; images only from Shopify's CDN and Supabase), frame-buster, `noindex`, `no-referrer`, `dangerouslySetInnerHTML` banned by ESLint, and CSV export neutralises spreadsheet formulas.
* **On the device:** the session lives in localStorage, and the data cache lives in IndexedDB. Both are cleared on sign-out and when a different user signs in. The cache expires after 3 days.
* **CI blocks secrets:** gitleaks over the full history, plus `scripts/check-secrets.mjs` on the source and the built `dist/`.
* **Proof:** `supabase/tests/crm_rls_proof.sql` runs 35 checks: anonymous, non-member, viewer and agent permissions, RLS on every table, pinned search paths and function grants. It runs inside a rolled-back transaction. Last run: **all passed**.

> **Recommended (Supabase dashboard, one-time):** *Authentication → Sign In / Providers → turn off “Allow new users to sign up”* and *Authentication → Attack Protection → enable leaked-password protection*. The CRM is safe either way (access needs membership), but this also closes self-sign-up for Hisab Kitab. If you do, create Hisab Kitab users from the dashboard or from Havenwear Care → Team.

## Keeping Supabase usage small

* **No duplicated Shopify / courier data**: it is read from Hisab Kitab's tables in place, and customer stats are computed on read.
* **No Realtime subscriptions.** One cheap `crm_counts()` call per minute, and only while the tab is visible.
* **Cached in the browser** (TanStack Query + IndexedDB): reference data for 10 minutes, product images for 24 hours, orders for 5 minutes. The app opens instantly from cache.
* **Few round trips:** each screen is one RPC (`crm_insights`, `crm_delivery_watch`, `crm_customer`, `crm_search`), and work queues load in one request.
* **Keyset pagination** for history views, and every filter column is indexed (including trigram name search and an expression index on the canonical phone).
* **History is written by triggers** in the same transaction, so there are no extra client writes.
* **Photos are resized to ~1600 px WebP before upload** (~100–300 KB). The bucket only accepts images up to 3 MB.
* **Live Shopify/courier calls happen only on demand** (unknown order, “Live check”, product thumbnails), are cached, and are rate-limited.
* **Automation runs in SQL** (pg_cron calls a SQL function directly; no Edge Function invocation).

## Setup

Everything below is **already done** for production. It's only needed for a fresh project.

1. **Database:** apply `supabase/migrations/*.sql` in order to the Hisab Kitab project (SQL editor, or `supabase link --project-ref <ref> && supabase db push`). They are additive and only create `crm_*` objects (plus one index on `orders`).
2. **Edge Functions:** `supabase functions deploy crm-live` and `supabase functions deploy crm-admin` (both keep JWT verification on). Optional secret `CRM_ALLOWED_ORIGINS` (comma-separated) overrides the default `https://afeefraza.github.io,http://localhost:5173,http://localhost:4173`.
3. **First admin:** in the SQL editor, for an existing login:
   ```sql
   insert into public.crm_members (user_id, email, full_name, role)
   select id, email, 'Your name', 'admin' from auth.users where email = 'you@example.com';
   ```
4. **GitHub:** repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the **publishable** key, never the secret key). Settings → Pages → Source: **GitHub Actions**. Every push to `main` runs gitleaks, the secret scan, lint, type-check, tests, the Deno check of the functions and the build, then deploys.
5. **Verify:** run `supabase/tests/crm_rls_proof.sql` in the SQL editor. It must report `failed = 0`.

Shopify and courier credentials are managed in **Hisab Kitab → Settings → Integrations**. Havenwear Care uses them automatically.

## Team & access

**Settings → Team → Add member**: name, email, role and a generated password (shown once). If the email already has a login in the project (e.g. a Hisab Kitab user), only access is granted and the password is left alone. Roles:

| Role | Can |
|---|---|
| **Viewer** | See everything (queues, cases, customers, insights) — for management |
| **Agent** | + create and work cases, message customers, delivery watch, customer flags |
| **Admin** | + settings, templates, complaint types, team, import, delete cases |

Turn **Access** off to remove someone immediately (their session stops working on the next request). **Auto-assign** controls who receives new cases.

## Importing the old sheet

Settings → **Import sheet** → choose the `.xlsx`/`.xlsm` (or a CSV downloaded from Google Sheets). Columns are matched by header name, orders are linked to Shopify, owners are matched to team members by name (unknown names are kept as a tag), and you get a preview with warnings before anything is saved. Imported cases are tagged `imported`.

## Local development

```bash
cp .env.example .env.local   # Supabase URL + publishable key, VITE_BASE=/
npm install
npm run dev                  # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests (phone normalisation, type/severity suggestion, templates, SLA, sheet import, CSV, formatting) |
| `npm run lint` | ESLint incl. jsx-a11y and React hooks (zero warnings) |
| `npm run typecheck` | TypeScript strict |
| `npm run build` | Production build (CSP injected, service worker generated) |
| `npm run check:secrets` | Scan tracked files (or `node scripts/check-secrets.mjs dist` for the build) |
| `cd supabase/functions && deno check crm-live/index.ts crm-admin/index.ts` | Type-check the Edge Functions |

> On Windows Git Bash, prefix commands that pass a path-like env var with `MSYS_NO_PATHCONV=1` (e.g. `MSYS_NO_PATHCONV=1 VITE_BASE=/havenwear-care/ npm run build`).

## Project structure

```
src/domain/        Pure logic, unit-tested: phone keys, classifier, templates, SLA, sheet import, CSV, labels, types
src/data/          TanStack Query hooks (queries.ts) and mutations (optimistic updates)
src/lib/           Supabase client, auth/membership, query cache, theme, utilities & hotkeys
src/components/    UI kit, app shell, command palette, badges, case detail (timeline, composer, panels, resolve)
src/screens/       Inbox, NewCase, Customers, CustomerPage, DeliveryWatch, Insights, Settings, Account, Login
supabase/migrations  Schema, RLS, triggers, read models, grants
supabase/functions   crm-live, crm-admin (+ courier/Shopify clients vendored from Hisab Kitab)
supabase/tests       crm_rls_proof.sql
```

## Operations & troubleshooting

* **An order can't be found:** orders sync from Shopify every 30 minutes. A brand-new order is fetched live from Shopify automatically (“Live from Shopify” badge). If it still fails, check Shopify in Hisab Kitab → Settings → Integrations.
* **Tracking looks old:** tracking syncs hourly for open parcels; press **Live check** on the case for an instant courier lookup.
* **Someone sees “No access yet”:** add them under Settings → Team (or switch their Access back on).
* **Tracking links:** set the per-courier link pattern under Settings → Automation (`{tracking}` is replaced by the number). The PostEx pattern is pre-filled; check it once and adjust if PostEx changes its tracking page.
* **Changing SLAs / keywords / templates:** Settings. Changes apply to new cases immediately; existing cases keep their deadlines.
* **Rollback:** the frontend redeploys from any commit (Actions → CI & Deploy → Run workflow, or `git revert`). Database changes are additive; to remove the CRM entirely drop the `crm_*` tables, functions, types, the `crm-attachments` bucket, the `crm-auto-close` cron job and the `crm_orders_phone_key_idx` index. Hisab Kitab is unaffected.
