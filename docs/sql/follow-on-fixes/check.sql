-- Follow-on Task fixes: read-only check. Every row should say ok = true.

select 'function follow_on_fill_empty_project exists' as item,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'follow_on_fill_empty_project') as ok
union all
select 'students can call follow_on_fill_empty_project',
       has_function_privilege('authenticated', 'public.follow_on_fill_empty_project(uuid)', 'execute')
union all
select 'helper oe_map_is_empty is not callable by students',
       not has_function_privilege('authenticated', 'public.oe_map_is_empty(jsonb)', 'execute')
union all
select 'an empty map counts as empty',
       public.oe_map_is_empty('{}'::jsonb)
       and public.oe_map_is_empty('{"shapes":[],"routes":[],"hazards":[]}'::jsonb)
union all
select 'a map with a Landmark does not',
       not public.oe_map_is_empty('{"shapes":[{"id":1}],"routes":[],"hazards":[]}'::jsonb);
