-- SERCO AI: núcleo inicial de publicaciones, versiones y fragmentos recuperables.
-- No modifica las tablas existentes de galería ni de configuración del sitio.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  content_type text not null default 'article',
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'published', 'archived')),
  published_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_slug_nonempty check (length(trim(slug)) > 0),
  constraint articles_title_nonempty check (length(trim(title)) > 0)
);

create table public.article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content_json jsonb not null default '{}'::jsonb,
  search_text text not null default '',
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint article_versions_article_version_unique unique (article_id, version_number)
);

alter table public.articles
  add constraint articles_published_version_fk
  foreign key (published_version_id)
  references public.article_versions(id)
  on delete set null
  deferrable initially deferred;

create table public.content_chunks (
  id uuid primary key default gen_random_uuid(),
  article_version_id uuid not null references public.article_versions(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  heading text,
  content text not null,
  search_vector tsvector not null default ''::tsvector,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint content_chunks_version_index_unique unique (article_version_id, chunk_index),
  constraint content_chunks_content_nonempty check (length(trim(content)) > 0)
);

create index articles_status_published_version_idx
  on public.articles (status, published_version_id);
create index article_versions_article_version_idx
  on public.article_versions (article_id, version_number desc);
create index content_chunks_version_idx
  on public.content_chunks (article_version_id, chunk_index);
create index content_chunks_search_vector_idx
  on public.content_chunks using gin (search_vector);

create or replace function public.set_content_chunk_search_vector()
returns trigger
language plpgsql
set search_path = pg_catalog, public, extensions
as $$
begin
  new.search_vector :=
    to_tsvector(
      'spanish'::regconfig,
      extensions.unaccent(
        'extensions.unaccent'::regdictionary,
        coalesce(new.heading, '') || ' ' || coalesce(new.content, '')
      )
    );
  return new;
end;
$$;

create trigger content_chunks_search_vector_trigger
before insert or update of heading, content
on public.content_chunks
for each row
execute function public.set_content_chunk_search_vector();

create or replace function public.search_published_chunks(
  p_query text,
  p_limit integer default 8
)
returns table (
  chunk_id uuid,
  article_id uuid,
  slug text,
  title text,
  version integer,
  section text,
  content text,
  rank real
)
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  with normalized_query as (
    select websearch_to_tsquery(
      'spanish'::regconfig,
      extensions.unaccent(
        'extensions.unaccent'::regdictionary,
        coalesce(trim(p_query), '')
      )
    ) as query
  )
  select
    c.id as chunk_id,
    a.id as article_id,
    a.slug,
    a.title,
    v.version_number as version,
    c.heading as section,
    c.content,
    ts_rank_cd(c.search_vector, q.query) as rank
  from public.content_chunks c
  join public.article_versions v
    on v.id = c.article_version_id
  join public.articles a
    on a.id = v.article_id
   and a.published_version_id = v.id
   and a.status = 'published'
  cross join normalized_query q
  where numnode(q.query) > 0
    and c.search_vector @@ q.query
  order by ts_rank_cd(c.search_vector, q.query) desc, c.chunk_index asc
  limit greatest(1, least(coalesce(p_limit, 8), 8));
$$;

alter table public.articles enable row level security;
alter table public.article_versions enable row level security;
alter table public.content_chunks enable row level security;

create policy "Public can read published articles"
on public.articles
for select
to anon, authenticated
using (status = 'published');

create policy "Public can read the published article version"
on public.article_versions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.articles a
    where a.id = article_versions.article_id
      and a.status = 'published'
      and a.published_version_id = article_versions.id
  )
);

create policy "Public can read chunks from published versions"
on public.content_chunks
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.article_versions v
    join public.articles a on a.id = v.article_id
    where v.id = content_chunks.article_version_id
      and a.status = 'published'
      and a.published_version_id = v.id
  )
);

grant select on public.articles, public.article_versions, public.content_chunks to service_role;
revoke all on function public.search_published_chunks(text, integer) from public, anon, authenticated;
grant execute on function public.search_published_chunks(text, integer) to service_role;
