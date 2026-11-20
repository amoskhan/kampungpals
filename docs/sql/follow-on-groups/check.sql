-- Absent students join a Group: read-only check. Every row should say ok = true.

select 'students can list Groups to join' as item,
       has_function_privilege('authenticated', 'public.student_list_follow_on_groups(text,uuid)', 'execute') as ok
union all
select 'students can join a Group',
       has_function_privilege('authenticated', 'public.student_join_follow_on_group(text,uuid,uuid)', 'execute')
union all
select 'a student with no earlier map can''t start blank',
       pg_get_functiondef('public.student_start_follow_on_project(text,uuid,uuid[],boolean)'::regprocedure)
         ilike '%NO_EARLIER_MAP%'
union all
select 'a Guest with no earlier map can''t start blank',
       pg_get_functiondef('public.guest_start_follow_on_project(text,boolean)'::regprocedure)
         ilike '%NO_EARLIER_MAP%'
union all
select 'Follow-on maps still always link the student',
       pg_get_functiondef('public.student_start_follow_on_project(text,uuid,uuid[],boolean)'::regprocedure)
         ilike '%could not be linked to you%';
