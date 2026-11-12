-- Espejo versionado de la migración aplicada en Supabase el 2026-11-12.
-- No elimina ni modifica destructivamente datos editoriales existentes.
create sequence if not exists public.serco_article_public_id_seq start with 1;

alter table public.articles
  add column if not exists public_id text,
  add column if not exists author_name text,
  add column if not exists origin text not null default 'manual',
  add column if not exists specialty text,
  add column if not exists featured boolean not null default false,
  add column if not exists ai_retrieval_enabled boolean not null default true,
  add column if not exists search_metadata jsonb not null default '{}'::jsonb,
  add column if not exists editorial_metadata jsonb not null default '{}'::jsonb;
alter table public.articles alter column public_id set default
  ('CERCO-INFO-' || lpad(nextval('public.serco_article_public_id_seq')::text,6,'0'));
create unique index if not exists articles_public_id_unique on public.articles(public_id) where public_id is not null;

create table if not exists public.categories (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
 parent_id uuid references public.categories(id) on delete set null, description text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint categories_name_nonempty check(length(trim(name))>0)
);
create table if not exists public.article_categories (
 article_id uuid not null references public.articles(id) on delete cascade,
 category_id uuid not null references public.categories(id) on delete cascade,
 is_primary boolean not null default false, created_at timestamptz not null default now(),
 primary key(article_id,category_id)
);
create table if not exists public.tags (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
 created_at timestamptz not null default now(), constraint tags_name_nonempty check(length(trim(name))>0)
);
create table if not exists public.article_tags (
 article_id uuid not null references public.articles(id) on delete cascade,
 tag_id uuid not null references public.tags(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(article_id,tag_id)
);
create table if not exists public.article_sources (
 id uuid primary key default gen_random_uuid(),
 article_id uuid not null references public.articles(id) on delete cascade,
 title text not null, source_type text not null default 'website', source_url text not null,
 author text, published_date date, accessed_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 constraint article_sources_title_nonempty check(length(trim(title))>0),
 constraint article_sources_url_http check(source_url ~* '^https?://')
);
create table if not exists public.article_assets (
 id uuid primary key default gen_random_uuid(),
 article_id uuid not null references public.articles(id) on delete cascade,
 bucket_id text not null default 'serco-publicaciones', storage_path text not null,
 original_name text not null, mime_type text, size_bytes bigint,
 alt_text text not null, description text not null, source_url text, author text,
 license text not null, keywords text[] not null default '{}', category text, captured_at date,
 metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
 constraint article_assets_storage_path_unique unique(bucket_id,storage_path),
 constraint article_assets_alt_nonempty check(length(trim(alt_text))>0),
 constraint article_assets_description_nonempty check(length(trim(description))>0),
 constraint article_assets_license_nonempty check(length(trim(license))>0)
);
create table if not exists public.article_relations (
 article_id uuid not null references public.articles(id) on delete cascade,
 related_article_id uuid not null references public.articles(id) on delete cascade,
 relation_type text not null default 'related', created_at timestamptz not null default now(),
 primary key(article_id,related_article_id,relation_type),
 constraint article_relations_no_self check(article_id<>related_article_id)
);

create index if not exists article_categories_category_idx on public.article_categories(category_id);
create index if not exists article_tags_tag_idx on public.article_tags(tag_id);
create index if not exists article_sources_article_idx on public.article_sources(article_id);
create index if not exists article_assets_article_idx on public.article_assets(article_id);
create index if not exists article_relations_related_idx on public.article_relations(related_article_id);

alter table public.categories enable row level security;
alter table public.article_categories enable row level security;
alter table public.tags enable row level security;
alter table public.article_tags enable row level security;
alter table public.article_sources enable row level security;
alter table public.article_assets enable row level security;
alter table public.article_relations enable row level security;
revoke all on public.categories,public.article_categories,public.tags,public.article_tags,
 public.article_sources,public.article_assets,public.article_relations from public,anon,authenticated;
grant all on public.categories,public.article_categories,public.tags,public.article_tags,
 public.article_sources,public.article_assets,public.article_relations to service_role;
grant usage,select on sequence public.serco_article_public_id_seq to service_role;

insert into storage.buckets(id,name,public,file_size_limit)
values('serco-publicaciones','serco-publicaciones',false,26214400)
on conflict(id) do nothing;

create or replace function public.save_article_bundle(p_article_id uuid,p_document jsonb,p_chunks jsonb)
returns jsonb language plpgsql security invoker
set search_path=pg_catalog,public,extensions
as $$
declare
 v_article_id uuid; v_version_id uuid; v_version_number integer; v_public_id text;
 v_status text; v_category text; v_tag text; v_source jsonb; v_asset jsonb;
 v_relation jsonb; v_chunk jsonb; v_category_id uuid; v_tag_id uuid;
 v_related_id uuid; v_slug text; v_content_json jsonb; v_search_text text;
begin
 if jsonb_typeof(p_document)<>'object' then raise exception 'INVALID_DOCUMENT: Se esperaba un documento JSON.'; end if;
 if length(trim(coalesce(p_document->>'title','')))<5 then raise exception 'VALIDATION: El título debe contener al menos 5 caracteres.'; end if;
 if length(trim(coalesce(p_document->>'summary','')))<30 then raise exception 'VALIDATION: El resumen ejecutivo debe contener al menos 30 caracteres.'; end if;
 if length(trim(coalesce(p_document->>'content_text','')))<80 then raise exception 'VALIDATION: El contenido íntegro debe contener al menos 80 caracteres.'; end if;
 if length(trim(coalesce(p_document->>'author_name','')))=0 then raise exception 'VALIDATION: Falta el responsable editorial.'; end if;
 if length(trim(coalesce(p_document->>'specialty','')))=0 then raise exception 'VALIDATION: Falta la especialidad principal.'; end if;
 if jsonb_typeof(coalesce(p_document->'categories','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_document->'categories','[]'::jsonb))=0 then raise exception 'VALIDATION: Agrega al menos una categoría.'; end if;
 if jsonb_typeof(coalesce(p_document->'sources','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_document->'sources','[]'::jsonb))=0 then raise exception 'VALIDATION: Agrega al menos una fuente.'; end if;
 if jsonb_typeof(coalesce(p_chunks,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_chunks,'[]'::jsonb))=0 then raise exception 'VALIDATION: No se generaron fragmentos de búsqueda.'; end if;
 v_status:=coalesce(p_document->>'status','draft');
 if v_status not in('draft','review','approved','published','archived') then raise exception 'VALIDATION: Estado editorial no válido.'; end if;
 v_slug:=trim(both '-' from regexp_replace(lower(extensions.unaccent(coalesce(p_document->>'slug',p_document->>'title'))),'[^a-z0-9]+','-','g'));
 if v_slug='' then raise exception 'VALIDATION: No se pudo generar el slug.'; end if;
 v_content_json:=p_document-'sources'-'categories'-'tags'-'assets'-'relations';
 v_search_text:=coalesce(p_document->>'content_text','');

 if p_article_id is null then
  insert into public.articles(slug,title,summary,content_type,status,author_name,origin,specialty,featured,ai_retrieval_enabled,search_metadata,editorial_metadata)
  values(v_slug,trim(p_document->>'title'),trim(p_document->>'summary'),coalesce(p_document->>'content_type','article'),v_status,
   trim(p_document->>'author_name'),coalesce(p_document->>'origin','manual'),trim(p_document->>'specialty'),
   coalesce((p_document->>'featured')::boolean,false),coalesce((p_document->>'ai_retrieval_enabled')::boolean,true),
   coalesce(p_document->'search_metadata','{}'::jsonb),coalesce(p_document->'editorial_metadata','{}'::jsonb))
  returning id,public_id into v_article_id,v_public_id;
  v_version_number:=1;
 else
  select id,public_id into v_article_id,v_public_id from public.articles where id=p_article_id for update;
  if v_article_id is null then raise exception 'NOT_FOUND: La publicación solicitada no existe.'; end if;
  select coalesce(max(version_number),0)+1 into v_version_number from public.article_versions where article_id=v_article_id;
  update public.articles set slug=v_slug,title=trim(p_document->>'title'),summary=trim(p_document->>'summary'),
   content_type=coalesce(p_document->>'content_type','article'),status=v_status,author_name=trim(p_document->>'author_name'),
   origin=coalesce(p_document->>'origin','manual'),specialty=trim(p_document->>'specialty'),
   featured=coalesce((p_document->>'featured')::boolean,false),
   ai_retrieval_enabled=coalesce((p_document->>'ai_retrieval_enabled')::boolean,true),
   search_metadata=coalesce(p_document->'search_metadata','{}'::jsonb),
   editorial_metadata=coalesce(p_document->'editorial_metadata','{}'::jsonb),updated_at=now()
   where id=v_article_id;
 end if;

 insert into public.article_versions(article_id,version_number,content_json,search_text,change_summary,created_by)
 values(v_article_id,v_version_number,v_content_json,v_search_text,nullif(p_document->>'change_summary',''),nullif(p_document->>'created_by','')::uuid)
 returning id into v_version_id;
 for v_chunk in select value from jsonb_array_elements(p_chunks) loop
  insert into public.content_chunks(article_version_id,chunk_index,heading,content,metadata)
  values(v_version_id,(v_chunk->>'chunk_index')::integer,nullif(v_chunk->>'heading',''),trim(v_chunk->>'content'),coalesce(v_chunk->'metadata','{}'::jsonb));
 end loop;
 if v_status='published' then update public.articles set published_version_id=v_version_id where id=v_article_id; end if;

 delete from public.article_categories where article_id=v_article_id;
 for v_category in select jsonb_array_elements_text(coalesce(p_document->'categories','[]'::jsonb)) loop
  v_slug:=trim(both '-' from regexp_replace(lower(extensions.unaccent(trim(v_category))),'[^a-z0-9]+','-','g'));
  insert into public.categories(name,slug) values(trim(v_category),v_slug)
   on conflict(slug) do update set name=excluded.name,updated_at=now() returning id into v_category_id;
  insert into public.article_categories(article_id,category_id,is_primary)
   values(v_article_id,v_category_id,v_category=p_document->>'specialty') on conflict do nothing;
 end loop;

 delete from public.article_tags where article_id=v_article_id;
 for v_tag in select jsonb_array_elements_text(coalesce(p_document->'tags','[]'::jsonb)) loop
  v_slug:=trim(both '-' from regexp_replace(lower(extensions.unaccent(trim(v_tag))),'[^a-z0-9]+','-','g'));
  insert into public.tags(name,slug) values(trim(v_tag),v_slug)
   on conflict(slug) do update set name=excluded.name returning id into v_tag_id;
  insert into public.article_tags(article_id,tag_id) values(v_article_id,v_tag_id) on conflict do nothing;
 end loop;

 delete from public.article_sources where article_id=v_article_id;
 for v_source in select value from jsonb_array_elements(coalesce(p_document->'sources','[]'::jsonb)) loop
  insert into public.article_sources(article_id,title,source_type,source_url,author,published_date,metadata)
  values(v_article_id,trim(v_source->>'title'),coalesce(v_source->>'source_type','website'),trim(v_source->>'source_url'),
   nullif(v_source->>'author',''),nullif(v_source->>'published_date','')::date,coalesce(v_source->'metadata','{}'::jsonb));
 end loop;

 delete from public.article_assets where article_id=v_article_id;
 for v_asset in select value from jsonb_array_elements(coalesce(p_document->'assets','[]'::jsonb)) loop
  insert into public.article_assets(article_id,bucket_id,storage_path,original_name,mime_type,size_bytes,alt_text,description,source_url,author,license,keywords,category,captured_at,metadata)
  values(v_article_id,coalesce(v_asset->>'bucket_id','serco-publicaciones'),trim(v_asset->>'storage_path'),trim(v_asset->>'original_name'),
   nullif(v_asset->>'mime_type',''),nullif(v_asset->>'size_bytes','')::bigint,trim(v_asset->>'alt_text'),trim(v_asset->>'description'),
   nullif(v_asset->>'source_url',''),nullif(v_asset->>'author',''),trim(v_asset->>'license'),
   array(select jsonb_array_elements_text(coalesce(v_asset->'keywords','[]'::jsonb))),nullif(v_asset->>'category',''),
   nullif(v_asset->>'captured_at','')::date,coalesce(v_asset->'metadata','{}'::jsonb));
 end loop;

 delete from public.article_relations where article_id=v_article_id;
 for v_relation in select value from jsonb_array_elements(coalesce(p_document->'relations','[]'::jsonb)) loop
  select id into v_related_id from public.articles where public_id=v_relation->>'public_id';
  if v_related_id is not null and v_related_id<>v_article_id then
   insert into public.article_relations(article_id,related_article_id,relation_type)
   values(v_article_id,v_related_id,coalesce(v_relation->>'relation_type','related')) on conflict do nothing;
  end if;
 end loop;

 return jsonb_build_object('article_id',v_article_id,'public_id',v_public_id,'version_id',v_version_id,
  'version_number',v_version_number,'status',v_status,
  'published_version_id',(select published_version_id from public.articles where id=v_article_id));
end;
$$;
revoke all on function public.save_article_bundle(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_article_bundle(uuid,jsonb,jsonb) to service_role;
