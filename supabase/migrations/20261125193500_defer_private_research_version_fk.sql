-- The article-version trigger records private research before the version row is inserted.
-- Defer this FK check until transaction commit so both records are validated atomically.
alter table private.article_research_records
  drop constraint if exists article_research_records_article_version_id_fkey;

alter table private.article_research_records
  add constraint article_research_records_article_version_id_fkey
  foreign key (article_version_id)
  references public.article_versions(id)
  on delete cascade
  deferrable initially deferred;
