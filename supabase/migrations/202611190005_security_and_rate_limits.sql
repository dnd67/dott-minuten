-- Minutenclub v6: Rate-Limiting, Einladungs-Pflicht (Invite-Only) und Einladungs-Sperre.
-- Rein additiv, kompatibel mit bestehenden Daten und PGlite-Tests.
begin;

create table if not exists app_private.rate_limits (
  bucket text primary key check (length(trim(bucket)) between 1 and 200),
  window_start timestamptz not null,
  hits integer not null default 1 check (hits >= 1)
);

revoke all on table app_private.rate_limits from public, anon, authenticated;

create or replace function public.check_public_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text := trim(coalesce(p_bucket, ''));
  v_window timestamptz;
  v_hits integer;
begin
  if length(v_bucket) < 1 or length(v_bucket) > 200 then
    raise exception 'Ungültiger Rate-Limit-Schlüssel.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'Ungültiges Limit.';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Ungültiges Zeitfenster.';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into app_private.rate_limits (bucket, window_start, hits)
  values (v_bucket, v_window, 1)
  on conflict (bucket)
  do update set
    hits = case
      when app_private.rate_limits.window_start = excluded.window_start
        then app_private.rate_limits.hits + 1
      else 1
    end,
    window_start = excluded.window_start
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.check_public_rate_limit(text, integer, integer)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.check_public_rate_limit(text, integer, integer)
      to service_role;
  end if;
end $$;

create or replace function public.registration_requires_invite()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_accounts)
      or exists (select 1 from public.groups);
$$;

revoke all on function public.registration_requires_invite() from public;
grant execute on function public.registration_requires_invite() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.registration_requires_invite() to service_role;
  end if;
end $$;

create or replace function public.revoke_invites(
  p_group_id uuid,
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked integer := 0;
begin
  perform app_private.authorize(p_group_id, true);
  if not app_private.claim(p_group_id, p_request_id, 'revoke_invites', '{}'::jsonb) then
    return 0;
  end if;

  update public.invitations
  set expires_at = now()
  where group_id = p_group_id
    and expires_at > now();

  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;

revoke all on function public.revoke_invites(uuid, uuid) from public, anon;
grant execute on function public.revoke_invites(uuid, uuid) to authenticated;

commit;
