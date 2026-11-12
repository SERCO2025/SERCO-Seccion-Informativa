-- Extiende la recuperación pública con ID CERCO-INFO y fuentes bibliográficas.
drop function if exists public.search_published_chunks(text, integer);

create function public.search_published_chunks(p_query text,p_limit integer default 8)
returns table(
 chunk_id uuid, article_id uuid, public_id text, slug text, title text,
 version integer, section text, content text, rank real, sources jsonb
)
language sql stable security invoker
set search_path=pg_catalog,public,extensions
as $$
 with normalized_query as (
  select websearch_to_tsquery('spanish'::regconfig,
   extensions.unaccent('extensions.unaccent'::regdictionary,coalesce(trim(p_query),''))) as query
 )
 select c.id,a.id,a.public_id,a.slug,a.title,v.version_number,c.heading,c.content,
  ts_rank_cd(c.search_vector,q.query) as rank,
  coalesce(src.sources,'[]'::jsonb) as sources
 from public.content_chunks c
 join public.article_versions v on v.id=c.article_version_id
 join public.articles a on a.id=v.article_id
  and a.published_version_id=v.id and a.status='published'
 cross join normalized_query q
 left join lateral (
  select jsonb_agg(jsonb_build_object(
   'title',s.title,'source_type',s.source_type,'source_url',s.source_url,
   'author',s.author,'published_date',s.published_date
  ) order by s.created_at) as sources
  from public.article_sources s where s.article_id=a.id
 ) src on true
 where numnode(q.query)>0 and c.search_vector@@q.query
 order by ts_rank_cd(c.search_vector,q.query) desc,c.chunk_index asc
 limit greatest(1,least(coalesce(p_limit,8),8));
$$;

revoke all on function public.search_published_chunks(text,integer) from public,anon,authenticated;
grant execute on function public.search_published_chunks(text,integer) to service_role;
