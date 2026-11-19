-- Mejora la recuperación pública: conserva la búsqueda estricta cuando funciona
-- y aplica una búsqueda OR de términos relevantes cuando la pregunta completa
-- no produce coincidencias (por ejemplo, preguntas con "cuáles", "qué", etc.).

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
   extensions.unaccent('extensions.unaccent'::regdictionary,coalesce(trim(p_query),''))) as strict_query,
   extensions.unaccent('extensions.unaccent'::regdictionary,coalesce(trim(p_query),'')) as plain_query
 ),
 fallback_terms as (
  select distinct plainto_tsquery('spanish'::regconfig, lower(token))::text as token_query
  from normalized_query q
  cross join lateral regexp_split_to_table(q.plain_query, '[^[:alnum:]]+') as token
  where length(token) >= 3
   and lower(token) not in (
    'que','cual','cuales','como','cuando','donde','quien','quienes',
    'para','por','con','sin','sobre','entre','desde','hasta',
    'una','uno','unos','unas','los','las','del','de','el','la',
    'y','o','u','es','son','ser','esta','estan','este','esa',
    'ese','hay','se','mi','su','sus','me','puede','pueden'
   )
   and plainto_tsquery('spanish'::regconfig, lower(token)) <> ''::tsquery
 ),
 fallback_query as (
  select nullif(string_agg(token_query, ' | '), '')::tsquery as query
  from fallback_terms
 ),
 selected_query as (
  select case
   when exists (
    select 1
    from public.content_chunks c
    join public.article_versions v on v.id=c.article_version_id
    join public.articles a on a.id=v.article_id
     and a.published_version_id=v.id and a.status='published'
    cross join normalized_query q
    where numnode(q.strict_query)>0 and c.search_vector@@q.strict_query
   ) then q.strict_query
   else f.query
  end as query
  from normalized_query q
  cross join fallback_query f
 )
 select c.id,a.id,a.public_id,a.slug,a.title,v.version_number,c.heading,c.content,
  ts_rank_cd(c.search_vector,q.query) as rank,
  coalesce(src.sources,'[]'::jsonb) as sources
 from public.content_chunks c
 join public.article_versions v on v.id=c.article_version_id
 join public.articles a on a.id=v.article_id
  and a.published_version_id=v.id and a.status='published'
 cross join selected_query q
 left join lateral (
  select jsonb_agg(jsonb_build_object(
   'title',s.title,'source_type',s.source_type,'source_url',s.source_url,
   'author',s.author,'published_date',s.published_date
  ) order by s.created_at) as sources
  from public.article_sources s where s.article_id=a.id
 ) src on true
 where q.query is not null and numnode(q.query)>0 and c.search_vector@@q.query
 order by ts_rank_cd(c.search_vector,q.query) desc,c.chunk_index asc
 limit greatest(1,least(coalesce(p_limit,8),8));
$$;

revoke all on function public.search_published_chunks(text,integer) from public,anon,authenticated;
grant execute on function public.search_published_chunks(text,integer) to service_role;
