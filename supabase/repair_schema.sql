-- BIPTAG - reparo idempotente para bancos Supabase criados antes da V0.3.
-- Rode este arquivo no SQL Editor do Supabase se aparecer erro de coluna/tabela ausente.

create extension if not exists pgcrypto;

alter table if exists public.audits add column if not exists farm_id uuid;
alter table if exists public.audits add column if not exists total_rows integer not null default 0;
alter table if exists public.audits add column if not exists valid_tags integer not null default 0;
alter table if exists public.audits add column if not exists suspicious_tags integer not null default 0;
alter table if exists public.audits add column if not exists invalid_tags integer not null default 0;
alter table if exists public.audits add column if not exists tag_pattern jsonb;
alter table if exists public.audits add column if not exists paused_at timestamptz;
alter table if exists public.audits add column if not exists finished_at timestamptz;
alter table if exists public.audits add column if not exists synced_at timestamptz;

update public.audits
set
  total_rows = case when total_rows = 0 then total_tags else total_rows end,
  valid_tags = case when valid_tags = 0 then total_tags else valid_tags end
where total_tags > 0;

alter table if exists public.tag_assignments add column if not exists sequence integer not null default 0;
alter table if exists public.tag_assignments add column if not exists validation_status text not null default 'valid_tag';
alter table if exists public.tag_assignments add column if not exists validation_reason text;

alter table if exists public.audit_records add column if not exists effective_animal text;
alter table if exists public.audit_records add column if not exists operational_action text;
alter table if exists public.audit_records add column if not exists action_note text;
alter table if exists public.audit_records add column if not exists supersedes_record_id text;
alter table if exists public.audit_records add column if not exists pair_id text;
alter table if exists public.audit_records add column if not exists related_record_id text;
alter table if exists public.audit_records add column if not exists synced_at timestamptz;
alter table if exists public.audit_records add column if not exists sync_status text not null default 'pending';
alter table if exists public.audit_records add column if not exists sequence integer not null default 0;

create table if not exists public.effective_tag_assignments (
  id text primary key,
  audit_id text not null references public.audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_number text not null,
  original_animal text,
  effective_animal text,
  status text not null check (status in ('pending','confirmed','reassigned','linked','new_tag','without_animal','displaced','not_found','suspicious','invalid','unresolved')),
  source_assignment_id text references public.tag_assignments(id) on delete set null,
  current_record_id text,
  related_record_id text,
  updated_at timestamptz not null,
  synced_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending','synced','error')),
  unique (audit_id, tag_number)
);

alter table if exists public.audit_records
  drop constraint if exists audit_records_status_check;

alter table if exists public.audit_records
  add constraint audit_records_status_check
  check (
    status in (
      'correct',
      'divergence',
      'reassignment',
      'linked',
      'new_tag',
      'new_tag_conflict',
      'possible_swap',
      'audit_conflict',
      'replacement_chain',
      'tag_not_registered',
      'tag_not_found',
      'tag_without_animal',
      'tag_stored',
      'animal_without_ear_tag',
      'animal_not_in_base',
      'unconfirmed',
      'suspicious_tag',
      'possible_typo'
    )
  );

alter table if exists public.effective_tag_assignments
  drop constraint if exists effective_tag_assignments_status_check;

alter table if exists public.effective_tag_assignments
  add constraint effective_tag_assignments_status_check
  check (
    status in (
      'pending',
      'confirmed',
      'reassigned',
      'linked',
      'new_tag',
      'without_animal',
      'displaced',
      'not_found',
      'suspicious',
      'invalid',
      'unresolved'
    )
  );

create table if not exists public.known_issues (
  id text primary key,
  audit_id text not null references public.audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_number text not null,
  type text not null check (type in ('never_sent_data','stopped_sending','without_linked_animal','reversed_collar','tag_out_of_use','other')),
  note text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending','synced','error')),
  unique (audit_id, tag_number)
);

create index if not exists effective_tag_assignments_audit_tag_idx on public.effective_tag_assignments(audit_id, tag_number);
create index if not exists effective_tag_assignments_audit_animal_idx on public.effective_tag_assignments(audit_id, effective_animal);
create index if not exists effective_tag_assignments_audit_status_idx on public.effective_tag_assignments(audit_id, status);
create index if not exists known_issues_audit_id_idx on public.known_issues(audit_id);
create index if not exists known_issues_audit_tag_idx on public.known_issues(audit_id, tag_number);
create index if not exists known_issues_audit_type_idx on public.known_issues(audit_id, type);

alter table if exists public.farms enable row level security;
alter table if exists public.audits enable row level security;
alter table if exists public.tag_assignments enable row level security;
alter table if exists public.audit_records enable row level security;
alter table if exists public.import_issues enable row level security;
alter table public.effective_tag_assignments enable row level security;
alter table public.known_issues enable row level security;

grant usage on schema public to anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'farms',
    'audits',
    'tag_assignments',
    'effective_tag_assignments',
    'audit_records',
    'import_issues',
    'known_issues'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    end if;
  end loop;
end $$;

drop policy if exists "users_manage_own_effective_assignments" on public.effective_tag_assignments;
create policy "users_manage_own_effective_assignments" on public.effective_tag_assignments for all
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "users_manage_own_known_issues" on public.known_issues;
create policy "users_manage_own_known_issues" on public.known_issues for all
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
