alter table public.article_assets
  add column if not exists rights_status text not null default 'unverified';

alter table public.article_assets
  drop constraint if exists article_assets_rights_status_check,
  add constraint article_assets_rights_status_check
    check (rights_status in ('unverified','verified','permission_granted','public_domain','restricted')),
  drop constraint if exists article_assets_rights_evidence_required,
  add constraint article_assets_rights_evidence_required
    check (
      rights_status not in ('verified','permission_granted','public_domain')
      or (
        source_url is not null and length(trim(source_url)) > 0
        and license is not null and length(trim(license)) > 0
        and alt_text is not null and length(trim(alt_text)) > 0
        and description is not null and length(trim(description)) > 0
        and cardinality(keywords) > 0
      )
    );

create or replace function public.sync_article_asset_rights_status()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  v_status := coalesce(
    nullif(new.metadata->>'rights_status',''),
    case when tg_op = 'UPDATE' then new.rights_status else 'unverified' end,
    'unverified'
  );
  if v_status not in ('unverified','verified','permission_granted','public_domain','restricted') then
    raise exception 'INVALID_ARTICLE_ASSET_RIGHTS_STATUS';
  end if;
  if v_status in ('verified','permission_granted','public_domain') and (
    new.source_url is null or length(trim(new.source_url)) = 0
    or new.license is null or length(trim(new.license)) = 0
    or new.alt_text is null or length(trim(new.alt_text)) = 0
    or new.description is null or length(trim(new.description)) = 0
    or cardinality(new.keywords) = 0
  ) then
    raise exception 'ARTICLE_ASSET_RIGHTS_EVIDENCE_REQUIRED';
  end if;
  new.rights_status := v_status;
  return new;
end;
$$;

revoke all on function public.sync_article_asset_rights_status() from public, anon, authenticated;

drop trigger if exists article_assets_sync_rights_status on public.article_assets;
create trigger article_assets_sync_rights_status
before insert or update of metadata, source_url, license, alt_text, description, keywords, rights_status
on public.article_assets
for each row execute function public.sync_article_asset_rights_status();
