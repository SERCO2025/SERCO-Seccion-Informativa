-- Preserve complete and partial AI research dossiers outside public article versions.
-- The trigger moves the private payload out of article_versions.content_json before it is stored.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.article_research_records (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  article_version_id uuid not null unique references public.article_versions(id) on delete cascade,
  research_status text not null check (research_status in ('completed', 'sources_only')),
  internal_report text not null default '',
  visitor_answer text not null default '',
  expanded_answer text not null default '',
  claim_evidence jsonb not null default '[]'::jsonb,
  sources_snapshot jsonb not null default '[]'::jsonb,
  provider_attempts jsonb not null default '[]'::jsonb,
  research_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.article_research_records enable row level security;
revoke all on table private.article_research_records from public, anon, authenticated;
grant select, insert, update, delete on table private.article_research_records to service_role;

create index if not exists article_research_records_article_id_idx
  on private.article_research_records(article_id, created_at desc);

create or replace function private.capture_article_research_record()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_record jsonb;
begin
  v_record := new.content_json -> '_research_private';
  if v_record is null or jsonb_typeof(v_record) <> 'object' then
    return new;
  end if;

  insert into private.article_research_records (
    article_id,
    article_version_id,
    research_status,
    internal_report,
    visitor_answer,
    expanded_answer,
    claim_evidence,
    sources_snapshot,
    provider_attempts,
    research_metadata,
    updated_at
  ) values (
    new.article_id,
    new.id,
    coalesce(nullif(v_record ->> 'research_status', ''), 'sources_only'),
    coalesce(v_record ->> 'internal_report', ''),
    coalesce(v_record ->> 'visitor_answer', ''),
    coalesce(v_record ->> 'expanded_answer', ''),
    coalesce(v_record -> 'claim_evidence', '[]'::jsonb),
    coalesce(v_record -> 'sources_snapshot', '[]'::jsonb),
    coalesce(v_record -> 'provider_attempts', '[]'::jsonb),
    coalesce(v_record -> 'research_metadata', '{}'::jsonb),
    now()
  )
  on conflict (article_version_id) do update set
    research_status = excluded.research_status,
    internal_report = excluded.internal_report,
    visitor_answer = excluded.visitor_answer,
    expanded_answer = excluded.expanded_answer,
    claim_evidence = excluded.claim_evidence,
    sources_snapshot = excluded.sources_snapshot,
    provider_attempts = excluded.provider_attempts,
    research_metadata = excluded.research_metadata,
    updated_at = now();

  new.content_json := new.content_json - '_research_private';
  return new;
end;
$function$;

revoke all on function private.capture_article_research_record() from public, anon, authenticated;

drop trigger if exists capture_private_article_research_record on public.article_versions;
create trigger capture_private_article_research_record
before insert or update of content_json on public.article_versions
for each row
execute function private.capture_article_research_record();
