-- Follow-on members: read-only check. Every row should say ok = true.

select 'function oe_link_follow_on_members exists' as item,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'oe_link_follow_on_members') as ok
union all
select 'students cannot call oe_link_follow_on_members',
       not has_function_privilege('authenticated', 'public.oe_link_follow_on_members(uuid)', 'execute')
union all
select 'students can call student_start_follow_on_project',
       has_function_privilege('authenticated', 'public.student_start_follow_on_project(text,uuid,uuid[],boolean)', 'execute')
union all
select 'the start function always links the student',
       pg_get_functiondef('public.student_start_follow_on_project(text,uuid,uuid[],boolean)'::regprocedure)
         ilike '%could not be linked to you%'
union all
select 'every copied Follow-on map (not a Guest''s) has a member',
       not exists (
         select 1 from public.submissions s
         where s.copied_from_submission_id is not null
           and s.class_name is distinct from 'Guest'
           and not exists (
             select 1 from public.submission_members sm where sm.submission_id = s.id
           )
       )
union all
select 'no student is left out of a copy of their own earlier map',
       not exists (
         select 1
         from public.submissions s
         join public.submission_members src
           on src.submission_id = s.copied_from_submission_id
         where s.copied_from_submission_id is not null
           and s.class_name is distinct from 'Guest'
           and not exists (
             select 1 from public.submission_members x
             where x.task_id = s.task_id
               and x.student_id = src.student_id
           )
       );
