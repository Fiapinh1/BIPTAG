alter table public.audit_records
  add column if not exists operational_action text,
  add column if not exists action_note text;

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
      'animal_not_in_base',
      'unconfirmed',
      'suspicious_tag',
      'possible_typo'
    )
  );

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
      'investigate'
    )
  );

update public.audit_records
set operational_action = case
  when status = 'correct' then 'keep_tag'
  when status = 'possible_swap' then 'swap_tags'
  when status = 'new_tag' then 'register_new_tag'
  when status in ('linked', 'tag_without_animal') then 'link_tag'
  else 'investigate'
end
where operational_action is null;
