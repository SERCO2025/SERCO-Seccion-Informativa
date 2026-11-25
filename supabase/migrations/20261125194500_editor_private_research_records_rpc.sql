-- Expose private research dossiers only through a service-role-only RPC.
-- The editor API authenticates the administrator before invoking this function.
create or replace function public.get_article_research_records(p_article_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'article_id', r.article_id,
        'article_version_id', r.article_version_id,
        'research_status', r.research_status,
        'internal_report', r.internal_report,
        'visitor_answer', r.visitor_answer,
        'expanded_answer', r.expanded_answer,
        'claim_evidence', r.claim_evidence,
        'sources_snapshot', r.sources_snapshot,
        'provider_attempts', r.provider_attempts,
        'research_metadata', r.research_metadata,
        'created_at', r.created_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  from private.article_research_records r
  where r.article_id = p_article_id;
$function$;

revoke all on function public.get_article_research_records(uuid) from public, anon, authenticated;
grant execute on function public.get_article_research_records(uuid) to service_role;
