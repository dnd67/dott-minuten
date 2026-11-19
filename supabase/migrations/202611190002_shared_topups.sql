-- Paketkauf, Beiträge und proportionale Minutengutschriften gemeinsam verbuchen.
begin;
alter table public.packages add constraint packages_group_id_unique unique(group_id,id);
alter table public.minute_entries add column package_id uuid;
alter table public.minute_entries add constraint entry_package_fk foreign key(group_id,package_id) references public.packages(group_id,id);
create table public.package_contributions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  package_id uuid not null,
  member_id uuid not null,
  amount_rappen bigint not null check(amount_rappen between 0 and 1000000000000),
  allocated_seconds bigint not null check(allocated_seconds between 0 and 600000000 and allocated_seconds % 60=0),
  created_at timestamptz not null default now(),
  foreign key(group_id,package_id) references public.packages(group_id,id),
  foreign key(group_id,member_id) references public.memberships(group_id,id),
  unique(package_id,member_id)
);
create index contributions_group_idx on public.package_contributions(group_id);
alter table public.package_contributions enable row level security;
create policy contribution_read on public.package_contributions for select to authenticated using(app_private.is_member(group_id));
revoke all on public.package_contributions from public,anon,authenticated;
grant select on public.package_contributions to authenticated;

create function public.record_topup(p_group_id uuid,p_request_id uuid,p_payer_id uuid,p_minutes integer,
  p_price_rappen bigint,p_purchased_at timestamptz,p_contributions jsonb,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare count_rows integer; count_members integer; total numeric; r record;
begin
  perform app_private.authorize(p_group_id,true);
  if p_minutes is null or p_minutes<=0 or p_minutes>10000000 or p_price_rappen is null or p_price_rappen<=0 or p_price_rappen>1000000000000
    or p_purchased_at is null or p_purchased_at>now()+interval '5 minutes' then raise exception 'Bitte gültige Paketminuten, einen positiven Preis und einen gültigen Kaufzeitpunkt eingeben.'; end if;
  if not exists(select 1 from public.memberships where id=p_payer_id and group_id=p_group_id and active) then raise exception 'Aktives Mitglied nicht gefunden.'; end if;
  if p_contributions is null or jsonb_typeof(p_contributions)<>'array' then raise exception 'Bitte die Beiträge als Liste angeben.'; end if;
  if jsonb_array_length(p_contributions)=0 then raise exception 'Bitte mindestens einen Beitrag angeben.'; end if;
  if exists(select 1 from jsonb_array_elements(p_contributions) c where jsonb_typeof(c)<>'object'
    or jsonb_typeof(c->'member_id') is distinct from 'string'
    or jsonb_typeof(c->'amount_rappen') is distinct from 'number'
    or (c->>'amount_rappen') !~ '^[0-9]+$') then raise exception 'Beiträge müssen gültige Mitglieder und ganze, nicht negative Rappenbeträge enthalten.'; end if;
  select count(*),count(distinct member_id),sum(amount_rappen) into count_rows,count_members,total
    from jsonb_to_recordset(p_contributions) as x(member_id uuid,amount_rappen bigint);
  if count_rows<>count_members then raise exception 'Jede Person darf nur einmal beitragen.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_contributions) as x(member_id uuid,amount_rappen bigint)
    where amount_rappen>p_price_rappen or not exists(select 1 from public.memberships m where m.id=x.member_id and m.group_id=p_group_id and m.active)) then raise exception 'Beiträge enthalten eine ungültige Person oder einen ungültigen Betrag.'; end if;
  if total<>p_price_rappen then raise exception 'Die Summe aller Beiträge muss genau dem Paketpreis entsprechen.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'topup',jsonb_build_array(p_payer_id,p_minutes,p_price_rappen,p_purchased_at,p_contributions,p_note)) then return; end if;
  insert into public.packages(id,group_id,payer_id,seconds,price_rappen,purchased_at,note)
    values(p_request_id,p_group_id,p_payer_id,p_minutes::bigint*60,p_price_rappen,p_purchased_at,trim(p_note));
  -- Grösste Reste: Ganze Minuten, gleiche Gesamtsumme, bei Gleichstand stabile Mitglieds-ID.
  for r in
    with base as (
      select member_id,amount_rappen,
        floor(p_minutes::numeric*amount_rappen/p_price_rappen)::bigint as whole,
        mod(p_minutes::numeric*amount_rappen,p_price_rappen) as remainder
      from jsonb_to_recordset(p_contributions) as x(member_id uuid,amount_rappen bigint)
    )
    select member_id,amount_rappen,
      (whole+case when row_number() over(order by remainder desc,member_id)<=(p_minutes-sum(whole) over()) then 1 else 0 end)*60 as seconds
      from base
  loop
    insert into public.package_contributions(group_id,package_id,member_id,amount_rappen,allocated_seconds)
      values(p_group_id,p_request_id,r.member_id,r.amount_rappen,r.seconds);
    if r.seconds>0 then
      insert into public.minute_entries(group_id,member_id,seconds,kind,reason,created_by,package_id)
        values(p_group_id,r.member_id,r.seconds,'credit','Anteil am Minutenpaket',auth.uid(),p_request_id);
    end if;
  end loop;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Die Beitragsliste enthält ungültige Werte.';
end;
$$;
revoke all on function public.record_topup(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,text) from public,anon;
grant execute on function public.record_topup(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,text) to authenticated;

create or replace function public.get_dashboard(p_group_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'group',jsonb_build_object('id',g.id,'name',g.name),
    'members',(select coalesce(jsonb_agg(m order by m.created_at),'[]'::jsonb) from public.memberships m where m.group_id=g.id),
    'rides',(select coalesce(jsonb_agg(r order by r.occurred_at desc),'[]'::jsonb) from public.rides r where r.group_id=g.id),
    'entries',(select coalesce(jsonb_agg(e order by e.created_at desc),'[]'::jsonb) from public.minute_entries e where e.group_id=g.id),
    'packages',(select coalesce(jsonb_agg(p order by p.purchased_at desc),'[]'::jsonb) from public.packages p where p.group_id=g.id),
    'contributions',(select coalesce(jsonb_agg(c order by c.created_at,c.id),'[]'::jsonb) from public.package_contributions c where c.group_id=g.id)
  ) from public.groups g where g.id=p_group_id;
$$;
revoke all on function public.get_dashboard(uuid) from public,anon;
grant execute on function public.get_dashboard(uuid) to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.package_contributions;
  end if;
end; $$;
commit;
