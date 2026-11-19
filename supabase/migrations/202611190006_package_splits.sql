-- Bestehende CHF-Listen bleiben gültig. Neue Clients senden Modus und Gewichte.
begin;
create or replace function public.record_topup(p_group_id uuid,p_request_id uuid,p_payer_id uuid,p_minutes integer,
  p_price_rappen bigint,p_purchased_at timestamptz,p_contributions jsonb,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  mode text;
  shares jsonb;
  weight_key text;
  count_rows integer;
  count_members integer;
  divisor numeric;
  r record;
begin
  perform app_private.authorize(p_group_id,true);
  if p_minutes is null or p_minutes not between 1 and 10000000
    or p_price_rappen is null or p_price_rappen not between 1 and 1000000000000
    or p_purchased_at is null or p_purchased_at>now()+interval '5 minutes' then
    raise exception 'Bitte gültige Paketminuten, einen positiven Preis und einen gültigen Kaufzeitpunkt eingeben.';
  end if;
  if not exists(select 1 from public.memberships where id=p_payer_id and group_id=p_group_id and active) then
    raise exception 'Aktives Mitglied nicht gefunden.';
  end if;

  if jsonb_typeof(p_contributions)='array' then
    mode := 'amount';
    shares := p_contributions;
    weight_key := 'amount_rappen';
  else
    mode := p_contributions->>'mode';
    shares := p_contributions->'shares';
    weight_key := 'weight';
    if mode is null or mode not in ('equal','minutes') then raise exception 'Unbekannte Aufteilung.'; end if;
  end if;
  if jsonb_typeof(shares) is distinct from 'array' then raise exception 'Bitte die Teilnehmenden als Liste angeben.'; end if;
  if jsonb_array_length(shares)=0 then raise exception 'Wähle mindestens eine Person aus.'; end if;
  if exists(select 1 from jsonb_array_elements(shares) c where jsonb_typeof(c)<>'object'
    or jsonb_typeof(c->'member_id') is distinct from 'string'
    or jsonb_typeof(c->weight_key) is distinct from 'number' or (c->>weight_key) !~ '^[0-9]+$'
    or (mode='equal' and c->>weight_key <> '1')) then raise exception 'Ungültige Anteile.'; end if;

  select count(*),count(distinct (c->>'member_id')::uuid),sum((c->>weight_key)::numeric)
    into count_rows,count_members,divisor from jsonb_array_elements(shares) c;
  if count_rows<>count_members then raise exception 'Jede Person darf nur einmal teilnehmen.'; end if;
  if exists(select 1 from jsonb_array_elements(shares) c where not exists
    (select 1 from public.memberships m where m.id=(c->>'member_id')::uuid and m.group_id=p_group_id and m.active)) then
    raise exception 'Aktives Mitglied nicht gefunden.';
  end if;
  if mode='amount' and divisor<>p_price_rappen then raise exception 'Die Summe aller Beiträge muss genau dem Paketpreis entsprechen.'; end if;
  if mode='minutes' and divisor<>p_minutes then raise exception 'Der Minutenbedarf muss genau den Paketminuten entsprechen.'; end if;
  if not app_private.claim(p_group_id,p_request_id,'topup',jsonb_build_array(p_payer_id,p_minutes,p_price_rappen,p_purchased_at,p_contributions,p_note)) then return; end if;

  insert into public.packages(id,group_id,payer_id,seconds,price_rappen,purchased_at,note)
    values(p_request_id,p_group_id,p_payer_id,p_minutes::bigint*60,p_price_rappen,p_purchased_at,trim(p_note));
  -- Minuten und Rappen unabhängig aufteilen. Eine bereits gerundete Einheit
  -- taugt bei sehr kleinen Preisen oder Kontingenten nicht als Basis der anderen.
  for r in
    with weights as (
      select (c->>'member_id')::uuid as member_id,(c->>weight_key)::numeric as weight from jsonb_array_elements(shares) c
    ), base as (
      select member_id,div(weight*p_minutes,divisor) as mins,mod(weight*p_minutes,divisor) as min_rest,
        div(weight*p_price_rappen,divisor) as cents,mod(weight*p_price_rappen,divisor) as cent_rest from weights
    )
    select member_id,
      (mins+case when row_number() over(order by min_rest desc,member_id)<=p_minutes-sum(mins) over() then 1 else 0 end)::bigint*60 as seconds,
      (cents+case when row_number() over(order by cent_rest desc,member_id)<=p_price_rappen-sum(cents) over() then 1 else 0 end)::bigint as amount_rappen
    from base
  loop
    insert into public.package_contributions(group_id,package_id,member_id,amount_rappen,allocated_seconds)
      values(p_group_id,p_request_id,r.member_id,r.amount_rappen,r.seconds);
    if r.seconds>0 then
      insert into public.minute_entries(group_id,member_id,seconds,kind,reason,created_by,package_id)
        values(p_group_id,r.member_id,r.seconds,'credit','Anteil am Minutenpaket',auth.uid(),p_request_id);
    end if;
  end loop;
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Die Aufteilung enthält ungültige Werte.';
end;
$$;
commit;
