CREATE OR REPLACE FUNCTION public.kapparos_create_online_demo_order(p_sale jsonb, p_order_key text, p_token_hash text, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  p_sale := jsonb_set(p_sale, '{ticketId}', to_jsonb(public.kapparos_allocate_ticket_id(current_sales, p_sale->>'ticketId')));
  update public.kapparos_app_state
    set sales = current_sales || jsonb_build_array(p_sale), updated_at = now()
    where id = 'main';

  return jsonb_build_object('ok', true, 'sale', p_sale, 'remaining', remaining - p_quantity, 'existing', false);
end;
$function$

