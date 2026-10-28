-- MIS page: list of users with their page permissions, so owners can be shown without an Admin session.
-- Returns username, role and page permissions only (never passwords or hashes).
-- Applied to the Order To Collection Refrasynth project (migration app_list_owners).
create or replace function public.app_list_owners()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(json_build_object(
    'username', u.username,
    'role', u.role::text,
    'page_permissions', array_to_string(u.page_permissions, ', ')
  ) order by u.created_at, u.username), '[]'::json)
  from public.users u;
$$;

revoke all on function public.app_list_owners() from public;
grant execute on function public.app_list_owners() to anon, authenticated;
