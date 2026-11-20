-- When a Revised Map can be started: read-only check. Every row should say ok = true.

select 'the Revised Map guard is on' as item,
       exists (
         select 1 from pg_trigger
         where tgname = 'guard_revised_map' and not tgisinternal
       ) as ok
union all
select 'only Returned maps can have a Revised Map',
       pg_get_functiondef('public.oe_guard_revised_map()'::regprocedure)
         ilike '%REVISED_MAP_NOT_RETURNED%'
union all
select 'no Revised Map once a Follow-on Task exists',
       pg_get_functiondef('public.oe_guard_revised_map()'::regprocedure)
         ilike '%FOLLOW_ON_TASK_EXISTS%'
union all
select 'students can call task_has_follow_on',
       has_function_privilege('authenticated', 'public.task_has_follow_on(uuid)', 'execute');
