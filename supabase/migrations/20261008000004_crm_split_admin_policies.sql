-- "for all" admin policies overlapped with "members read" on SELECT, so Postgres
-- evaluated two policies per row. Split them per action (same access, one SELECT policy).
drop policy "admins write" on public.crm_complaint_types;
drop policy "admins write" on public.crm_templates;

create policy "admins insert" on public.crm_complaint_types for insert to authenticated with check ((select public.crm_has('admin')));
create policy "admins update" on public.crm_complaint_types for update to authenticated
  using ((select public.crm_has('admin'))) with check ((select public.crm_has('admin')));
create policy "admins delete" on public.crm_complaint_types for delete to authenticated using ((select public.crm_has('admin')));

create policy "admins insert" on public.crm_templates for insert to authenticated with check ((select public.crm_has('admin')));
create policy "admins update" on public.crm_templates for update to authenticated
  using ((select public.crm_has('admin'))) with check ((select public.crm_has('admin')));
create policy "admins delete" on public.crm_templates for delete to authenticated using ((select public.crm_has('admin')));
