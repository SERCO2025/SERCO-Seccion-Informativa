-- Índices de soporte para las claves foráneas del núcleo de conocimiento SERCO.
create index if not exists articles_published_version_fk_idx
  on public.articles (published_version_id);

create index if not exists article_versions_created_by_idx
  on public.article_versions (created_by);
