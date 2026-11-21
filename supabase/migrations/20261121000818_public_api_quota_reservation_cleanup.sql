-- Finaliza las reservas sin devolver cuota cuando la investigación sí se completó.
-- Las reservas fallidas se eliminan al devolver sus contadores; los registros huérfanos
-- de ejecuciones interrumpidas se limpian después de que su ventana horaria expiró.
create or replace function public.reserve_public_api_quota(
  p_scope text,
  p_client_hash text,
  p_reservation_id uuid
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
  if p_scope is null
     or p_scope not in ('ask', 'research')
     or p_client_hash is null
     or length(p_client_hash) <> 64
     or p_client_hash !~ '^[0-9a-f]{64}$'
     or p_reservation_id is null then
    return false;
  end if;

  delete from private.public_api_rate_limit_reservations
  where created_at < now() - interval '2 hours';

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
    update private.public_api_rate_limits
    set request_count = greatest(request_count - 1, 0), updated_at = now()
    where scope = p_scope and client_hash = p_client_hash and window_start = v_window;
    return false;
  end if;

  insert into private.public_api_rate_limit_reservations
    (reservation_id, scope, client_hash, window_start)
  values
    (p_reservation_id, p_scope, p_client_hash, v_window);

  return true;
end;
$$;

create or replace function public.release_public_api_quota(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation private.public_api_rate_limit_reservations%rowtype;
begin
  if p_reservation_id is null then
    return false;
  end if;

  delete from private.public_api_rate_limit_reservations
  where reservation_id = p_reservation_id and state = 'reserved'
  returning * into v_reservation;

  if not found then
    return false;
  end if;

  update private.public_api_rate_limits
  set request_count = greatest(request_count - 1, 0), updated_at = now()
  where scope = v_reservation.scope
    and client_hash = v_reservation.client_hash
    and window_start = v_reservation.window_start;

  update private.public_api_rate_limits
  set request_count = greatest(request_count - 1, 0), updated_at = now()
  where scope = v_reservation.scope
    and client_hash = 'global'
    and window_start = v_reservation.window_start;

  return true;
end;
$$;

create or replace function public.complete_public_api_quota(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted uuid;
begin
  if p_reservation_id is null then
    return false;
  end if;

  delete from private.public_api_rate_limit_reservations
  where reservation_id = p_reservation_id and state = 'reserved'
  returning reservation_id into v_deleted;

  return found;
end;
$$;

revoke all on function public.reserve_public_api_quota(text, text, uuid) from public, anon, authenticated;
revoke all on function public.release_public_api_quota(uuid) from public, anon, authenticated;
revoke all on function public.complete_public_api_quota(uuid) from public, anon, authenticated;
grant execute on function public.reserve_public_api_quota(text, text, uuid) to service_role;
grant execute on function public.release_public_api_quota(uuid) to service_role;
grant execute on function public.complete_public_api_quota(uuid) to service_role;
