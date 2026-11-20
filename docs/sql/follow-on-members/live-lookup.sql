-- For reference only: do not run.
--
-- The live definition of oe_student_project_for_task, fetched from Supabase on
-- 2026-11-21 with pg_get_functiondef (issue #29). It differs from the copy in
-- docs/sql/follow-on-tasks/apply.sql: the second half also counts a Roster
-- map with no members as belonging to its primary_student_id. That second half
-- is why a new Follow-on copy lost its main student. tests/sql loads this file
-- so the tests run against what production actually does.

CREATE OR REPLACE FUNCTION public.oe_student_project_for_task(p_task_id uuid, p_student_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select found.id
  from (
    select sub.id, sub.submission_number, sub.updated_at
    from public.submission_members sm
    join public.submissions sub on sub.id = sm.submission_id
    where sm.task_id = p_task_id
      and sm.student_id = p_student_id

    union

    select sub.id, sub.submission_number, sub.updated_at
    from public.submissions sub
    where sub.task_id = p_task_id
      and sub.primary_student_id = p_student_id
      and sub.class_name <> 'Guest'
      and not exists (
        select 1 from public.submission_members sm
        where sm.submission_id = sub.id
      )
  ) found
  order by found.submission_number desc, found.updated_at desc
  limit 1;
$function$;
