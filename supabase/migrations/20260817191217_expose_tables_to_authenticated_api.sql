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
