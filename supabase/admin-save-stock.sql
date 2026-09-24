-- Narrow stock/concurrency update. Does not deploy or alter any Edge Function.
-- CREATE OR REPLACE preserves the existing service_role-only execute grants.
CREATE OR REPLACE FUNCTION public.kapparos_save_admin_state(p_sales jsonb, p_settings jsonb, p_deleted_sale_ids jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare
  current_sales jsonb; current_settings jsonb; current_updated_at timestamptz;
  merged_sales jsonb; merged_settings jsonb; assigned_sales jsonb := '[]'::jsonb;
  context jsonb := p_settings->'_kapparosWrite';
  item jsonb; previous_sale jsonb; expected jsonb; candidate jsonb;
  sale_id text; setting_key text; ticket text; error_code text; error_message text;
  allocation numeric; sold numeric; saved_at timestamptz := clock_timestamp();
begin
  -- Admin and online checkout lock this SAME row before reading stock or writing.
  select coalesce(sales, '[]'::jsonb), coalesce(settings, '{}'::jsonb), updated_at
    into current_sales, current_settings, current_updated_at
    from public.kapparos_app_state where id = 'main' for update;
  if not found then raise exception 'Application state was not found'; end if;

  if jsonb_typeof(coalesce(p_sales, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_deleted_sale_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid sale data';
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) s
      group by s->>'id' having count(*) > 1 or coalesce(s->>'id', '') = '') then
    raise exception 'Invalid or duplicate sale ID';
  end if;

  if context->>'version' = '1' then
    -- Bases are compared inside the lock. A stale edit cannot undo a completion,
    -- overwrite another device, or recreate a sale deleted on another device.
    for sale_id in
      select s->>'id' from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) s
      union select value from jsonb_array_elements_text(coalesce(p_deleted_sale_ids, '[]'::jsonb))
    loop
      select s into previous_sale from jsonb_array_elements(current_sales) s where s->>'id' = sale_id;
      select s into candidate from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) s where s->>'id' = sale_id;
      expected := context->'saleBases'->sale_id;
      if expected is null or (nullif(expected, 'null'::jsonb) is distinct from previous_sale
          and not (candidate is not null and previous_sale is not null and candidate - 'ticketId' = previous_sale - 'ticketId')
          and not (candidate is null and previous_sale is null)) then
        error_code := 'conflict'; error_message := 'This sale changed on another device. Review the latest sale before saving again.';
        exit;
      end if;
    end loop;
    merged_settings := current_settings;
    for setting_key, expected in select key, value from jsonb_each(coalesce(context->'settingsBases', '{}'::jsonb)) loop
      if setting_key in ('username','password','passwordHash','_legacyPassword','_kapparosWrite','_kapparosSaveError') then
        error_code := 'conflict'; error_message := 'Use the protected login settings to change credentials.'; exit;
      end if;
      if p_settings ? setting_key then
        if ((current_settings ? setting_key) is distinct from coalesce((expected->>'present')::boolean, false)
          or (current_settings->setting_key is distinct from case when expected->>'present' = 'true' then expected->'value' else null end))
          and current_settings->setting_key is distinct from p_settings->setting_key then
          error_code := 'conflict'; error_message := 'These settings changed on another device. Review the latest settings before saving again.'; exit;
        end if;
        merged_settings := jsonb_set(merged_settings, array[setting_key], p_settings->setting_key);
      end if;
    end loop;
  else
    -- Existing credential/import calls retain their protected, server-built payload.
    -- Legacy clients still pass through the locked stock check below.
    merged_settings := coalesce(p_settings, current_settings);
  end if;
  merged_settings := merged_settings - '_kapparosWrite' - '_kapparosSaveError';

  with incoming as (
    select value as sale, ordinality as ord
    from jsonb_array_elements(coalesce(p_sales, '[]'::jsonb)) with ordinality
    where not exists (select 1 from jsonb_array_elements_text(coalesce(p_deleted_sale_ids, '[]'::jsonb)) d(id) where d.id = value->>'id')
  ), preserved as (
    select value as sale, ordinality as ord from jsonb_array_elements(current_sales) with ordinality
    where not exists (select 1 from incoming where incoming.sale->>'id' = value->>'id')
      and not exists (select 1 from jsonb_array_elements_text(coalesce(p_deleted_sale_ids, '[]'::jsonb)) d(id) where d.id = value->>'id')
  ), combined as (
    select sale, 0 as bucket, ord from incoming union all select sale, 1 as bucket, ord from preserved
  ) select coalesce(jsonb_agg(sale order by bucket, ord), '[]'::jsonb) into merged_sales from combined;

  allocation := greatest(0, coalesce(nullif(merged_settings->>'inventory', '')::numeric, 0));
  select coalesce(sum(greatest(0, coalesce(nullif(s->>'quantity', '')::numeric, 0))), 0)
    into sold from jsonb_array_elements(merged_sales) s where coalesce(s->>'status', 'paid') in ('paid', 'treifa', 'dead');
  if sold > allocation then
    error_code := 'inventory'; error_message := 'There are not enough chickens available. Another device may have sold them. Your sale was not saved.';
  end if;
  if error_code is not null then
    -- Compatibility envelope: live sync v25 forwards settings but omits top-level
    -- RPC errors. This error exists ONLY in the response and is never persisted.
    return jsonb_build_object('sales', current_sales,
      'settings', current_settings || jsonb_build_object('_kapparosSaveError', jsonb_build_object('code', error_code, 'message', error_message)),
      'updated_at', current_updated_at);
  end if;

  for item in select value from jsonb_array_elements(merged_sales) loop
    select value into previous_sale from jsonb_array_elements(current_sales) where value->>'id' = item->>'id' limit 1;
    if previous_sale is not null and (previous_sale->>'ticketId') ~ '^([0-9]{6}|[0-9]{10})$' then
      ticket := previous_sale->>'ticketId';
    else
      ticket := public.kapparos_allocate_ticket_id(current_sales || assigned_sales, item->>'ticketId');
    end if;
    assigned_sales := assigned_sales || jsonb_build_array(jsonb_set(item, '{ticketId}', to_jsonb(ticket)));
  end loop;
  update public.kapparos_app_state set sales = assigned_sales, settings = merged_settings, updated_at = saved_at where id = 'main';
  return jsonb_build_object('sales', assigned_sales, 'settings', merged_settings, 'updated_at', saved_at);
end;
$function$;
