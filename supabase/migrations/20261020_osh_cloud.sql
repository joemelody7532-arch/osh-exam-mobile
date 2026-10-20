-- 職安勇者 | Supabase Auth + 多裝置學習同步 + 管理者總覽
-- 使用 Supabase SQL Editor 執行一次。只放 public URL/anon key 在網站，絕不可公開 service_role/secret key。
begin;

create schema if not exists private;

create table if not exists public.learner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '職安勇者' check (char_length(display_name) between 1 and 60),
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.learner_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  version bigint not null default 0 check (version>=0),
  updated_at timestamptz not null default now(),
  constraint progress_size_limit check (octet_length(data::text) <= 900000),
  constraint stats_size_limit check (octet_length(stats::text) <= 6000)
);

create index if not exists learner_progress_updated_idx on public.learner_progress(updated_at desc);

create or replace function private.is_learning_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.learner_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'admin'
  )
$$;

revoke all on function private.is_learning_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_learning_admin() to authenticated;

-- Profile rows are created by a trusted trigger; clients cannot self-assign roles.
create or replace function private.create_learner_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.learner_profiles(user_id,display_name,role)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(coalesce(new.email,'學員'),'@',1),'職安勇者'),60),
    'student'
  ) on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_osh_new_learner on auth.users;
create trigger trg_osh_new_learner
  after insert on auth.users
  for each row execute function private.create_learner_profile();

insert into public.learner_profiles(user_id,display_name,role)
select u.id,
  left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),split_part(coalesce(u.email,'學員'),'@',1),'職安勇者'),60),
  'student'
from auth.users u
on conflict(user_id) do nothing;

-- Increment version on every change. Clients use expected version in WHERE.
create or replace function private.bump_learner_progress()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.user_id = old.user_id;
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_osh_progress_version on public.learner_progress;
create trigger trg_osh_progress_version
  before update on public.learner_progress
  for each row execute function private.bump_learner_progress();

alter table public.learner_profiles enable row level security;
alter table public.learner_progress enable row level security;

drop policy if exists "learner_read_profile" on public.learner_profiles;
create policy "learner_read_profile"
  on public.learner_profiles for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_learning_admin()));

drop policy if exists "learner_update_display_name" on public.learner_profiles;
create policy "learner_update_display_name"
  on public.learner_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "learner_read_progress" on public.learner_progress;
create policy "learner_read_progress"
  on public.learner_progress for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_learning_admin()));

drop policy if exists "learner_insert_progress" on public.learner_progress;
create policy "learner_insert_progress"
  on public.learner_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "learner_update_progress" on public.learner_progress;
create policy "learner_update_progress"
  on public.learner_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.learner_profiles from anon,authenticated;
revoke all on public.learner_progress from anon,authenticated;
grant select on public.learner_profiles to authenticated;
grant update(display_name) on public.learner_profiles to authenticated;
grant select on public.learner_progress to authenticated;
grant insert(user_id,data,stats) on public.learner_progress to authenticated;
grant update(data,stats) on public.learner_progress to authenticated;

commit;

-- 管理員必須從可信任的 SQL Editor 手動指定（切勿放到公開網站）：
-- update public.learner_profiles set role='admin'
-- where user_id=(select id from auth.users where email='YOUR_ADMIN_EMAIL' limit 1);
-- 執行前確認 email 對應到正確帳號。帳號尚未註冊時不會有任何列可更新。
