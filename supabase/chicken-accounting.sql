-- Apply with admin-save-stock.sql. Derive supplier cost only from a complete row,
-- including online orders, never from the admin client's changed-sales payload.
CREATE OR REPLACE FUNCTION public.kapparos_chicken_accounting_settings(
  p_sales jsonb, p_settings jsonb, p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
declare
  result jsonb := coalesce(p_settings, '{}'::jsonb);
  expenses jsonb; existing jsonb; expense jsonb; updated_expenses jsonb := '[]'::jsonb;
  expense_id constant text := 'auto-chicken-inventory-cost';
  numeric_pattern constant text := '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$';
  rate_key text; raw_value text; fallback numeric; rate numeric;
  inventory numeric; kosher numeric := 0; invalid numeric := 0; dead numeric := 0; unsold numeric;
  amount numeric; derived_amount numeric; expense_name text; note text; stamp text; inserted boolean := false;
begin
  foreach rate_key in array array['chickenPurchaseCost', 'invalidShechitaCost', 'unsoldChickenCost'] loop
    fallback := case rate_key when 'chickenPurchaseCost' then 13 when 'unsoldChickenCost' then 8 else 0 end;
    raw_value := btrim(result->>rate_key);
    rate := greatest(0, round(case when raw_value ~ numeric_pattern then raw_value::numeric else fallback end, 2));
    result := jsonb_set(result, array[rate_key], to_jsonb(rate));
  end loop;
  raw_value := btrim(result->>'inventory');
  inventory := greatest(0, floor(case when raw_value ~ numeric_pattern then raw_value::numeric else 0 end));
  select coalesce(sum(quantity) filter (where status = 'paid'), 0),
         coalesce(sum(quantity) filter (where status = 'treifa'), 0),
         coalesce(sum(quantity) filter (where status = 'dead'), 0)
    into kosher, invalid, dead
    from (
      select case when coalesce(nullif(s->>'status', ''), 'paid') = 'paid' and s->>'chickenOutcome' = 'invalid'
                  then 'treifa' else coalesce(nullif(s->>'status', ''), 'paid') end as status,
             greatest(0, case when btrim(s->>'quantity') ~ numeric_pattern then (s->>'quantity')::numeric else 0 end) as quantity
      from jsonb_array_elements(case when jsonb_typeof(p_sales) = 'array' then p_sales else '[]'::jsonb end) s
    ) counted;
  unsold := greatest(0, inventory - kosher - invalid - dead);
  derived_amount := round(kosher * (result->>'chickenPurchaseCost')::numeric
                + invalid * (result->>'invalidShechitaCost')::numeric
                + unsold * (result->>'unsoldChickenCost')::numeric, 2);
  raw_value := btrim(result->>'chickenExpenseAmountOverride');
  amount := case when raw_value ~ numeric_pattern then greatest(0, round(raw_value::numeric, 2)) else derived_amount end;
  result := result || jsonb_build_object('chickenCostModelVersion', 1, 'chickenInventoryRecorded', inventory);
  expenses := case when jsonb_typeof(result->'accountingExpenses') = 'array' then result->'accountingExpenses' else '[]'::jsonb end;
  select value into existing from jsonb_array_elements(expenses) where value->>'id' = expense_id limit 1;
  if existing is null and amount = 0 then return result; end if;
  expense_name := coalesce(nullif(btrim(result->>'chickenExpenseName'), ''), 'Chickens');
  note := format('%s paid, %s טריפה, %s unsold, %s טויטע', trim_scale(kosher), trim_scale(invalid), trim_scale(unsold), trim_scale(dead));
  stamp := to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if existing is null then
    existing := jsonb_build_object('id', expense_id, 'name', expense_name, 'amount', amount,
      'date', to_char(p_now at time zone 'UTC', 'YYYY-MM-DD'), 'category', 'Inventory', 'note', note,
      'paid', false, 'createdAt', stamp, 'updatedAt', '',
      'order', (select coalesce(max(case when btrim(e->>'order') ~ numeric_pattern then (e->>'order')::numeric else 0 end), -1) + 1
                from jsonb_array_elements(expenses) e));
  elsif existing->>'name' is distinct from expense_name or existing->'amount' is distinct from to_jsonb(amount)
        or existing->>'note' is distinct from note then
    -- Keep the original expense date, paid status, payment details and ordering.
    existing := existing || jsonb_build_object('name', expense_name, 'amount', amount, 'note', note, 'updatedAt', stamp);
  end if;
  for expense in select value from jsonb_array_elements(expenses) loop
    if expense->>'id' = expense_id then
      if inserted then continue; end if;
      updated_expenses := updated_expenses || jsonb_build_array(existing);
      inserted := true;
    else
      updated_expenses := updated_expenses || jsonb_build_array(expense);
    end if;
  end loop;
  if not inserted then updated_expenses := updated_expenses || jsonb_build_array(existing); end if;
  return jsonb_set(result, '{accountingExpenses}', updated_expenses);
end;
$function$;

CREATE OR REPLACE FUNCTION public.kapparos_refresh_chicken_accounting()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
begin
  if new.id = 'main' then
    new.settings := public.kapparos_chicken_accounting_settings(new.sales, new.settings, clock_timestamp());
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.kapparos_chicken_accounting_settings(jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kapparos_refresh_chicken_accounting() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kapparos_chicken_accounting_settings(jsonb, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.kapparos_refresh_chicken_accounting() TO service_role;

CREATE OR REPLACE TRIGGER kapparos_chicken_accounting
BEFORE INSERT OR UPDATE OF sales, settings ON public.kapparos_app_state
FOR EACH ROW EXECUTE FUNCTION public.kapparos_refresh_chicken_accounting();
