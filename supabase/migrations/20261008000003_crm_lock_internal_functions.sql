-- Supabase grants EXECUTE on new public functions to `authenticated` by default.
-- Internal helpers have no membership check of their own, so only the database
-- (triggers, other security-definer functions, pg_cron) and service_role may call them.
-- The remaining crm_* RPCs are meant to be called by signed-in users and each one
-- checks Havenwear Care membership itself (crm_assert).
revoke execute on function
  public.crm_order_json(bigint),
  public.crm_watch_rows(),
  public.crm_auto_close(),
  public.crm_setting(text),
  public.crm_assert(public.crm_role),
  public.crm_cases_before_insert(),
  public.crm_cases_before_update(),
  public.crm_cases_after_change(),
  public.crm_events_after_insert(),
  public.crm_touch_profile(),
  public.crm_guard_member()
from authenticated, anon, public;

grant execute on function public.crm_order_json(bigint), public.crm_watch_rows(), public.crm_auto_close(),
  public.crm_setting(text), public.crm_assert(public.crm_role) to service_role;
