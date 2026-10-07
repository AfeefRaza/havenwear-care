-- =====================================================================
-- Havenwear Care — security proof. Paste into the SQL editor and run.
-- Everything happens inside a transaction that is rolled back.
-- The final SELECT must show passed = total and failed = 0.
--
-- Uses the first active admin in crm_members as the test identity and
-- temporarily changes its role inside the transaction.
-- =====================================================================
begin;

create temp table _proof (n serial, check_name text, ok boolean) on commit drop;
grant all on _proof to authenticated, anon;
grant usage on sequence _proof_n_seq to authenticated, anon;

create or replace function pg_temp.expect_error(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return true;
end $$;

-- Rows affected by a statement (-1 when it raised an error)
create or replace function pg_temp.affected(sql text) returns int language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end $$;

-- Identity under test
create temp table _who as select user_id from public.crm_members where role = 'admin' and active limit 1;
grant select on _who to authenticated, anon;

-- ---------------------------------------------------------------- anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into _proof (check_name, ok) values
  ('anon cannot read cases', pg_temp.expect_error('select 1 from public.crm_cases limit 1')),
  ('anon cannot read members', pg_temp.expect_error('select 1 from public.crm_members limit 1')),
  ('anon cannot call crm_lookup', pg_temp.expect_error('select public.crm_lookup(''1234'')')),
  ('anon cannot call crm_counts', pg_temp.expect_error('select public.crm_counts()')),
  ('anon cannot insert a case', pg_temp.expect_error('insert into public.crm_cases (description, severity) values (''x'', ''serious'')'));

-- ---------------------------------------------------------------- signed in, not a member
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000beef","role":"authenticated"}', true);
insert into _proof (check_name, ok) values
  ('non-member sees 0 cases', (select count(*) = 0 from public.crm_cases)),
  ('non-member sees 0 members', (select count(*) = 0 from public.crm_members)),
  ('non-member sees 0 settings', (select count(*) = 0 from public.crm_settings)),
  ('non-member cannot insert a case', pg_temp.expect_error('insert into public.crm_cases (description, severity) values (''x'', ''serious'')')),
  ('non-member cannot call crm_lookup', pg_temp.expect_error('select public.crm_lookup(''haven'')')),
  ('non-member cannot call crm_customer', pg_temp.expect_error('select public.crm_customer(''03001234567'')')),
  ('non-member cannot call crm_insights', pg_temp.expect_error('select public.crm_insights(current_date - 7, current_date)')),
  ('non-member cannot call crm_delivery_watch', pg_temp.expect_error('select public.crm_delivery_watch()')),
  ('non-member cannot add themselves', pg_temp.expect_error('select public.crm_admin_add_member(''x@y.z'', ''admin'')')),
  ('non-member cannot read secrets', pg_temp.expect_error('select public.integration_get_secret(''shopify'')')),
  ('non-member cannot read storage', (select count(*) = 0 from storage.objects where bucket_id = 'crm-attachments'));

-- ---------------------------------------------------------------- viewer
reset role;
select set_config('request.jwt.claims', '', true);
update public.crm_members set role = 'viewer' where user_id = (select user_id from _who);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from _who), 'role', 'authenticated')::text, true);
insert into _proof (check_name, ok) values
  ('viewer can read settings', (select count(*) > 0 from public.crm_settings)),
  ('viewer can call crm_counts', not pg_temp.expect_error('select public.crm_counts()')),
  ('viewer cannot insert a case', pg_temp.expect_error('insert into public.crm_cases (description, severity) values (''x'', ''serious'')')),
  ('viewer cannot change settings', pg_temp.affected('update public.crm_settings set value = ''false'' where key = ''auto_assign''') <= 0),
  ('viewer cannot log delivery contact', pg_temp.expect_error('select public.crm_log_delivery_contact(1, ''reached'')'));

-- ---------------------------------------------------------------- agent
reset role;
select set_config('request.jwt.claims', '', true);
update public.crm_members set role = 'agent' where user_id = (select user_id from _who);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from _who), 'role', 'authenticated')::text, true);
insert into public.crm_cases (description, severity, status) values ('proof case', 'non_serious', 'open');
insert into _proof (check_name, ok) values
  ('agent can create a case', (select count(*) = 1 from public.crm_cases where description = 'proof case')),
  ('creating a case writes the timeline', (select count(*) = 1 from public.crm_case_events e join public.crm_cases c on c.id = e.case_id where c.description = 'proof case' and e.kind = 'created')),
  ('agent cannot forge a system event', pg_temp.expect_error('insert into public.crm_case_events (case_id, kind) select id, ''resolved'' from public.crm_cases where description = ''proof case''')),
  ('agent cannot write as someone else', pg_temp.expect_error('insert into public.crm_case_events (case_id, kind, actor) select id, ''note'', ''00000000-0000-0000-0000-00000000beef'' from public.crm_cases where description = ''proof case''')),
  ('agent cannot edit complaint types', pg_temp.expect_error('insert into public.crm_complaint_types (label) values (''hack'')')),
  ('agent cannot promote themselves', pg_temp.affected('update public.crm_members set role = ''admin'' where user_id = (select user_id from _who)') <= 0),
  ('agent cannot change settings', pg_temp.affected('update public.crm_settings set value = ''false'' where key = ''auto_assign''') <= 0),
  ('agent cannot add members', pg_temp.expect_error('select public.crm_admin_add_member(''x@y.z'', ''admin'')'));
delete from public.crm_cases where description = 'proof case';
insert into _proof (check_name, ok) values
  ('agent delete is a no-op (admins only)', (select count(*) = 1 from public.crm_cases where description = 'proof case'));

-- ---------------------------------------------------------------- schema-wide
reset role;
insert into _proof (check_name, ok) values
  ('RLS enabled on every crm table', (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'crm\_%')),
  ('anon has no privileges on crm tables', not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_name like 'crm\_%')),
  ('every crm function pins search_path', not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'crm\_%' and not coalesce(p.proconfig::text ilike '%search_path%', false))),
  ('signed-in users can execute only the membership-checked crm RPCs', not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'crm\_%' and has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname not in ('crm_admin_add_member', 'crm_counts', 'crm_customer', 'crm_delivery_watch', 'crm_has', 'crm_insights',
                              'crm_log_delivery_contact', 'crm_lookup', 'crm_my_role', 'crm_norm_order', 'crm_order', 'crm_phone_key', 'crm_search'))),
  ('anon cannot execute any crm function', not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'crm\_%' and has_function_privilege('anon', p.oid, 'execute')));

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed, count(*) as total,
       string_agg(check_name, '; ') filter (where not ok) as failures
from _proof;

rollback;
