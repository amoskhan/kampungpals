-- Follow-on Task fixes: an empty Follow-on map is filled from the student's
-- earlier map when it is opened.
--
-- Run after docs/sql/follow-on-tasks/apply.sql. Review it, run it by hand in
-- the Supabase SQL editor, then run check.sql. undo.sql puts things back.
--
-- It adds two functions and changes none. No table is changed and no
-- existing map is touched until a student opens it.

begin;


-- ---------------------------------------------------------------
-- 1. Helper
-- ---------------------------------------------------------------

-- Whether a saved map has nothing on it: no Landmarks, Routes or Hazards.
create or replace function public.oe_map_is_empty(
  p_map jsonb
)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(
    bool_and(
      jsonb_typeof(p_map -> part) is distinct from 'array'
      or jsonb_array_length(p_map -> part) = 0
    ),
    true
  )
  from unnest(array['shapes', 'routes', 'hazards']) as part;
$function$;


-- ---------------------------------------------------------------
-- 2. Filling an empty Follow-on map
-- ---------------------------------------------------------------

-- When a student opens a Follow-on map that is still empty and was never
-- copied, fill it from their handed-in earlier map, with the earlier Group.
-- Anything already drawn is never replaced. Returns true if it was filled.
create or replace function public.follow_on_fill_empty_project(
  p_submission_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.submissions%rowtype;
  v_follows_on uuid;
  v_earlier public.submissions%rowtype;
  v_earlier_ids uuid[];
begin
  if auth.uid() is null
     or not public.current_auth_can_access_submission(p_submission_id)
  then
    return false;
  end if;

  select * into v_sub
  from public.submissions s
  where s.id = p_submission_id
  for update;

  if not found
     or v_sub.status <> 'draft'
     or v_sub.copied_from_submission_id is not null
     or not public.oe_map_is_empty(v_sub.map_data)
  then
    return false;
  end if;

  select t.follows_on_task_id into v_follows_on
  from public.tasks t
  where t.id = v_sub.task_id;

  if v_follows_on is null then
    return false;
  end if;

  -- The earlier map: the same Guest, or the one every student here shares.
  if v_sub.class_name = 'Guest' then
    select array_agg(e.id order by e.submission_number desc, e.updated_at desc)
    into v_earlier_ids
    from public.submissions e
    where e.task_id = v_follows_on
      and e.student_uid = v_sub.student_uid
      and e.class_name = 'Guest';

    v_earlier_ids := v_earlier_ids[1:1];
  else
    select array_agg(distinct public.oe_student_project_for_task(v_follows_on, m.student_id))
    into v_earlier_ids
    from (
      select sm.student_id from public.submission_members sm
      where sm.submission_id = v_sub.id
      union
      select v_sub.primary_student_id where v_sub.primary_student_id is not null
    ) m;
  end if;

  -- None, or students from different earlier maps: leave it as it is.
  if coalesce(array_length(v_earlier_ids, 1), 0) <> 1
     or v_earlier_ids[1] is null
  then
    return false;
  end if;

  select * into v_earlier
  from public.submissions e
  where e.id = v_earlier_ids[1]
  for update;

  -- A draft earlier map is handed in only by the student choosing to, on start.
  if not found or v_earlier.status = 'draft' then
    return false;
  end if;

  update public.submissions
  set map_data = v_earlier.map_data,
      student_name = v_earlier.student_name,
      group_name = v_earlier.group_name,
      copied_from_submission_id = v_earlier.id,
      updated_at = now()
  where id = v_sub.id;

  -- The rest of the earlier Group, except anyone who already has a map here.
  insert into public.submission_members (
    submission_id, task_id, student_id, is_creator, submission_number
  )
  select v_sub.id, v_sub.task_id, sm.student_id, false, v_sub.submission_number
  from public.submission_members sm
  where sm.submission_id = v_earlier.id
    and public.oe_student_project_for_task(v_sub.task_id, sm.student_id) is null;

  return true;
end;
$function$;


-- ---------------------------------------------------------------
-- 3. Who can call what
-- ---------------------------------------------------------------

revoke all on function public.oe_map_is_empty(jsonb) from public, anon, authenticated;
revoke all on function public.follow_on_fill_empty_project(uuid) from public, anon;
grant execute on function public.follow_on_fill_empty_project(uuid) to authenticated;

commit;
