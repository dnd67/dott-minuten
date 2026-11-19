-- Auf bestehenden Installationen nach 202611180001_initial.sql ausführen.
begin;

create function public.rename_member(p_group_id uuid,p_request_id uuid,p_member_id uuid,p_display_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid; target public.memberships;
begin
  actor := app_private.authorize(p_group_id);
  select * into target from public.memberships where id=p_member_id and group_id=p_group_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if actor<>target.id and not app_private.is_member(p_group_id,true) then
    raise exception 'Du darfst nur deinen eigenen Namen ändern.';
  end if;
  if p_display_name is null or length(trim(p_display_name)) not between 1 and 60 then
    raise exception 'Bitte einen Namen mit 1 bis 60 Zeichen eingeben.';
  end if;
  if not app_private.claim(p_group_id,p_request_id,'rename',jsonb_build_array(p_member_id,trim(p_display_name))) then return; end if;
  update public.memberships set display_name=trim(p_display_name) where id=target.id;
end;
$$;
revoke all on function public.rename_member(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.rename_member(uuid,uuid,uuid,text) to authenticated;

alter table public.rides add column voided_by_member_id uuid;
alter table public.rides add constraint ride_void_actor_fk
  foreign key(group_id,voided_by_member_id) references public.memberships(group_id,id);
-- Vorhandene Stornos lassen sich anhand der unveränderlichen Gegenbuchung zuordnen.
update public.rides r set voided_by_member_id=m.id
from public.minute_entries e join public.memberships m on m.group_id=e.group_id and m.user_id=e.created_by
where e.ride_id=r.id and e.kind='reversal' and r.voided_at is not null;

create or replace function public.void_ride(p_group_id uuid,p_request_id uuid,p_ride_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.rides; actor uuid;
begin
  actor := app_private.authorize(p_group_id,true);
  if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'Bitte einen Grund eingeben.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'void',jsonb_build_array(p_ride_id,p_reason)) then return; end if;
  select * into r from public.rides where id=p_ride_id and group_id=p_group_id for update;
  if not found then raise exception 'Fahrt nicht gefunden.'; end if;
  if r.voided_at is not null then return; end if;
  update public.rides set voided_at=now(),void_reason=trim(p_reason),voided_by_member_id=actor where id=r.id;
  insert into public.minute_entries(group_id,member_id,seconds,kind,ride_id,reason,created_by)
    values(p_group_id,r.member_id,r.charged_seconds,'reversal',r.id,trim(p_reason),auth.uid());
end;
$$;
revoke all on function public.void_ride(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.void_ride(uuid,uuid,uuid,text) to authenticated;
commit;
