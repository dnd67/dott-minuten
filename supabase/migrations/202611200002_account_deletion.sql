-- Minutenclub v11: Selbstständige Kontolöschung mit Erhalt der Gruppenbuchhaltung.
-- Rein additiv (keine DROP TABLE / kein Datenverlust), kompatibel mit historischen Daten und PGlite-Tests.
begin;

-- 1. Audit- und Zuordnungsspalten zu auth.users(id) nullable machen und FKs sicher auf ON DELETE SET NULL umstellen.
alter table public.groups alter column created_by drop not null;
alter table public.memberships alter column user_id drop not null;
alter table public.minute_entries alter column created_by drop not null;
alter table public.feedback alter column created_by drop not null;

do $$
declare
  spec record;
  fk record;
begin
  for spec in
    select * from (values
      ('groups', 'created_by', 'groups_created_by_fkey'),
      ('memberships', 'user_id', 'memberships_user_id_fkey'),
      ('minute_entries', 'created_by', 'minute_entries_created_by_fkey'),
      ('feedback', 'created_by', 'feedback_created_by_fkey'),
      ('group_places', 'created_by', 'group_places_created_by_fkey')
    ) as t(tbl, col, cname)
  loop
    for fk in
      select c.conname
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = any(c.conkey)
      join pg_class frel on frel.oid = c.confrelid
      join pg_namespace fnsp on fnsp.oid = frel.relnamespace
      where c.contype = 'f'
        and nsp.nspname = 'public'
        and rel.relname = spec.tbl
        and att.attname = spec.col
        and fnsp.nspname = 'auth'
        and frel.relname = 'users'
        and array_length(c.conkey, 1) = 1
    loop
      execute format('alter table public.%I drop constraint %I', spec.tbl, fk.conname);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      spec.tbl, spec.cname, spec.col
    );
  end loop;
end;
$$;

-- 2. Fehlende FK-Indizes für schnelle ON DELETE SET NULL / ON DELETE CASCADE Vorgänge ergänzen.
create index if not exists minute_entries_created_by_idx
  on public.minute_entries(created_by)
  where created_by is not null;

create index if not exists feedback_created_by_idx
  on public.feedback(created_by)
  where created_by is not null;

create index if not exists group_places_created_by_idx
  on public.group_places(created_by)
  where created_by is not null;

create index if not exists reset_requests_target_user_idx
  on public.password_reset_requests(target_user_id);

-- 3. Gelöschte Konten (user_id IS NULL) gegen nachträgliche Rollen-, Status- und Namensänderungen schützen.
create or replace function public.update_member(
  p_group_id uuid,
  p_request_id uuid,
  p_member_id uuid,
  p_role text,
  p_active boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.memberships;
begin
  perform app_private.authorize(p_group_id, true);
  if p_role is null or p_role not in ('admin', 'member') or p_active is null then
    raise exception 'Ungültige Rolle.';
  end if;
  if not app_private.claim(p_group_id, p_request_id, 'member', jsonb_build_array(p_member_id, p_role, p_active)) then
    return;
  end if;
  select * into target from public.memberships where id = p_member_id and group_id = p_group_id;
  if not found then
    raise exception 'Mitglied nicht gefunden.';
  end if;
  if target.user_id is null then
    raise exception 'Gelöschte Konten können nicht mehr geändert werden.';
  end if;
  if target.active and target.role = 'admin' and (not p_active or p_role <> 'admin')
    and (
      select count(*)
      from public.memberships
      where group_id = p_group_id
        and active
        and role = 'admin'
        and user_id is not null
    ) <= 1 then
    raise exception 'Mindestens ein aktiver Admin muss bleiben.';
  end if;
  update public.memberships set role = p_role, active = p_active where id = target.id;
end;
$$;

revoke all on function public.update_member(uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.update_member(uuid, uuid, uuid, text, boolean) to authenticated;

create or replace function public.rename_member(
  p_group_id uuid,
  p_request_id uuid,
  p_member_id uuid,
  p_display_name text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  target public.memberships;
begin
  actor := app_private.authorize(p_group_id);
  select * into target from public.memberships where id = p_member_id and group_id = p_group_id;
  if not found then
    raise exception 'Mitglied nicht gefunden.';
  end if;
  if actor <> target.id and not app_private.is_member(p_group_id, true) then
    raise exception 'Du darfst nur deinen eigenen Namen ändern.';
  end if;
  if target.user_id is null then
    raise exception 'Gelöschte Konten können nicht mehr umbenannt werden.';
  end if;
  if p_display_name is null or length(trim(p_display_name)) not between 1 and 60 then
    raise exception 'Bitte einen Namen mit 1 bis 60 Zeichen eingeben.';
  end if;
  if not app_private.claim(p_group_id, p_request_id, 'rename', jsonb_build_array(p_member_id, trim(p_display_name))) then
    return;
  end if;
  update public.memberships set display_name = trim(p_display_name) where id = target.id;
end;
$$;

revoke all on function public.rename_member(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.rename_member(uuid, uuid, uuid, text) to authenticated;

-- 4. Invite-Only-Prüfung: Verwaiste Gruppen ohne aktive Mitgliedschaften/Konten blockieren keine Neuregistrierung.
create or replace function public.registration_requires_invite()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_accounts)
      or exists (select 1 from public.memberships where active and user_id is not null);
$$;

revoke all on function public.registration_requires_invite() from public;
grant execute on function public.registration_requires_invite() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.registration_requires_invite() to service_role;
  end if;
end $$;

-- 5. Idempotente Vorbereitung der Kontolöschung (ausschliesslich für service_role).
-- Belässt memberships.user_id bis zum unmittelbar folgenden auth.admin.deleteUser(uid, false),
-- damit auth.users -> user_accounts/password_reset_requests (CASCADE) und memberships/created_by (SET NULL)
-- atomar in einer Transaktion greifen.
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership record;
  v_member_ids uuid[] := '{}'::uuid[];
  v_member_id_texts text[] := '{}'::text[];
  v_group_ids uuid[] := '{}'::uuid[];
  v_feedback_ids uuid[] := '{}'::uuid[];
  v_other_active_members integer;
  v_other_active_admins integer;
  v_successor_id uuid;
  v_groups_updated integer := 0;
  v_promoted_admins integer := 0;
  v_expired_invites integer := 0;
  v_row_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'Ungültige Benutzer-ID.';
  end if;

  -- Nutzer-Zeile und alle betroffenen Gruppen in aufsteigender ID-Reihenfolge sperren (Deadlock-frei).
  perform 1
  from auth.users
  where id = p_user_id
  for update;

  perform 1
  from public.groups g
  where g.id in (
    select distinct m.group_id
    from public.memberships m
    where m.user_id = p_user_id
  )
  order by g.id asc
  for update;

  for v_membership in
    select id, group_id, role, active
    from public.memberships
    where user_id = p_user_id
    order by group_id asc, id asc
  loop
    v_member_ids := array_append(v_member_ids, v_membership.id);
    v_member_id_texts := array_append(v_member_id_texts, v_membership.id::text);
    v_group_ids := array_append(v_group_ids, v_membership.group_id);

    if v_membership.active then
      select count(*)
      into v_other_active_members
      from public.memberships
      where group_id = v_membership.group_id
        and active
        and user_id is not null
        and user_id <> p_user_id;

      if v_other_active_members = 0 then
        update public.invitations
        set expires_at = now()
        where group_id = v_membership.group_id
          and expires_at > now();

        get diagnostics v_row_count = row_count;
        v_expired_invites := v_expired_invites + v_row_count;
      elsif v_membership.role = 'admin' then
        select count(*)
        into v_other_active_admins
        from public.memberships
        where group_id = v_membership.group_id
          and active
          and role = 'admin'
          and user_id is not null
          and user_id <> p_user_id;

        if v_other_active_admins = 0 then
          select id
          into v_successor_id
          from public.memberships
          where group_id = v_membership.group_id
            and active
            and user_id is not null
            and user_id <> p_user_id
          order by created_at asc, id asc
          limit 1;

          if v_successor_id is not null then
            update public.memberships
            set role = 'admin'
            where id = v_successor_id;

            v_promoted_admins := v_promoted_admins + 1;
          end if;
        end if;
      end if;
    end if;
  end loop;

  update public.memberships
  set active = false,
      role = 'member',
      display_name = 'Gelöschtes Konto'
  where user_id = p_user_id
    and (active or role <> 'member' or display_name <> 'Gelöschtes Konto');

  get diagnostics v_groups_updated = row_count;

  with deleted_feedback as (
    delete from public.feedback
    where created_by = p_user_id
       or member_id = any(v_member_ids)
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[])
  into v_feedback_ids
  from deleted_feedback;

  delete from app_private.commands
  where operation in ('rename', 'feedback')
    and (
      (
        cardinality(v_member_id_texts) > 0
        and group_id = any(v_group_ids)
        and payload->>0 = any(v_member_id_texts)
      )
      or (
        operation = 'feedback'
        and cardinality(v_feedback_ids) > 0
        and request_id = any(v_feedback_ids)
      )
    );

  delete from app_private.rate_limits
  where bucket = 'admin:' || p_user_id::text;

  return jsonb_build_object(
    'ok', true,
    'groups_updated', v_groups_updated,
    'promoted_admins', v_promoted_admins,
    'expired_invites', v_expired_invites
  );
end;
$$;

revoke all on function public.prepare_account_deletion(uuid)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.prepare_account_deletion(uuid)
      to service_role;
  end if;
end $$;

commit;
