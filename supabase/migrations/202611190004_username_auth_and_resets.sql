-- Benutzername/Passwort-Konten und Admin-Verwaltung für Passwort-Zurücksetzungen.
begin;

create table public.user_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{2,32}$'),
  password_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_accounts enable row level security;
create policy account_read on public.user_accounts for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.memberships me
      join public.memberships peer on peer.group_id = me.group_id
      where me.user_id = (select auth.uid()) and me.active
        and peer.user_id = public.user_accounts.user_id
    )
  );
revoke all on public.user_accounts from public, anon, authenticated;
grant select on public.user_accounts to authenticated;

create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  member_id uuid not null,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  note text not null default '' check (length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'completed', 'dismissed')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_member_id uuid,
  foreign key (group_id, member_id) references public.memberships(group_id, id),
  foreign key (group_id, resolved_by_member_id) references public.memberships(group_id, id)
);

create index reset_requests_group_idx on public.password_reset_requests(group_id, status, requested_at desc);
alter table public.password_reset_requests enable row level security;
create policy reset_admin_read on public.password_reset_requests for select to authenticated
  using (app_private.is_member(group_id, true));
revoke all on public.password_reset_requests from public, anon, authenticated;
grant select on public.password_reset_requests to authenticated;

create function public.dismiss_password_reset(
  p_group_id uuid,
  p_request_id uuid,
  p_reset_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
begin
  actor := app_private.authorize(p_group_id, true);
  if p_reset_id is null then
    raise exception 'Anfrage nicht gefunden.';
  end if;
  if not app_private.claim(p_group_id, p_request_id, 'dismiss_reset', jsonb_build_array(p_reset_id)) then
    return;
  end if;
  update public.password_reset_requests
    set status = 'dismissed', resolved_at = now(), resolved_by_member_id = actor
    where id = p_reset_id and group_id = p_group_id and status = 'open';
end;
$$;

revoke all on function public.dismiss_password_reset(uuid,uuid,uuid) from public, anon;
grant execute on function public.dismiss_password_reset(uuid,uuid,uuid) to authenticated;

create function public.mark_own_password_updated()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Bitte anmelden.';
  end if;
  update public.user_accounts
    set password_updated_at = now()
    where user_id = auth.uid();
  update public.password_reset_requests
    set status = 'completed', resolved_at = now()
    where target_user_id = auth.uid() and status = 'open';
end;
$$;

revoke all on function public.mark_own_password_updated() from public, anon;
grant execute on function public.mark_own_password_updated() to authenticated;

create or replace function public.get_dashboard(p_group_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name),
    'members', (select coalesce(jsonb_agg(m order by m.created_at), '[]'::jsonb) from public.memberships m where m.group_id = g.id),
    'rides', (select coalesce(jsonb_agg(r order by r.occurred_at desc), '[]'::jsonb) from public.rides r where r.group_id = g.id),
    'entries', (select coalesce(jsonb_agg(e order by e.created_at desc), '[]'::jsonb) from public.minute_entries e where e.group_id = g.id),
    'packages', (select coalesce(jsonb_agg(p order by p.purchased_at desc), '[]'::jsonb) from public.packages p where p.group_id = g.id),
    'contributions', (select coalesce(jsonb_agg(c order by c.created_at, c.id), '[]'::jsonb) from public.package_contributions c where c.group_id = g.id),
    'feedback', (select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb) from public.feedback f where f.group_id = g.id),
    'accounts', (
      select coalesce(jsonb_agg(a order by a.username), '[]'::jsonb)
      from public.user_accounts a
      where exists (select 1 from public.memberships m where m.group_id = g.id and m.user_id = a.user_id)
    ),
    'reset_requests', (
      select coalesce(jsonb_agg(rr order by rr.requested_at desc), '[]'::jsonb)
      from public.password_reset_requests rr
      where rr.group_id = g.id
    )
  ) from public.groups g where g.id = p_group_id;
$$;

revoke all on function public.get_dashboard(uuid) from public, anon;
grant execute on function public.get_dashboard(uuid) to authenticated;

do $$
declare tab text;
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tab in array array['user_accounts', 'password_reset_requests'] loop
      if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tab) then
        execute format('alter publication supabase_realtime add table public.%I', tab);
      end if;
    end loop;
  end if;
end; $$;

commit;
