-- Las tablas de conocimiento solo son consultables desde el backend.
-- Revoca también privilegios heredados de PUBLIC/default privileges del proyecto.
revoke all on table
  public.articles,
  public.article_versions,
  public.content_chunks
from public, anon, authenticated;

grant select on table
  public.articles,
  public.article_versions,
  public.content_chunks
to service_role;

revoke all on function public.set_content_chunk_search_vector() from public, anon, authenticated;
revoke all on function public.search_published_chunks(text, integer) from public, anon, authenticated;
grant execute on function public.search_published_chunks(text, integer) to service_role;
