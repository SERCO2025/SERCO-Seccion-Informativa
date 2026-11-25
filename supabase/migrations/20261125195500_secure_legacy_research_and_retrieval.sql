-- Keep legacy internal reports private and prevent disabled knowledge entries from retrieval.
alter table private.article_research_records
  add column if not exists internal_report_html text not null default '';

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
    internal_report_html,
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
    coalesce(v_record ->> 'internal_report_html', ''),
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
    internal_report_html = excluded.internal_report_html,
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

alter table private.article_research_records
  drop constraint if exists article_research_records_research_status_check;

alter table private.article_research_records
  add constraint article_research_records_research_status_check
  check (research_status in ('completed', 'sources_only', 'legacy_report_only'));

-- Preserve the two legacy review dossiers before replacing their public-version bodies.
insert into private.article_research_records (
  article_id,
  article_version_id,
  research_status,
  internal_report,
  internal_report_html,
  visitor_answer,
  expanded_answer,
  claim_evidence,
  sources_snapshot,
  provider_attempts,
  research_metadata
)
select
  a.id,
  v.id,
  'legacy_report_only',
  coalesce(v.content_json ->> 'content_text', ''),
  coalesce(v.content_json ->> 'content_html', ''),
  '',
  '',
  coalesce(a.editorial_metadata -> 'claim_evidence_index' -> 'items', '[]'::jsonb),
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'title', s.title,
        'source_type', s.source_type,
        'source_url', s.source_url,
        'author', s.author,
        'published_date', s.published_date,
        'metadata', s.metadata
      )
      order by
        case when coalesce(s.metadata ->> 'citation_order', '') ~ '^[0-9]+$'
          then (s.metadata ->> 'citation_order')::integer else null end asc nulls last,
        s.created_at asc,
        s.id asc
    )
    from public.article_sources s
    where s.article_id = a.id
  ), '[]'::jsonb),
  coalesce(a.editorial_metadata -> 'provider_attempts', '[]'::jsonb),
  jsonb_build_object(
    'legacy_migration', true,
    'legacy_title', a.title,
    'original_research_metadata', coalesce(a.editorial_metadata, '{}'::jsonb),
    'original_search_metadata', coalesce(a.search_metadata, '{}'::jsonb),
    'migrated_at', now()
  )
from public.articles a
join public.article_versions v on v.article_id = a.id
where a.origin = 'ai_research'
  and a.status = 'review'
  and length(trim(coalesce(v.content_json ->> 'content_text', ''))) >= 80
  and not exists (
    select 1
    from private.article_research_records r
    where r.article_version_id = v.id
  );

-- Remove the legacy internal report from every public-facing field while retaining it privately.
update public.article_versions v
set
  content_json = jsonb_set(
    jsonb_set(
      v.content_json - '_research_private' - 'internalReport' - 'visitorAnswer' - 'expandedAnswer',
      '{content_html}',
      to_jsonb('<h2>Expediente interno resguardado</h2><p>El informe detallado de esta investigación se conserva en el expediente interno del editor. Esta versión todavía no contiene una respuesta pública aprobada.</p>'::text),
      true
    ),
    '{content_text}',
    to_jsonb('El informe detallado de esta investigación se conserva en el expediente interno del editor. Esta versión todavía no contiene una respuesta pública aprobada.'::text),
    true
  ),
  search_text = 'Investigación heredada pendiente de revisión editorial. El informe original se conserva en el expediente privado.'
where exists (
  select 1
  from private.article_research_records r
  where r.article_version_id = v.id
    and r.research_status = 'legacy_report_only'
);

delete from public.content_chunks c
using private.article_research_records r
where c.article_version_id = r.article_version_id
  and r.research_status = 'legacy_report_only';

update public.articles a
set
  ai_retrieval_enabled = false,
  editorial_metadata = (coalesce(a.editorial_metadata, '{}'::jsonb) - 'claim_evidence_index' - 'provider_attempts')
    || jsonb_build_object('research_status', 'legacy_report_only', 'synthesis_completed', false),
  updated_at = now()
where exists (
  select 1
  from private.article_research_records r
  where r.article_id = a.id
    and r.research_status = 'legacy_report_only'
);

create or replace function public.search_published_chunks(p_query text, p_limit integer default 8)
returns table(
  chunk_id uuid,
  article_id uuid,
  public_id text,
  slug text,
  title text,
  version integer,
  section text,
  content text,
  rank real,
  sources jsonb
)
language sql
stable
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
 with normalized_query as (
  select websearch_to_tsquery('spanish'::regconfig,
   extensions.unaccent('extensions.unaccent'::regdictionary,coalesce(trim(p_query),''))) as strict_query,
   extensions.unaccent('extensions.unaccent'::regdictionary,coalesce(trim(p_query),'')) as plain_query
 ),
 fallback_terms as (
  select distinct plainto_tsquery('spanish'::regconfig, lower(token)) as token_query
  from normalized_query q
  cross join lateral regexp_split_to_table(q.plain_query, '[^[:alnum:]]+') as token
  where length(token) >= 3
   and lower(token) not in (
    'que','cual','cuales','como','cuando','donde','quien','quienes',
    'para','por','con','sin','sobre','entre','desde','hasta',
    'una','uno','unos','unas','los','las','del','de','el','la',
    'y','o','u','es','son','ser','esta','estan','este','esa',
    'ese','hay','mi','su','sus','me','puede','pueden',
    'sirve','sirven','servir','sirviendo','sirvio'
   )
   and plainto_tsquery('spanish'::regconfig, lower(token)) <> ''::tsquery
 ),
 fallback_query as (
  select nullif(string_agg(token_query::text, ' | '), '')::tsquery as query,
   count(*)::integer as term_count
  from fallback_terms
 ),
 query_choice as (
  select q.strict_query,f.query as fallback_query,f.term_count,
   exists (
    select 1
    from public.content_chunks c
    join public.article_versions v on v.id=c.article_version_id
    join public.articles a on a.id=v.article_id
     and a.published_version_id=v.id
     and a.status='published'
     and a.ai_retrieval_enabled is true
    where f.term_count > 0 and numnode(q.strict_query)>0 and c.search_vector@@q.strict_query
   ) as has_strict_match
  from normalized_query q cross join fallback_query f
 ),
 selected_query as (
  select case when has_strict_match then strict_query else fallback_query end as query,
   not has_strict_match as uses_fallback,
   case when has_strict_match then 0 else least(2,term_count) end as required_match_count
  from query_choice
 )
 select c.id,a.id,a.public_id,a.slug,a.title,v.version_number,c.heading,c.content,
  ts_rank_cd(c.search_vector,q.query) as rank,
  coalesce(src.sources,'[]'::jsonb) as sources
 from public.content_chunks c
 join public.article_versions v on v.id=c.article_version_id
 join public.articles a on a.id=v.article_id
  and a.published_version_id=v.id
  and a.status='published'
  and a.ai_retrieval_enabled is true
 cross join selected_query q
 left join lateral (
  select jsonb_agg(jsonb_build_object(
   'title',s.title,'source_type',s.source_type,'source_url',s.source_url,
   'author',s.author,'published_date',s.published_date,
   'citation_order',case
     when coalesce(s.metadata->>'citation_order','') ~ '^[0-9]+$'
     then (s.metadata->>'citation_order')::integer else null end
  ) order by
   case when coalesce(s.metadata->>'citation_order','') ~ '^[0-9]+$'
     then (s.metadata->>'citation_order')::integer else null end asc nulls last,
   s.created_at asc,s.id asc
  ) as sources
  from public.article_sources s where s.article_id=a.id
 ) src on true
 where q.query is not null and numnode(q.query)>0 and c.search_vector@@q.query
  and (not q.uses_fallback or (
   select count(*) from fallback_terms ft where c.search_vector@@ft.token_query
  ) >= q.required_match_count)
 order by ts_rank_cd(c.search_vector,q.query) desc,c.chunk_index asc
 limit greatest(1,least(coalesce(p_limit,8),8));
$function$;
