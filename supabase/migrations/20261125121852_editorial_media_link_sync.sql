create or replace function public.replace_article_asset_links(p_article_id uuid,p_links jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public
as $$
declare
  v_item jsonb;
  v_rights_status text;
  v_count integer := 0;
begin
  if p_article_id is null or not exists(select 1 from public.articles where id=p_article_id) then
    raise exception 'ARTICLE_NOT_FOUND';
  end if;
  if jsonb_typeof(coalesce(p_links,'[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_ASSET_LINKS';
  end if;

  delete from public.article_asset_links where article_id=p_article_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_links,'[]'::jsonb)) loop
    select rights_status into v_rights_status
    from public.media_files
    where id=(v_item->>'media_file_id')::uuid;

    if v_rights_status is null then raise exception 'MEDIA_FILE_NOT_FOUND'; end if;
    if v_rights_status not in ('verified','permission_granted','public_domain') then
      raise exception 'MEDIA_RIGHTS_NOT_APPROVED';
    end if;

    insert into public.article_asset_links(
      article_id,media_file_id,section_key,sort_order,alt_text_override,caption,display_mode,metadata
    ) values (
      p_article_id,(v_item->>'media_file_id')::uuid,
      coalesce(nullif(trim(v_item->>'section_key'),''),'body'),
      coalesce((v_item->>'sort_order')::integer,0),
      nullif(trim(v_item->>'alt_text_override'),''),
      nullif(trim(v_item->>'caption'),''),
      coalesce(nullif(v_item->>'display_mode',''),'inline'),
      coalesce(v_item->'metadata','{}'::jsonb)
    );
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('article_id',p_article_id,'linked_count',v_count);
end;
$$;
revoke all on function public.replace_article_asset_links(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.replace_article_asset_links(uuid,jsonb) to service_role;
