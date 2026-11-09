-- Evita que reintentos de un cliente ya limitado consuman la cuota global.
create or replace function public.consume_public_api_quota(
  p_scope text,
  p_client_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', clock_timestamp());
  v_count integer;
  v_client_limit integer;
  v_global_limit integer;
begin
  if p_scope not in ('ask', 'research')
     or p_client_hash is null
     or length(p_client_hash) <> 64
     or p_client_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  if p_scope = 'ask' then
    v_client_limit := 20;
    v_global_limit := 120;
  else
    v_client_limit := 3;
    v_global_limit := 30;
  end if;

  insert into private.public_api_rate_limits
    (scope, client_hash, window_start, request_count)
  values
    (p_scope, p_client_hash, v_window, 1)
  on conflict (scope, client_hash, window_start)
  do update set
    request_count = private.public_api_rate_limits.request_count + 1,
    updated_at = now()
  where private.public_api_rate_limits.request_count < v_client_limit
  returning request_count into v_count;

  if not found then
    return false;
  end if;

  insert into private.public_api_rate_limits
    (scope, client_hash, window_start, request_count)
  values
    (p_scope, 'global', v_window, 1)
  on conflict (scope, client_hash, window_start)
  do update set
    request_count = private.public_api_rate_limits.request_count + 1,
    updated_at = now()
  where private.public_api_rate_limits.request_count < v_global_limit
  returning request_count into v_count;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.consume_public_api_quota(text, text) from public, anon, authenticated;
grant execute on function public.consume_public_api_quota(text, text) to service_role;
