-- Optionale Fahrtorte (nur bei aktiver Verwendung erfasst) und Feedback-Tabelle für den Launch.
begin;

alter table public.rides
  add column start_label text not null default '' check (length(start_label) <= 120),
  add column start_lat double precision check (start_lat is null or (start_lat <> 'NaN'::float8 and start_lat between -90 and 90)),
  add column start_lng double precision check (start_lng is null or (start_lng <> 'NaN'::float8 and start_lng between -180 and 180)),
  add column end_label text not null default '' check (length(end_label) <= 120),
  add column end_lat double precision check (end_lat is null or (end_lat <> 'NaN'::float8 and end_lat between -90 and 90)),
  add column end_lng double precision check (end_lng is null or (end_lng <> 'NaN'::float8 and end_lng between -180 and 180)),
  add constraint rides_start_coords_pair check ((start_lat is null) = (start_lng is null)),
  add constraint rides_end_coords_pair check ((end_lat is null) = (end_lng is null));

create or replace function public.record_ride(
  p_group_id uuid,
  p_request_id uuid,
  p_occurred_at timestamptz,
  p_drive_minutes integer,
  p_pause_minutes integer,
  p_note text,
  p_start_label text,
  p_start_lat double precision,
  p_start_lng double precision,
  p_end_label text,
  p_end_lat double precision,
  p_end_lng double precision
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
  consumption bigint;
  estimate numeric;
  s_label text := coalesce(trim(p_start_label), '');
  e_label text := coalesce(trim(p_end_label), '');
  s_lat double precision;
  s_lng double precision;
  e_lat double precision;
  e_lng double precision;
begin
  mid := app_private.authorize(p_group_id);
  if p_drive_minutes is null or p_pause_minutes is null or p_occurred_at is null
    or p_drive_minutes < 0 or p_pause_minutes < 0
    or p_drive_minutes > 10000000 or p_pause_minutes > 10000000
    or (p_drive_minutes::bigint + p_pause_minutes) <= 0 then
    raise exception 'Bitte gültige Fahr- und Pausenminuten eingeben.';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then
    raise exception 'Die Fahrt liegt in der Zukunft.';
  end if;
  if length(s_label) > 120 or length(e_label) > 120 then
    raise exception 'Ortsnamen dürfen höchstens 120 Zeichen lang sein.';
  end if;
  if (p_start_lat is null) <> (p_start_lng is null) or (p_end_lat is null) <> (p_end_lng is null) then
    raise exception 'Unvollständige Standortkoordinaten.';
  end if;
  if p_start_lat is not null then
    if p_start_lat = 'NaN'::float8 or p_start_lng = 'NaN'::float8
      or p_start_lat not between -90 and 90 or p_start_lng not between -180 and 180 then
      raise exception 'Ungültiger Startort.';
    end if;
    s_lat := round(p_start_lat::numeric, 4)::double precision;
    s_lng := round(p_start_lng::numeric, 4)::double precision;
  end if;
  if p_end_lat is not null then
    if p_end_lat = 'NaN'::float8 or p_end_lng = 'NaN'::float8
      or p_end_lat not between -90 and 90 or p_end_lng not between -180 and 180 then
      raise exception 'Ungültiger Zielort.';
    end if;
    e_lat := round(p_end_lat::numeric, 4)::double precision;
    e_lng := round(p_end_lng::numeric, 4)::double precision;
  end if;
  if not app_private.claim(
    p_group_id,
    p_request_id,
    'ride',
    jsonb_build_array(mid, p_occurred_at, p_drive_minutes, p_pause_minutes, p_note, s_label, s_lat, s_lng, e_label, e_lat, e_lng)
  ) then
    return p_request_id;
  end if;
  consumption := (p_drive_minutes::bigint + p_pause_minutes) * 60;
  select consumption * sum(price_rappen)::numeric / nullif(sum(seconds), 0) into estimate
    from public.packages where group_id = p_group_id and purchased_at <= p_occurred_at;
  insert into public.rides(
    id, group_id, member_id, occurred_at, duration_seconds, pause_seconds, note,
    estimated_cost_rappen, start_label, start_lat, start_lng, end_label, end_lat, end_lng
  ) values (
    p_request_id, p_group_id, mid, p_occurred_at,
    p_drive_minutes::bigint * 60, p_pause_minutes::bigint * 60, trim(coalesce(p_note, '')),
    estimate, s_label, s_lat, s_lng, e_label, e_lat, e_lng
  );
  insert into public.minute_entries(group_id, member_id, seconds, kind, ride_id, reason, created_by)
    values (p_group_id, mid, -consumption, 'ride', p_request_id, 'Fahrt inkl. Pause', auth.uid());
  return p_request_id;
end;
$$;

revoke all on function public.record_ride(uuid,uuid,timestamptz,integer,integer,text,text,double precision,double precision,text,double precision,double precision) from public, anon;
grant execute on function public.record_ride(uuid,uuid,timestamptz,integer,integer,text,text,double precision,double precision,text,double precision,double precision) to authenticated;

create table public.feedback (
  id uuid primary key,
  group_id uuid not null references public.groups(id),
  member_id uuid not null,
  category text not null check (category in ('idea', 'bug', 'praise', 'other')),
  message text not null check (length(trim(message)) between 1 and 2000),
  page text not null default '' check (length(page) <= 80),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (group_id, member_id) references public.memberships(group_id, id)
);

create index feedback_group_idx on public.feedback(group_id, created_at desc);
alter table public.feedback enable row level security;
-- Admins lesen alle Rückmeldungen der Gruppe; Mitglieder sehen ihre eigenen Einträge.
create policy feedback_read on public.feedback for select to authenticated
  using (app_private.is_member(group_id, true) or (app_private.is_member(group_id) and created_by = (select auth.uid())));
revoke all on public.feedback from public, anon, authenticated;
grant select on public.feedback to authenticated;

create function public.submit_feedback(
  p_group_id uuid,
  p_request_id uuid,
  p_category text,
  p_message text,
  p_page text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
  clean_message text := trim(coalesce(p_message, ''));
  clean_page text := trim(coalesce(p_page, ''));
begin
  mid := app_private.authorize(p_group_id);
  if p_category is null or p_category not in ('idea', 'bug', 'praise', 'other') then
    raise exception 'Bitte eine gültige Feedback-Kategorie wählen.';
  end if;
  if length(clean_message) not between 1 and 2000 then
    raise exception 'Bitte eine Nachricht mit 1 bis 2000 Zeichen eingeben.';
  end if;
  if length(clean_page) > 80 then
    raise exception 'Ungültiger Seitenkontext.';
  end if;
  if not app_private.claim(p_group_id, p_request_id, 'feedback', jsonb_build_array(mid, p_category, clean_message, clean_page)) then
    return p_request_id;
  end if;
  insert into public.feedback(id, group_id, member_id, category, message, page, created_by)
    values (p_request_id, p_group_id, mid, p_category, clean_message, clean_page, auth.uid());
  return p_request_id;
end;
$$;

revoke all on function public.submit_feedback(uuid,uuid,text,text,text) from public, anon;
grant execute on function public.submit_feedback(uuid,uuid,text,text,text) to authenticated;

create or replace function public.get_dashboard(p_group_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'group', jsonb_build_object('id', g.id, 'name', g.name),
    'members', (select coalesce(jsonb_agg(m order by m.created_at), '[]'::jsonb) from public.memberships m where m.group_id = g.id),
    'rides', (select coalesce(jsonb_agg(r order by r.occurred_at desc), '[]'::jsonb) from public.rides r where r.group_id = g.id),
    'entries', (select coalesce(jsonb_agg(e order by e.created_at desc), '[]'::jsonb) from public.minute_entries e where e.group_id = g.id),
    'packages', (select coalesce(jsonb_agg(p order by p.purchased_at desc), '[]'::jsonb) from public.packages p where p.group_id = g.id),
    'contributions', (select coalesce(jsonb_agg(c order by c.created_at, c.id), '[]'::jsonb) from public.package_contributions c where c.group_id = g.id),
    'feedback', (select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb) from public.feedback f where f.group_id = g.id)
  ) from public.groups g where g.id = p_group_id;
$$;

revoke all on function public.get_dashboard(uuid) from public, anon;
grant execute on function public.get_dashboard(uuid) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback') then
      alter publication supabase_realtime add table public.feedback;
    end if;
  end if;
end; $$;

commit;
