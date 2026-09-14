CREATE OR REPLACE FUNCTION public.kapparos_allocate_ticket_id(p_sales jsonb, p_candidate text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare candidate text := p_candidate; attempt integer := 0;
begin
  if candidate ~ '^[0-9]{6}$' and not exists (
    select 1 from jsonb_array_elements(coalesce(p_sales,'[]'::jsonb)) s where s->>'ticketId'=candidate
  ) then return candidate; end if;
  loop
    candidate := lpad(floor(random()*1000000)::integer::text,6,'0');
    exit when not exists(select 1 from jsonb_array_elements(coalesce(p_sales,'[]'::jsonb)) s where s->>'ticketId'=candidate);
    attempt := attempt + 1;
    if attempt >= 1000 then raise exception 'Ticket number allocation unavailable'; end if;
  end loop;
  return candidate;
end;
$function$

