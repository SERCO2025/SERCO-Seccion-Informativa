alter table public.media_files
  drop constraint if exists media_files_rights_evidence_required,
  add constraint media_files_rights_evidence_required
    check (
      rights_status not in ('verified','permission_granted','public_domain')
      or (
        source_url is not null and length(trim(source_url)) > 0
        and license is not null and length(trim(license)) > 0
        and alt_text is not null and length(trim(alt_text)) > 0
        and description is not null and length(trim(description)) > 0
        and cardinality(keywords) > 0
      )
    );
