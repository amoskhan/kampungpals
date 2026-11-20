-- Follow-on Tasks: read-only check. Every row should say ok = true.

select 'tasks.follows_on_task_id exists' as item,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'tasks'
                 and column_name = 'follows_on_task_id') as ok
union all
select 'submissions.copied_from_submission_id exists',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'submissions'
                 and column_name = 'copied_from_submission_id')
union all
select 'guard_follow_on_link trigger exists',
       exists (select 1 from information_schema.triggers
               where trigger_schema = 'public' and trigger_name = 'guard_follow_on_link')
union all
select 'function ' || f || ' exists',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = f)
from unnest(array[
  'follow_on_start_info',
  'student_start_follow_on_project',
  'guest_start_follow_on_project',
  'student_list_follow_on_free',
  'student_add_groupmate',
  'project_task_links'
]) as f
union all
select 'students can call ' || f,
       has_function_privilege('authenticated', p.oid, 'execute')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join lateral (select p.proname::text as f) x
where n.nspname = 'public'
  and p.proname in ('follow_on_start_info', 'student_start_follow_on_project',
                    'guest_start_follow_on_project', 'student_list_follow_on_free',
                    'student_add_groupmate', 'project_task_links')
union all
select 'helper ' || p.proname || ' is not callable by students',
       not has_function_privilege('authenticated', p.oid, 'execute')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('oe_student_project_for_task', 'oe_guest_project_for_task',
                    'oe_student_follow_on_task', 'oe_hand_in_earlier_project')
union all
select 'no Follow-on Task exists yet (nothing has changed for anyone)',
       not exists (select 1 from public.tasks where follows_on_task_id is not null);
