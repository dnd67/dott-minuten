-- Minutenclub v1. In einem neuen Supabase-Projekt im SQL Editor ausführen.
-- Alle Buchungen erfolgen ausschliesslich durch autorisierte RPCs.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (created_by, request_id)
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  role text not null default 'member' check (role in ('admin','member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id,user_id), unique (group_id,id)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  token text not null unique default replace(gen_random_uuid()::text,'-',''),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create table public.rides (
  id uuid primary key,
  group_id uuid not null references public.groups(id),
  member_id uuid not null,
  occurred_at timestamptz not null,
  duration_seconds bigint not null check (duration_seconds between 0 and 600000000),
  pause_seconds bigint not null check (pause_seconds between 0 and 600000000),
  charged_seconds bigint generated always as (duration_seconds + pause_seconds) stored,
  note text not null default '' check (length(note) <= 500),
  source text not null default 'manual' check (source in ('manual','ocr')),
  rule_version text not null default 'drive-plus-pause-v1',
  estimated_cost_rappen numeric,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  foreign key(group_id,member_id) references public.memberships(group_id,id),
  unique(group_id,id),
  check(duration_seconds + pause_seconds > 0),
  constraint rides_manual_only check(source = 'manual') -- OCR wird erst mit geprüfter Server-Verarbeitung aktiviert.
);
create table public.minute_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  member_id uuid not null,
  seconds bigint not null check(seconds <> 0),
  kind text not null check(kind in ('credit','ride','reversal')),
  ride_id uuid,
  reason text not null check(length(trim(reason)) between 1 and 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(group_id,member_id) references public.memberships(group_id,id),
  foreign key(group_id,ride_id) references public.rides(group_id,id),
  unique(ride_id,kind)
);
create table public.packages (
  id uuid primary key,
  group_id uuid not null references public.groups(id),
  payer_id uuid not null,
  seconds bigint not null check(seconds > 0 and seconds <= 600000000),
  price_rappen bigint not null check(price_rappen between 0 and 1000000000000),
  purchased_at timestamptz not null,
  note text not null default '' check(length(note) <= 500),
  created_at timestamptz not null default now(),
  foreign key(group_id,payer_id) references public.memberships(group_id,id)
);
create table app_private.commands (
  group_id uuid not null references public.groups(id),
  request_id uuid not null,
  operation text not null,
  payload jsonb not null,
  primary key(group_id,request_id)
);
revoke all on app_private.commands from public,anon,authenticated;
create index memberships_user_idx on public.memberships(user_id);
create index rides_group_idx on public.rides(group_id,occurred_at desc);
create index entries_group_idx on public.minute_entries(group_id,created_at desc);
create index packages_group_idx on public.packages(group_id);
create index invitations_group_idx on public.invitations(group_id);

create function app_private.is_member(p_group uuid, p_admin boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships
    where group_id=p_group and user_id=(select auth.uid()) and active
    and (not p_admin or role='admin'));
$$;
-- Ein Gruppenschloss serialisiert kurze Mutationen und verhindert verlorene Änderungen.
create function app_private.authorize(p_group uuid, p_admin boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  perform 1 from public.groups where id=p_group for update;
  select id into mid from public.memberships where group_id=p_group
    and user_id=auth.uid() and active and (not p_admin or role='admin');
  if mid is null then raise exception 'Keine Berechtigung für diese Gruppe.'; end if;
  return mid;
end;
$$;
create function app_private.claim(p_group uuid,p_request uuid,p_op text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old app_private.commands;
begin
  select * into old from app_private.commands where group_id=p_group and request_id=p_request;
  if found then
    if old.operation <> p_op or old.payload <> p_payload then
      raise exception 'Diese Anfrage wurde bereits mit anderen Werten verwendet.';
    end if;
    return false;
  end if;
  insert into app_private.commands values(p_group,p_request,p_op,p_payload);
  return true;
end;
$$;

alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.rides enable row level security;
alter table public.minute_entries enable row level security;
alter table public.packages enable row level security;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_member(uuid,boolean) to authenticated;
create policy group_read on public.groups for select to authenticated using(app_private.is_member(id));
create policy member_read on public.memberships for select to authenticated using(app_private.is_member(group_id));
create policy invite_read on public.invitations for select to authenticated using(app_private.is_member(group_id,true));
create policy ride_read on public.rides for select to authenticated using(app_private.is_member(group_id));
create policy entry_read on public.minute_entries for select to authenticated using(app_private.is_member(group_id));
create policy package_read on public.packages for select to authenticated using(app_private.is_member(group_id));
revoke all on public.groups,public.memberships,public.invitations,public.rides,public.minute_entries,public.packages from public,anon,authenticated;
grant select on public.groups,public.memberships,public.invitations,public.rides,public.minute_entries,public.packages to authenticated;

create function public.create_group(p_name text,p_display_name text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  -- Auth-Nutzer sperren: doppelte Erstellung mit gleichem Schlüssel bleibt eine Gruppe.
  perform 1 from auth.users where id=auth.uid() for update;
  select id into gid from public.groups where created_by=auth.uid() and request_id=p_request_id;
  if gid is not null then return gid; end if;
  insert into public.groups(name,created_by,request_id) values(trim(p_name),auth.uid(),p_request_id) returning id into gid;
  insert into public.memberships(group_id,user_id,display_name,role) values(gid,auth.uid(),trim(p_display_name),'admin');
  return gid;
end;
$$;
create function public.create_invite(p_group_id uuid,p_request_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  perform app_private.authorize(p_group_id,true);
  if not app_private.claim(p_group_id,p_request_id,'invite','{}') then
    select token into code from public.invitations where id=p_request_id and group_id=p_group_id;
    return code;
  end if;
  insert into public.invitations(id,group_id) values(p_request_id,p_group_id) returning token into code;
  return code;
end;
$$;
create function public.join_group(p_token text,p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid; existing public.memberships;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  select group_id into gid from public.invitations where token=trim(p_token) and expires_at>now();
  if gid is null then raise exception 'Einladung ungültig oder abgelaufen.'; end if;
  perform 1 from public.groups where id=gid for update;
  select * into existing from public.memberships where group_id=gid and user_id=auth.uid();
  if found then
    if not existing.active then raise exception 'Dein Zugang wurde deaktiviert. Bitte den Admin kontaktieren.'; end if;
    return gid;
  end if;
  insert into public.memberships(group_id,user_id,display_name) values(gid,auth.uid(),trim(p_display_name));
  return gid;
end;
$$;
create function public.record_ride(p_group_id uuid,p_request_id uuid,p_occurred_at timestamptz,
  p_drive_minutes integer,p_pause_minutes integer,p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid; consumption bigint; estimate numeric;
begin
  mid := app_private.authorize(p_group_id);
  if p_drive_minutes is null or p_pause_minutes is null or p_occurred_at is null
    or p_drive_minutes < 0 or p_pause_minutes < 0
    or p_drive_minutes > 10000000 or p_pause_minutes > 10000000
    or (p_drive_minutes::bigint+p_pause_minutes) <= 0 then
    raise exception 'Bitte gültige Fahr- und Pausenminuten eingeben.';
  end if;
  if p_occurred_at>now()+interval '5 minutes' then raise exception 'Die Fahrt liegt in der Zukunft.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'ride',jsonb_build_array(mid,p_occurred_at,p_drive_minutes,p_pause_minutes,p_note)) then return p_request_id; end if;
  consumption := (p_drive_minutes::bigint+p_pause_minutes)*60;
  select consumption * sum(price_rappen)::numeric / nullif(sum(seconds),0) into estimate
    from public.packages where group_id=p_group_id and purchased_at<=p_occurred_at;
  insert into public.rides(id,group_id,member_id,occurred_at,duration_seconds,pause_seconds,note,estimated_cost_rappen)
    values(p_request_id,p_group_id,mid,p_occurred_at,p_drive_minutes::bigint*60,p_pause_minutes::bigint*60,trim(p_note),estimate);
  insert into public.minute_entries(group_id,member_id,seconds,kind,ride_id,reason,created_by)
    values(p_group_id,mid,-consumption,'ride',p_request_id,'Fahrt inkl. Pause',auth.uid());
  return p_request_id;
end;
$$;
create function public.credit_minutes(p_group_id uuid,p_request_id uuid,p_member_id uuid,p_minutes integer,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.authorize(p_group_id,true);
  if p_minutes is null or p_minutes<=0 or p_minutes>10000000 then raise exception 'Bitte einen positiven Minutenbetrag eingeben.'; end if;
  if not exists(select 1 from public.memberships where id=p_member_id and group_id=p_group_id and active) then raise exception 'Aktives Mitglied nicht gefunden.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'credit',jsonb_build_array(p_member_id,p_minutes,p_reason)) then return; end if;
  insert into public.minute_entries(group_id,member_id,seconds,kind,reason,created_by)
    values(p_group_id,p_member_id,p_minutes::bigint*60,'credit',trim(p_reason),auth.uid());
end;
$$;
create function public.record_package(p_group_id uuid,p_request_id uuid,p_payer_id uuid,p_minutes integer,
  p_price_rappen bigint,p_purchased_at timestamptz,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.authorize(p_group_id,true);
  if p_minutes is null or p_minutes<=0 or p_minutes>10000000 or p_purchased_at is null
    or p_purchased_at>now()+interval '5 minutes' then raise exception 'Ungültiger Paketkauf.'; end if;
  if not exists(select 1 from public.memberships where id=p_payer_id and group_id=p_group_id and active) then raise exception 'Aktives Mitglied nicht gefunden.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'package',jsonb_build_array(p_payer_id,p_minutes,p_price_rappen,p_purchased_at,p_note)) then return; end if;
  insert into public.packages(id,group_id,payer_id,seconds,price_rappen,purchased_at,note)
    values(p_request_id,p_group_id,p_payer_id,p_minutes::bigint*60,p_price_rappen,p_purchased_at,trim(p_note));
end;
$$;
create function public.void_ride(p_group_id uuid,p_request_id uuid,p_ride_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.rides;
begin
  perform app_private.authorize(p_group_id,true);
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'Bitte einen Grund eingeben.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'void',jsonb_build_array(p_ride_id,p_reason)) then return; end if;
  select * into r from public.rides where id=p_ride_id and group_id=p_group_id for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;
  if r.voided_at is not null then return; end if;
  update public.rides set voided_at=now(),void_reason=trim(p_reason) where id=r.id;
  insert into public.minute_entries(group_id,member_id,seconds,kind,ride_id,reason,created_by)
    values(p_group_id,r.member_id,r.charged_seconds,'reversal',r.id,trim(p_reason),auth.uid());
end;
$$;
create function public.update_member(p_group_id uuid,p_request_id uuid,p_member_id uuid,p_role text,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.memberships;
begin
  perform app_private.authorize(p_group_id,true);
  if p_role is null or p_role not in ('admin','member') or p_active is null then raise exception 'Ungültige Rolle.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'member',jsonb_build_array(p_member_id,p_role,p_active)) then return; end if;
  select * into target from public.memberships where id=p_member_id and group_id=p_group_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if target.active and target.role='admin' and (not p_active or p_role<>'admin')
    and (select count(*) from public.memberships where group_id=p_group_id and active and role='admin')<=1 then
    raise exception 'Mindestens ein aktiver Admin muss bleiben.';
  end if;
  update public.memberships set role=p_role,active=p_active where id=target.id;
end;
$$;
-- PostgreSQL gewährt EXECUTE sonst standardmässig auch an PUBLIC.
revoke all on all functions in schema app_private from public,anon,authenticated;
grant execute on function app_private.is_member(uuid,boolean) to authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_group','create_invite','join_group','record_ride','credit_minutes','record_package','void_ride','update_member')
  loop
    execute format('revoke all on function %s from public, anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end;
$$;
-- Realtime übermittelt keine vertraulichen Bilder; RLS gilt auch für Tabellenänderungen.
-- Veröffentlichung ist in Supabase vorhanden. Guard erlaubt lokale SQL-Tests.
do $$
declare tab text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach tab in array array['groups','memberships','rides','minute_entries','packages'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tab) then
        execute format('alter publication supabase_realtime add table public.%I',tab);
      end if;
    end loop;
  end if;
end;
$$;

-- Eine gemeinsame Transaktionssicht für Guthaben, Fahrten und Statistik.
-- SECURITY INVOKER: Die RLS des angemeldeten Mitglieds bleibt wirksam.
create function public.get_dashboard(p_group_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'group',jsonb_build_object('id',g.id,'name',g.name),
    'members',(select coalesce(jsonb_agg(m order by m.created_at),'[]'::jsonb) from public.memberships m where m.group_id=g.id),
    'rides',(select coalesce(jsonb_agg(r order by r.occurred_at desc),'[]'::jsonb) from public.rides r where r.group_id=g.id),
    'entries',(select coalesce(jsonb_agg(e order by e.created_at desc),'[]'::jsonb) from public.minute_entries e where e.group_id=g.id),
    'packages',(select coalesce(jsonb_agg(p order by p.purchased_at desc),'[]'::jsonb) from public.packages p where p.group_id=g.id)
  ) from public.groups g where g.id=p_group_id;
$$;
revoke all on function public.get_dashboard(uuid) from public,anon;
grant execute on function public.get_dashboard(uuid) to authenticated;

commit;
