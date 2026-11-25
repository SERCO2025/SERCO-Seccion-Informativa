-- Protect all legacy media whose rights have not been verified.
-- The audit found no article_asset_links, legacy article_assets, or article-version URLs
-- referencing this bucket, so changing visibility does not break current publications.
update storage.buckets
set public = false
where id = 'serco-media';

drop policy if exists "public can read serco media" on storage.objects;

drop policy if exists "public can read media files" on public.media_files;
create policy "public can read approved media files"
on public.media_files
for select
to anon, authenticated
using (rights_status in ('verified', 'permission_granted', 'public_domain'));
