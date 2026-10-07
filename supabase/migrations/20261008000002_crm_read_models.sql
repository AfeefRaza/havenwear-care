-- =====================================================================
-- Havenwear Care — read models over Hisab Kitab data + workflow RPCs
--
-- Every function checks CRM membership itself (crm_assert) and returns only
-- support-relevant columns. Order cost, COGS, courier charges, settlements,
-- payments and bank data are never exposed.
-- =====================================================================

-- One order as JSON (internal helper — not granted to clients)
create or replace function public.crm_order_json(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'created_at', o.created_at_shop,
    'cancelled_at', o.cancelled_at,
    'financial_status', o.financial_status,
    'fulfillment_status', o.fulfillment_status,
    'is_cod', o.is_cod,
    'total', o.current_total,
    'outstanding', o.outstanding,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'phone_key', public.crm_phone_key(o.phone),
    'city', o.city,
    'province', o.province,
    'tags', o.tags,
    'note', o.note,
    'synced_at', o.synced_at,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'title', l.title, 'variant', l.variant_title, 'sku', l.sku,
        'qty', l.current_quantity, 'ordered_qty', l.quantity, 'price', l.unit_price, 'product_id', l.product_id
      ) order by l.id), '[]'::jsonb)
      from public.order_lines l where l.order_id = o.id
    ),
    'shipments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'tracking_number', s.tracking_number, 'courier', s.courier,
        'status', coalesce(s.manual_status, s.status)::text, 'status_raw', s.status_raw, 'status_at', s.status_at,
        'fulfilled_at', s.fulfilled_at, 'delivered_at', s.delivered_at, 'returned_at', s.returned_at,
        'last_checked_at', s.last_checked_at
      ) order by s.created_at desc), '[]'::jsonb)
      from public.shipments s where s.order_id = o.id
    ),
    'cases', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'ref', c.ref, 'status', c.status, 'type_id', c.type_id, 'received_at', c.received_at
      ) order by c.received_at desc), '[]'::jsonb)
      from public.crm_cases c where c.order_id = o.id
    )
  )
  from public.orders o where o.id = p_id;
$$;

-- ---------------------------------------------------------------------
-- Lookup: order number, tracking number, phone or name → orders
-- ---------------------------------------------------------------------
create or replace function public.crm_lookup(p_q text, p_limit int default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := trim(coalesce(p_q, ''));
  digits text := regexp_replace(q, '[^0-9]', '', 'g');
  lim int := least(greatest(coalesce(p_limit, 8), 1), 25);
  ids bigint[];
begin
  perform public.crm_assert('viewer');
  if length(q) < 2 then return '[]'::jsonb; end if;

  -- 1. order number (#haven33919 / haven33919 / 33919)
  if length(digits) between 3 and 8 or q ~* '^#?[a-z]*[0-9]+$' then
    select array_agg(id) into ids from (
      select id from public.orders where lower(name) = public.crm_norm_order(q) limit lim
    ) x;
  end if;
  -- 2. tracking number
  if ids is null and length(q) >= 6 then
    select array_agg(order_id) into ids from (
      select order_id from public.shipments
       where tracking_number = upper(regexp_replace(q, '[\s''"]+', '', 'g')) and order_id is not null
       limit lim
    ) x;
  end if;
  -- 3. phone
  if ids is null and length(digits) >= 10 then
    select array_agg(id) into ids from (
      select id from public.orders
       where public.crm_phone_key(phone) = public.crm_phone_key(digits)
       order by created_at_shop desc limit lim
    ) x;
  end if;
  -- 4. name / city / partial (uses Hisab Kitab's trigram index)
  if ids is null and length(q) >= 3 then
    select array_agg(id) into ids from (
      select id from public.orders
       where (((((((coalesce(name, '') || ' ') || coalesce(customer_name, '')) || ' ') || coalesce(phone, '')) || ' ') || coalesce(city, '')))
             ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
       order by created_at_shop desc limit lim
    ) x;
  end if;

  if ids is null then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(public.crm_order_json(o.id) order by o.created_at_shop desc), '[]'::jsonb)
    from public.orders o where o.id = any (ids)
  );
end;
$$;

-- Order detail with full tracking history
create or replace function public.crm_order(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.crm_assert('viewer');
  return public.crm_order_json(p_id) || jsonb_build_object(
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'shipment_id', e.shipment_id, 'status', e.status::text, 'raw', e.status_raw, 'at', e.event_at
      ) order by e.event_at desc nulls last, e.id desc), '[]'::jsonb)
      from public.shipment_events e
      join public.shipments s on s.id = e.shipment_id
      where s.order_id = p_id
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Customer 360 (computed on read from orders; nothing duplicated)
-- ---------------------------------------------------------------------
create or replace function public.crm_customer(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k text := public.crm_phone_key(p_phone);
begin
  perform public.crm_assert('viewer');
  if k is null then return null; end if;
  return jsonb_build_object(
    'phone_key', k,
    'profile', (select to_jsonb(p) from public.crm_customer_profiles p where p.phone_key = k),
    'identity', coalesce(
      (select jsonb_build_object('name', customer_name, 'phone', phone, 'city', city)
         from public.orders where public.crm_phone_key(phone) = k order by created_at_shop desc limit 1),
      (select jsonb_build_object('name', customer_name, 'phone', phone, 'city', city)
         from public.crm_cases where phone_key = k order by received_at desc limit 1)
    ),
    'stats', (
      select jsonb_build_object(
        'orders', count(*),
        'cancelled', count(*) filter (where o.cancelled_at is not null),
        'delivered', count(*) filter (where st.v = 'delivered'),
        'returned', count(*) filter (where st.v in ('returned', 'return_in_transit')),
        'in_flight', count(*) filter (where st.v in ('booked', 'in_transit', 'out_for_delivery', 'delivery_failed')),
        'spent', coalesce(sum(o.current_total) filter (where st.v = 'delivered'), 0),
        'first_order', min(o.created_at_shop),
        'last_order', max(o.created_at_shop)
      )
      from public.orders o
      left join lateral (
        select coalesce(s.manual_status, s.status)::text as v
          from public.shipments s where s.order_id = o.id order by s.created_at desc limit 1
      ) st on true
      where public.crm_phone_key(o.phone) = k
    ),
    'orders', (
      select coalesce(jsonb_agg(public.crm_order_json(x.id) order by x.created_at_shop desc), '[]'::jsonb)
      from (select id, created_at_shop from public.orders where public.crm_phone_key(phone) = k
             order by created_at_shop desc limit 30) x
    ),
    'cases', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'ref', c.ref, 'status', c.status, 'type_id', c.type_id, 'severity', c.severity,
        'received_at', c.received_at, 'resolved_at', c.resolved_at, 'order_name', c.order_name,
        'resolution', c.resolution, 'resolution_cost', c.resolution_cost, 'summary', left(c.description, 160)
      ) order by c.received_at desc), '[]'::jsonb)
      from public.crm_cases c where c.phone_key = k
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Delivery watch: parcels where a quick call can save a COD return
-- ---------------------------------------------------------------------
create or replace function public.crm_watch_rows()
returns table (
  shipment_id bigint, order_id bigint, tracking_number text, courier text, status text, status_raw text,
  status_at timestamptz, reason text, priority int, contacted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select coalesce((public.crm_setting('watch') ->> 'booked_days')::int, 3) as booked_days,
           coalesce((public.crm_setting('watch') ->> 'in_transit_days')::int, 5) as transit_days
  ), s as (
    select s.*, coalesce(s.manual_status, s.status)::text as st,
           coalesce(s.status_at, s.fulfilled_at, s.created_at) as since
      from public.shipments s
     where not s.is_final or coalesce(s.manual_status, s.status)::text = 'return_in_transit'
  )
  select s.id, s.order_id, s.tracking_number, s.courier, s.st, s.status_raw, s.since,
         case
           when s.st = 'delivery_failed' then 'failed_attempt'
           when s.st = 'return_in_transit' then 'returning'
           when s.st = 'booked' then 'not_picked'
           else 'stuck'
         end,
         case s.st when 'delivery_failed' then 1 when 'in_transit' then 2 when 'booked' then 3 else 4 end,
         dc.contacted_at
    from s
    cross join cfg
    join public.orders o on o.id = s.order_id and o.cancelled_at is null
    left join public.crm_delivery_contacts dc on dc.shipment_id = s.id
   where s.st = 'delivery_failed'
      or (s.st = 'in_transit' and s.since < now() - make_interval(days => cfg.transit_days))
      or (s.st = 'booked' and s.since < now() - make_interval(days => cfg.booked_days))
      or (s.st = 'return_in_transit' and s.since > now() - interval '4 days');
$$;

create or replace function public.crm_delivery_watch()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.crm_assert('viewer');
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'shipment_id', w.shipment_id, 'tracking_number', w.tracking_number, 'courier', w.courier,
      'status', w.status, 'status_raw', w.status_raw, 'status_at', w.status_at,
      'reason', w.reason, 'priority', w.priority,
      'order', jsonb_build_object('id', o.id, 'name', o.name, 'total', o.current_total, 'is_cod', o.is_cod,
        'customer_name', o.customer_name, 'phone', o.phone, 'city', o.city, 'created_at', o.created_at_shop),
      'contact', case when dc.shipment_id is null then null else jsonb_build_object(
        'outcome', dc.outcome, 'note', dc.note, 'attempts', dc.attempts, 'at', dc.contacted_at,
        'by', dc.contacted_by, 'stale', dc.contacted_at < w.status_at) end,
      'open_case', (select c.id from public.crm_cases c where c.order_id = o.id and c.status <> 'resolved' order by c.id desc limit 1)
    ) order by w.priority, w.status_at), '[]'::jsonb)
    from public.crm_watch_rows() w
    join public.orders o on o.id = w.order_id
    left join public.crm_delivery_contacts dc on dc.shipment_id = w.shipment_id
  );
end;
$$;

create or replace function public.crm_log_delivery_contact(p_shipment_id bigint, p_outcome text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  st text;
begin
  perform public.crm_assert('agent');
  select coalesce(manual_status, status)::text into st from public.shipments where id = p_shipment_id;
  if not found then raise exception 'Unknown shipment'; end if;
  insert into public.crm_delivery_contacts as d (shipment_id, outcome, note, status_at_contact, contacted_by, contacted_at, attempts)
  values (p_shipment_id, p_outcome, nullif(trim(p_note), ''), st, (select auth.uid()), now(), 1)
  on conflict (shipment_id) do update set
    outcome = excluded.outcome,
    note = coalesce(excluded.note, d.note),
    status_at_contact = excluded.status_at_contact,
    contacted_by = excluded.contacted_by,
    contacted_at = now(),
    attempts = d.attempts + case when excluded.outcome = 'dismissed' then 0 else 1 end;
end;
$$;

-- ---------------------------------------------------------------------
-- Badge counts for the sidebar — one cheap call, polled while visible
-- ---------------------------------------------------------------------
create or replace function public.crm_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  eod timestamptz := (date_trunc('day', now() at time zone 'Asia/Karachi') + interval '1 day') at time zone 'Asia/Karachi';
  res jsonb;
begin
  perform public.crm_assert('viewer');
  select jsonb_build_object(
    'open', count(*),
    'mine', count(*) filter (where assignee = uid),
    'unassigned', count(*) filter (where assignee is null),
    'overdue', count(*) filter (where status <> 'awaiting_customer' and due_at < now()),
    'followups', count(*) filter (where follow_up_at < eod),
    'awaiting', count(*) filter (where status = 'awaiting_customer'),
    'serious', count(*) filter (where severity = 'serious'),
    'my_due', count(*) filter (where assignee = uid and (follow_up_at < eod or (status <> 'awaiting_customer' and due_at < now())))
  ) into res
  from public.crm_cases where status <> 'resolved';
  return res || jsonb_build_object(
    'watch', (select count(*) from public.crm_watch_rows() w where w.contacted_at is null or w.contacted_at < w.status_at)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Command palette search: cases + orders in one round trip
-- ---------------------------------------------------------------------
create or replace function public.crm_search(p_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := trim(coalesce(p_q, ''));
  digits text := regexp_replace(q, '[^0-9]', '', 'g');
  pat text := '%' || replace(replace(replace(trim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.crm_assert('viewer');
  if length(q) < 2 then return jsonb_build_object('cases', '[]'::jsonb, 'orders', '[]'::jsonb); end if;
  return jsonb_build_object(
    'cases', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select c.id, c.ref, c.status, c.severity, c.customer_name, c.order_name, c.type_id, c.received_at
          from public.crm_cases c
         where (q ~* '^hc-?[0-9]+$' and c.id = case when length(digits) between 1 and 12 then digits::bigint end)
            or c.order_name = public.crm_norm_order(q)
            or (length(digits) >= 10 and c.phone_key = public.crm_phone_key(digits))
            or c.tracking_number = upper(q)
            or (length(q) >= 3 and c.customer_name ilike pat)
         order by c.received_at desc limit 8
      ) x
    ),
    'orders', public.crm_lookup(q, 6)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Insights: everything the dashboard needs in one call
-- ---------------------------------------------------------------------
create or replace function public.crm_insights(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t0 timestamptz := (p_from::timestamp at time zone 'Asia/Karachi');
  t1 timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Karachi');
  span int := p_to - p_from;
  bucket text := case when span <= 62 then 'day' when span <= 370 then 'week' else 'month' end;
  res jsonb;
begin
  perform public.crm_assert('viewer');
  if p_to < p_from or span > 1100 then raise exception 'Invalid period'; end if;

  with c as (
    select c.*, ty.label as type_label
      from public.crm_cases c left join public.crm_complaint_types ty on ty.id = c.type_id
     where c.received_at >= t0 and c.received_at < t1
  ), ord as (
    select o.id from public.orders o
     where o.created_at_shop >= t0 and o.created_at_shop < t1 and o.cancelled_at is null
  ), top_products as (
    select i ->> 'title' as title, count(distinct c.id) as complaints,
           count(distinct c.id) filter (where c.severity = 'serious') as serious,
           mode() within group (order by c.type_label) as top_type
      from c, jsonb_array_elements(c.items) i
     where i ->> 'title' is not null
     group by 1 order by 2 desc limit 15
  )
  select jsonb_build_object(
    'bucket', bucket,
    'kpis', (select jsonb_build_object(
        'cases', count(*),
        'serious', count(*) filter (where severity = 'serious'),
        'resolved', count(*) filter (where status = 'resolved'),
        'open', count(*) filter (where status <> 'resolved'),
        'avg_resolution_h', round((avg(extract(epoch from resolved_at - received_at) / 3600) filter (where resolved_at is not null))::numeric, 1),
        'median_resolution_h', round((percentile_cont(0.5) within group (order by extract(epoch from resolved_at - received_at) / 3600)
                                     filter (where resolved_at is not null))::numeric, 1),
        'avg_first_response_h', round((avg(extract(epoch from first_response_at - received_at) / 3600) filter (where first_response_at is not null))::numeric, 1),
        'sla_met_pct', round(100.0 * count(*) filter (where resolved_at is not null and resolved_at <= due_at)
                             / nullif(count(*) filter (where resolved_at is not null), 0), 1),
        'resolution_cost', coalesce(sum(resolution_cost), 0),
        'customers', count(distinct phone_key),
        'repeat_customers', (select count(*) from (select phone_key from c where phone_key is not null group by 1 having count(*) > 1) r)
      ) from c),
    'orders', (select count(*) from ord),
    'orders_with_case', (select count(distinct c.order_id) from c join ord on ord.id = c.order_id),
    'open_now', (select jsonb_build_object(
        'open', count(*),
        'overdue', count(*) filter (where status <> 'awaiting_customer' and due_at < now()),
        'oldest_h', round((max(extract(epoch from now() - received_at)) / 3600)::numeric, 0)
      ) from public.crm_cases where status <> 'resolved'),
    'by_type', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select type_id, type_label as label, count(*) as total,
               count(*) filter (where severity = 'serious') as serious,
               count(*) filter (where status = 'resolved') as resolved,
               round((avg(extract(epoch from resolved_at - received_at) / 3600))::numeric, 1) as avg_h
          from c group by 1, 2) x),
    'trend', (select coalesce(jsonb_agg(x order by x.b), '[]'::jsonb) from (
        select date_trunc(bucket, received_at at time zone 'Asia/Karachi')::date as b, count(*) as total,
               count(*) filter (where severity = 'serious') as serious,
               count(*) filter (where status = 'resolved') as resolved
          from c group by 1) x),
    'by_product', (select coalesce(jsonb_agg(x order by x.complaints desc), '[]'::jsonb) from (
        select tp.title, tp.complaints, tp.serious, tp.top_type,
               (select coalesce(sum(l.quantity), 0) from public.order_lines l join ord on ord.id = l.order_id where l.title = tp.title) as sold
          from top_products tp) x),
    'by_courier', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select coalesce(nullif(courier, ''), 'unknown') as courier, count(*) as total,
               count(*) filter (where severity = 'serious') as serious
          from c group by 1) x),
    'by_city', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select initcap(lower(trim(city))) as city, count(*) as total
          from c where coalesce(trim(city), '') <> '' group by 1 order by 2 desc limit 10) x),
    'by_channel', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select channel, count(*) as total from c group by 1) x),
    'by_resolution', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select resolution, count(*) as total, coalesce(sum(resolution_cost), 0) as cost
          from c where resolution is not null group by 1) x),
    'by_agent', (select coalesce(jsonb_agg(x order by x.handled desc), '[]'::jsonb) from (
        select c.assignee, coalesce(m.full_name, m.email, 'Unassigned') as name, count(*) as handled,
               count(*) filter (where c.status = 'resolved') as resolved,
               count(*) filter (where c.status = 'resolved' and c.resolved_at <= c.due_at) as sla_met,
               round((avg(extract(epoch from c.resolved_at - c.received_at) / 3600))::numeric, 1) as avg_h,
               round((avg(extract(epoch from c.first_response_at - c.received_at) / 3600))::numeric, 1) as first_response_h
          from c left join public.crm_members m on m.user_id = c.assignee group by 1, 2) x),
    'delivery', (select jsonb_build_object(
        'shipments', count(*),
        'delivered', count(*) filter (where st = 'delivered'),
        'returned', count(*) filter (where st in ('returned', 'return_in_transit')),
        'failed', count(*) filter (where st = 'delivery_failed'),
        'in_flight', count(*) filter (where st in ('booked', 'in_transit', 'out_for_delivery'))
      ) from (select coalesce(s.manual_status, s.status)::text as st
                from public.shipments s join ord on ord.id = s.order_id) s),
    'watch_outcomes', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select outcome, count(*) as total from public.crm_delivery_contacts
         where contacted_at >= t0 and contacted_at < t1 group by 1) x)
  ) into res;
  return res;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin helpers
-- ---------------------------------------------------------------------
-- Give CRM access to someone who already has a login in this project.
create or replace function public.crm_admin_add_member(p_email text, p_role public.crm_role, p_full_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  perform public.crm_assert('admin');
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No login exists for %. Create the user first.', p_email using errcode = 'P0002';
  end if;
  insert into public.crm_members (user_id, email, full_name, role)
  values (uid, lower(trim(p_email)), nullif(trim(p_full_name), ''), p_role)
  on conflict (user_id) do update set role = excluded.role, active = true,
    full_name = coalesce(excluded.full_name, public.crm_members.full_name);
  return uid;
end;
$$;

-- Nightly: close cases that have waited on the customer too long.
create or replace function public.crm_auto_close()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  days int := coalesce((public.crm_setting('auto_close_awaiting_days') #>> '{}')::int, 0);
  n int;
begin
  if days <= 0 then return 0; end if;
  with closed as (
    update public.crm_cases set
      status = 'resolved',
      resolution = 'no_response',
      resolution_notes = coalesce(resolution_notes, 'Auto-closed: no reply from the customer for ' || days || ' days.')
    where status = 'awaiting_customer' and last_activity_at < now() - make_interval(days => days)
    returning id
  )
  select count(*) into n from closed;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants: nothing for anon; app RPCs for signed-in users (each checks membership)
-- ---------------------------------------------------------------------
revoke all on function
  public.crm_phone_key(text), public.crm_my_role(), public.crm_has(public.crm_role), public.crm_assert(public.crm_role),
  public.crm_setting(text), public.crm_norm_order(text),
  public.crm_order_json(bigint), public.crm_lookup(text, int), public.crm_order(bigint), public.crm_customer(text),
  public.crm_watch_rows(), public.crm_delivery_watch(), public.crm_log_delivery_contact(bigint, text, text),
  public.crm_counts(), public.crm_search(text), public.crm_insights(date, date),
  public.crm_admin_add_member(text, public.crm_role, text), public.crm_auto_close(),
  public.crm_cases_before_insert(), public.crm_cases_before_update(), public.crm_cases_after_change(),
  public.crm_events_after_insert(), public.crm_touch_profile(), public.crm_guard_member()
from public, anon;

grant execute on function public.crm_phone_key(text), public.crm_my_role(), public.crm_has(public.crm_role),
  public.crm_norm_order(text) to authenticated, service_role;
grant execute on function public.crm_lookup(text, int), public.crm_order(bigint), public.crm_customer(text),
  public.crm_delivery_watch(), public.crm_log_delivery_contact(bigint, text, text), public.crm_counts(),
  public.crm_search(text), public.crm_insights(date, date), public.crm_admin_add_member(text, public.crm_role, text)
  to authenticated;
grant execute on function public.crm_auto_close(), public.crm_order_json(bigint), public.crm_setting(text),
  public.crm_assert(public.crm_role) to service_role;

-- Nightly automation (05:15 Pakistan time). Pure SQL — no edge function call.
select cron.schedule('crm-auto-close', '15 0 * * *', 'select public.crm_auto_close()');
