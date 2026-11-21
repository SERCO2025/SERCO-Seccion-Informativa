-- Reserva atómica de cuota para investigaciones externas.
-- Permite devolver el intento cuando Tavily/Gemini no completa la investigación.
create table if not exists private.public_api_rate_limit_reservations (
  reservation_id uuid primary key,
  scope text not null check (scope in ('ask', 'research')),
  client_hash text not null check (length(client_hash) = 64 and client_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  state text not null default 'reserved' check (state in ('reserved', 'released')),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

revoke all on table private.public_api_rate_limit_reservations from public, anon, authenticated;
grant all on table private.public_api_rate_limit_reservations to service_role;

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
  if p_scope not in ('ask', 'research')
     or p_client_hash is null
     or length(p_client_hash) <> 64
     or p_client_hash !~ '^[0-9a-f]{64}$'
     or p_reservation_id is null then
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

  select * into v_reservation
  from private.public_api_rate_limit_reservations
  where reservation_id = p_reservation_id
  for update;

  if not found or v_reservation.state <> 'reserved' then
    return false;
  end if;

  update private.public_api_rate_limit_reservations
  set state = 'released', released_at = now()
  where reservation_id = p_reservation_id;

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

revoke all on function public.reserve_public_api_quota(text, text, uuid) from public, anon, authenticated;
revoke all on function public.release_public_api_quota(uuid) from public, anon, authenticated;
grant execute on function public.reserve_public_api_quota(text, text, uuid) to service_role;
grant execute on function public.release_public_api_quota(uuid) to service_role;
