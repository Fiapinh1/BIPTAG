alter table public.audit_records
  drop constraint if exists audit_records_operational_action_check;

alter table public.audit_records
  add constraint audit_records_operational_action_check
  check (
    operational_action is null
    or operational_action in (
      'keep_tag',
      'remove_tag',
      'replace_tag',
      'register_new_tag',
      'link_tag',
      'swap_tags',
      'move_tag',
      'tag_out_of_use',
      'investigate'
    )
  );

create table if not exists public.known_issues (
  id text primary key,
  audit_id text not null references public.audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_number text not null,
  type text not null check (
    type in (
      'never_sent_data',
      'stopped_sending',
      'without_linked_animal',
      'reversed_collar',
      'tag_out_of_use',
      'other'
    )
  ),
  note text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  synced_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending','synced','error')),
  unique (audit_id, tag_number)
);

create index if not exists known_issues_audit_id_idx on public.known_issues(audit_id);
create index if not exists known_issues_audit_tag_idx on public.known_issues(audit_id, tag_number);
create index if not exists known_issues_audit_type_idx on public.known_issues(audit_id, type);

alter table public.known_issues enable row level security;

drop policy if exists "users_manage_own_known_issues" on public.known_issues;

create policy "users_manage_own_known_issues" on public.known_issues for all
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
