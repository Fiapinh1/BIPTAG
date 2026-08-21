-- BIPTAG Web V0.3
-- Estrutura cloud para backup/sincronização futura.
-- O modo campo funciona offline no IndexedDB mesmo sem Supabase.

create extension if not exists pgcrypto;

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audits (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  farm_id uuid references public.farms(id) on delete set null,
  farm_name text not null,
  source_file_name text not null,
  status text not null default 'in_progress' check (status in ('draft','active','in_progress','paused','finished')),
  total_tags integer not null default 0,
  total_rows integer not null default 0,
  valid_tags integer not null default 0,
  suspicious_tags integer not null default 0,
  invalid_tags integer not null default 0,
  tag_pattern jsonb,
  linked_tags integer not null default 0,
  issue_count integer not null default 0,
  started_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_activity_at timestamptz not null,
  paused_at timestamptz,
  finished_at timestamptz,
  synced_at timestamptz
);

create table if not exists public.tag_assignments (
  id text primary key,
  audit_id text not null references public.audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence integer not null default 0,
  tag_number text not null,
  function_name text,
  type_name text,
  expected_animal text,
  connected_since text,
  last_detected_at text,
  last_detected_farm text,
  validation_status text not null default 'valid_tag' check (validation_status in ('valid_tag','suspicious_tag','invalid_tag')),
  validation_reason text,
  unique (audit_id, tag_number)
);

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

create table if not exists public.audit_records (
  id text primary key,
  audit_id text not null references public.audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sequence integer not null default 0,
  tag_number text not null,
  expected_animal text,
  observed_animal text,
  effective_animal text,
  status text not null check (status in ('correct','divergence','reassignment','linked','new_tag','new_tag_conflict','possible_swap','audit_conflict','replacement_chain','tag_not_registered','tag_not_found','tag_without_animal','tag_stored','animal_without_ear_tag','animal_not_in_base','unconfirmed','suspicious_tag','possible_typo')),
  field_decision text not null,
  review_status text not null default 'open',
  note text,
  operational_action text check (operational_action in ('keep_tag','remove_tag','replace_tag','register_new_tag','link_tag','swap_tags','move_tag','tag_out_of_use','investigate')),
  action_note text,
  scanned_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'nfc',
  is_current boolean not null default true,
  supersedes_record_id text references public.audit_records(id) on delete set null,
  pair_id text,
  related_record_id text,
  synced_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending','synced','error'))
);

create table if not exists public.import_issues (
  id text primary key,
  audit_id text not null references public.audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  tag_number text,
  animal text,
  detail text not null
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

create index if not exists audits_user_id_idx on public.audits(user_id);
create index if not exists audits_status_idx on public.audits(status);
create index if not exists tag_assignments_audit_tag_idx on public.tag_assignments(audit_id, tag_number);
create index if not exists tag_assignments_audit_animal_idx on public.tag_assignments(audit_id, expected_animal);
create index if not exists effective_tag_assignments_audit_tag_idx on public.effective_tag_assignments(audit_id, tag_number);
create index if not exists effective_tag_assignments_audit_animal_idx on public.effective_tag_assignments(audit_id, effective_animal);
create index if not exists effective_tag_assignments_audit_status_idx on public.effective_tag_assignments(audit_id, status);
create index if not exists audit_records_audit_id_idx on public.audit_records(audit_id);
create index if not exists audit_records_audit_sequence_idx on public.audit_records(audit_id, sequence);
create index if not exists audit_records_tag_number_idx on public.audit_records(tag_number);
create index if not exists audit_records_pair_id_idx on public.audit_records(pair_id);
create index if not exists import_issues_audit_id_idx on public.import_issues(audit_id);
create index if not exists known_issues_audit_id_idx on public.known_issues(audit_id);
create index if not exists known_issues_audit_tag_idx on public.known_issues(audit_id, tag_number);
create index if not exists known_issues_audit_type_idx on public.known_issues(audit_id, type);

alter table public.farms enable row level security;
alter table public.audits enable row level security;
alter table public.tag_assignments enable row level security;
alter table public.effective_tag_assignments enable row level security;
alter table public.audit_records enable row level security;
alter table public.import_issues enable row level security;
alter table public.known_issues enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table
  public.farms,
  public.audits,
  public.tag_assignments,
  public.effective_tag_assignments,
  public.audit_records,
  public.import_issues,
  public.known_issues
to authenticated;

create policy "users_manage_own_farms" on public.farms for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users_manage_own_audits" on public.audits for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users_manage_own_assignments" on public.tag_assignments for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users_manage_own_effective_assignments" on public.effective_tag_assignments for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users_manage_own_records" on public.audit_records for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users_manage_own_import_issues" on public.import_issues for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "users_manage_own_known_issues" on public.known_issues for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);
