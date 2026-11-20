-- When a Revised Map can be started: read-only check. Every row should say ok = true.

select 'the Revised Map guard is on' as item,
       exists (
         select 1 from pg_trigger
         where tgname = 'guard_revised_map' and not tgisinternal
       ) as ok
union all
select 'only Returned maps can have a Revised Map',
       pg_get_functiondef('public.oe_guard_revised_map()'::regprocedure)
         ilike '%REVISED_MAP_NOT_RETURNED%';
