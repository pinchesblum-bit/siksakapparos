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
begin
  select coalesce(sales, '[]'::jsonb), coalesce(settings, '{}'::jsonb)
    into current_sales, current_settings
    from public.kapparos_app_state
    where id = 'main'
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;

  select value into existing_sale
    from jsonb_array_elements(current_sales)
    where value->>'onlineOrderKey' = p_order_key
    limit 1;

  allocation := greatest(0, coalesce(nullif(current_settings#>>'{buyingWebsite,inventory}', '')::integer, 0));
  select coalesce(sum(greatest(0, coalesce(nullif(value->>'quantity', '')::numeric, 0))), 0)::integer
    into sold
    from jsonb_array_elements(current_sales)
    where coalesce((value->>'isOnlineSale')::boolean, false)
      and coalesce(value->>'status', 'paid') <> 'expired';
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
  if p_quantity < 1 or p_quantity > remaining then
    return jsonb_build_object('ok', false, 'code', 'inventory', 'remaining', remaining);
  end if;

  update public.kapparos_app_state
    set sales = current_sales || jsonb_build_array(p_sale),
        updated_at = now()
    where id = 'main';

  return jsonb_build_object('ok', true, 'sale', p_sale, 'remaining', remaining - p_quantity, 'existing', false);
end;
$$;

revoke all on function public.kapparos_create_online_demo_order(jsonb,text,text,integer) from public, anon, authenticated;
grant execute on function public.kapparos_create_online_demo_order(jsonb,text,text,integer) to service_role;
