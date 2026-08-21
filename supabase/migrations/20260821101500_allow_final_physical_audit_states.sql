alter table public.audit_records
  add column if not exists sequence integer not null default 0;

alter table public.audit_records
  drop constraint if exists audit_records_status_check;

alter table public.audit_records
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

alter table public.effective_tag_assignments
  drop constraint if exists effective_tag_assignments_status_check;

alter table public.effective_tag_assignments
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
