-- Exige trazabilidad y términos de búsqueda para cada archivo multimedia editorial.
alter table public.article_assets
  add constraint article_assets_source_url_http
    check (source_url is not null and source_url ~* '^https?://'),
  add constraint article_assets_keywords_nonempty
    check (cardinality(keywords) > 0);
