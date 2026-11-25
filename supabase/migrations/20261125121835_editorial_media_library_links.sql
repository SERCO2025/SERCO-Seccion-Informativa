-- Biblioteca multimedia editorial y asociaciones reutilizables.
-- Los recursos existentes se conservan y quedan no verificados por defecto.
alter table public.media_files
  add column if not exists description text,
  add column if not exists source_url text,
  add column if not exists author text,
  add column if not exists license text,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists category text,
  add column if not exists captured_at date,
  add column if not exists rights_status text not null default 'unverified';

alter table public.media_files
  drop constraint if exists media_files_rights_status_check,
  add constraint media_files_rights_status_check
    check (rights_status in ('unverified','verified','permission_granted','public_domain','restricted')),
  drop constraint if exists media_files_source_url_http,
  add constraint media_files_source_url_http
    check (source_url is null or source_url ~* '^https?://'),
  drop constraint if exists media_files_rights_evidence_required,
  add constraint media_files_rights_evidence_required
    check (
      rights_status not in ('verified','permission_granted','public_domain')
      or (source_url is not null and length(trim(source_url)) > 0
          and license is not null and length(trim(license)) > 0)
    );

create table if not exists public.article_asset_links (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  media_file_id uuid not null references public.media_files(id) on delete restrict,
  section_key text not null default 'body',
  sort_order integer not null default 0,
  alt_text_override text,
  caption text,
  display_mode text not null default 'inline',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_asset_links_section_nonempty check (length(trim(section_key)) > 0),
  constraint article_asset_links_display_mode_check check (display_mode in ('inline','wide','gallery','download')),
  constraint article_asset_links_unique unique (article_id, media_file_id, section_key)
);

create index if not exists article_asset_links_article_order_idx
  on public.article_asset_links(article_id, section_key, sort_order, created_at);
create index if not exists article_asset_links_media_idx
  on public.article_asset_links(media_file_id);

alter table public.media_files enable row level security;
alter table public.article_asset_links enable row level security;

revoke all on public.media_files, public.article_asset_links from public, anon, authenticated;
grant select, insert, update, delete on public.media_files, public.article_asset_links to service_role;
