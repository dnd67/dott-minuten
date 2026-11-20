begin;

create table public.onboarding_features (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_id text not null check (length(feature_id) between 1 and 64),
  primary key (user_id, feature_id)
);

alter table public.onboarding_features enable row level security;
revoke all on table public.onboarding_features from public, anon, authenticated;
grant select, insert on table public.onboarding_features to authenticated;

create policy "Read own tour progress" on public.onboarding_features
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Acknowledge own tour features" on public.onboarding_features
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Only people who could already use the old dashboard know the original tour.
-- An admin-provisioned account awaiting its first login still gets the full tour.
insert into public.onboarding_features (user_id, feature_id)
select u.id, foundation.feature_id
from auth.users u
cross join (values ('minute-pass'), ('appearance')) as foundation(feature_id)
where u.last_sign_in_at is not null
  and exists (select 1 from public.memberships m where m.user_id = u.id);

commit;
