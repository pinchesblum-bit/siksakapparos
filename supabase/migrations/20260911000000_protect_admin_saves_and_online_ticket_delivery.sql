
create or replace function public.kapparos_save_admin_state(
  p_sales jsonb,
  p_settings jsonb,
  p_deleted_sale_ids jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_sales jsonb;
  merged_sales jsonb;
  saved_at timestamptz := now();
begin
  select coalesce(sales, '[]'::jsonb)
    into current_sales
    from public.kapparos_app_state
    where id = 'main'
    for update;

  if not found then
    raise exception 'Application state was not found';
  end if;

  with incoming as (
    select value as sale, ordinality as ord
    from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) with ordinality
    where not exists (
      select 1 from jsonb_array_elements_text(coalesce(p_deleted_sale_ids, '[]'::jsonb)) d(id)
      where d.id = value->>'id'
    )
  ),
  preserved as (
    select value as sale, ordinality as ord
    from jsonb_array_elements(current_sales) with ordinality
    where not exists (select 1 from incoming where incoming.sale->>'id' = value->>'id')
      and not exists (
        select 1 from jsonb_array_elements_text(coalesce(p_deleted_sale_ids, '[]'::jsonb)) d(id)
        where d.id = value->>'id'
      )
  ),
  combined as (
    select sale, 0 as bucket, ord from incoming
    union all
    select sale, 1 as bucket, ord from preserved
  )
  select coalesce(jsonb_agg(sale order by bucket, ord), '[]'::jsonb)
    into merged_sales
    from combined;

  update public.kapparos_app_state
    set sales = merged_sales,
        settings = coalesce(p_settings, settings),
        updated_at = saved_at
    where id = 'main';

  return jsonb_build_object('sales', merged_sales, 'settings', coalesce(p_settings, '{}'::jsonb), 'updated_at', saved_at);
end;
$$;
revoke all on function public.kapparos_save_admin_state(jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.kapparos_save_admin_state(jsonb,jsonb,jsonb) to service_role;

create table if not exists public.kapparos_ticket_deliveries (
  sale_id text not null,
  channel text not null check (channel in ('email','text')),
  sent_at timestamptz not null default now(),
  primary key (sale_id, channel)
);
alter table public.kapparos_ticket_deliveries enable row level security;
revoke all on table public.kapparos_ticket_deliveries from public, anon, authenticated;
grant select, insert, delete on table public.kapparos_ticket_deliveries to service_role;

create or replace function public.kapparos_create_online_demo_order(
  p_sale jsonb,
  p_order_key text,
  p_token_hash text,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_sales jsonb;
  current_settings jsonb;
  existing_sale jsonb;
  allocation integer;
  sold integer;
  remaining integer;
  expected_price numeric;
begin
  select coalesce(sales, '[]'::jsonb), coalesce(settings, '{}'::jsonb)
    into current_sales, current_settings
    from public.kapparos_app_state
    where id = 'main'
    for update;

  if not found then return jsonb_build_object('ok', false, 'code', 'unavailable'); end if;

  select value into existing_sale
    from jsonb_array_elements(current_sales)
    where value->>'onlineOrderKey' = p_order_key
    limit 1;

  allocation := greatest(0, coalesce(nullif(current_settings->>'inventory', '')::integer, 0));
  select coalesce(sum(greatest(0, coalesce(nullif(value->>'quantity', '')::numeric, 0))), 0)::integer
    into sold from jsonb_array_elements(current_sales)
    where coalesce(value->>'status', 'paid') = 'paid';
  remaining := greatest(0, allocation - sold);

  if existing_sale is not null then
    if existing_sale->>'onlineOrderTokenHash' <> p_token_hash then
      return jsonb_build_object('ok', false, 'code', 'invalid_session');
    end if;
    return jsonb_build_object('ok', true, 'sale', existing_sale, 'remaining', remaining, 'existing', true);
  end if;

  if coalesce((current_settings#>>'{buyingWebsite,orderingEnabled}')::boolean, true) = false then
    return jsonb_build_object('ok', false, 'code', 'closed');
  end if;
  if p_quantity < 1 or p_quantity > least(100, remaining) then
    return jsonb_build_object('ok', false, 'code', 'inventory', 'remaining', remaining);
  end if;

  expected_price := round(p_quantity * greatest(0, coalesce((current_settings->>'defaultPrice')::numeric, 0)), 2);
  if coalesce(nullif(p_sale->>'price', '')::numeric, -1) <> expected_price then
    return jsonb_build_object('ok', false, 'code', 'price_changed', 'unit_price', greatest(0, coalesce((current_settings->>'defaultPrice')::numeric, 0)));
  end if;

  p_sale := jsonb_set(p_sale, '{price}', to_jsonb(expected_price));
  update public.kapparos_app_state
    set sales = current_sales || jsonb_build_array(p_sale), updated_at = now()
    where id = 'main';

  return jsonb_build_object('ok', true, 'sale', p_sale, 'remaining', remaining - p_quantity, 'existing', false);
end;
$$;
revoke all on function public.kapparos_create_online_demo_order(jsonb,text,text,integer) from public, anon, authenticated;
grant execute on function public.kapparos_create_online_demo_order(jsonb,text,text,integer) to service_role;
