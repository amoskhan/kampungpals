-- Follow-on maps that belong to nobody.
--
-- Found on 2026-11-20: a student's Follow-on map was copied from their Revised
-- Map, but no member record was saved with it. Every page that lists or opens
-- a student's maps finds them through their member records, so the student saw
-- an empty list and could not open the map.
--
-- Cause: the live oe_student_project_for_task also counts a map with no
-- members as belonging to its primary_student_id (the repo copy in
-- docs/sql/follow-on-tasks does not). student_start_follow_on_project creates
-- the copy with the earlier map's primary student, then adds the Group except
-- "anyone who already has a map here" using that lookup. The new copy has no
-- members yet, so the lookup finds it for the primary student and they are
-- skipped. A student working alone loses their only member record; in a Group
-- started by another member, only the main student is left out.
--
-- This script checks membership directly instead of through that lookup:
--   1. adds oe_link_follow_on_members: gives a copied Follow-on map any of the
--      students it is missing from the map it was copied from;
--   2. changes student_start_follow_on_project so the whole Group, including
--      the primary student, is copied, the student starting it is always a
--      member, and their unlinked copy is reconnected before a second one
--      could be made;
--   3. reconnects every existing Follow-on map that left out any of its
--      students (unless they have since started another map in that Task).
--
-- Run after docs/sql/follow-on-tasks and docs/sql/follow-on-fixes. Review it,
-- run it by hand in the Supabase SQL editor, then run check.sql. undo.sql puts
-- the functions back (member records it added are kept: they are correct).

begin;


-- ---------------------------------------------------------------
-- 1. Reconnecting a copied map to its students
-- ---------------------------------------------------------------

-- Gives a copied Follow-on map any student it is missing from the map it was
-- copied from, and its main student. Leaves out anyone who is already a member
-- of a map for the Task. A Guest's map and a map that was not copied are left
-- alone. Returns how many students were added.
--
-- A copy can be missing just its main student: when another Group member
-- started it, they were added and the main student was skipped.
create or replace function public.oe_link_follow_on_members(
  p_submission_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.submissions%rowtype;
  v_count integer;
begin
  select * into v_sub
  from public.submissions s
  where s.id = p_submission_id;

  if not found
     or v_sub.copied_from_submission_id is null
     or v_sub.class_name = 'Guest'
  then
    return 0;
  end if;

  insert into public.submission_members (
    submission_id, task_id, student_id, is_creator, submission_number
  )
  select v_sub.id, v_sub.task_id, m.student_id, bool_or(m.is_creator), 1
  from (
    select sm.student_id, sm.is_creator
    from public.submission_members sm
    where sm.submission_id = v_sub.copied_from_submission_id
    union all
    select v_sub.primary_student_id, true
    where v_sub.primary_student_id is not null
  ) m
  join public.students st on st.id = m.student_id
  where not exists (
    select 1 from public.submission_members x
    where x.task_id = v_sub.task_id
      and x.student_id = m.student_id
  )
  group by m.student_id;

  get diagnostics v_count = row_count;

  return v_count;
end;
$function$;


-- ---------------------------------------------------------------
-- 2. Starting a Follow-on Task
-- ---------------------------------------------------------------

-- Start (or reopen) a Roster student's Project for a Follow-on Task.
-- With an earlier Project: a copy of its map, with the same Group.
-- Without one: a blank Project, with Group members who also had none.
create or replace function public.student_start_follow_on_project(
  p_task_code text,
  p_student_id uuid,
  p_member_ids uuid[] default '{}'::uuid[],
  p_hand_in_earlier boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks%rowtype;
  v_earlier public.submissions%rowtype;
  v_earlier_id uuid;
  v_existing uuid;
  v_new uuid;
  v_member_ids uuid[];
begin
  v_task := public.oe_student_follow_on_task(p_task_code, p_student_id);

  -- A copy of this student's map that left them out belongs to them again,
  -- so it is reopened rather than copied a second time.
  perform public.oe_link_follow_on_members(s.id)
  from public.submissions s
  where s.task_id = v_task.id
    and s.copied_from_submission_id is not null
    and (
      s.primary_student_id = p_student_id
      or exists (
        select 1 from public.submission_members sm
        where sm.submission_id = s.copied_from_submission_id
          and sm.student_id = p_student_id
      )
    );

  v_earlier_id := public.oe_student_project_for_task(v_task.follows_on_task_id, p_student_id);

  if v_earlier_id is not null then
    -- One copy per Group: a second member waits here, then joins the first copy.
    select * into v_earlier
    from public.submissions s
    where s.id = v_earlier_id
    for update;
  end if;

  v_existing := public.oe_student_project_for_task(v_task.id, p_student_id);

  if v_existing is not null then
    return v_existing;
  end if;

  if v_earlier_id is null then
    -- Blank start: everyone chosen must also have had no earlier Project.
    select array_agg(distinct m) into v_member_ids
    from unnest(coalesce(p_member_ids, '{}'::uuid[])) as m
    where m <> p_student_id;

    if exists (
      select 1 from unnest(coalesce(v_member_ids, '{}'::uuid[])) as m
      where public.oe_student_project_for_task(v_task.follows_on_task_id, m) is not null
    ) then
      raise exception 'Only classmates who had no map in the earlier Task can join you.';
    end if;

    return public.student_start_group_project(
      p_task_code,
      p_student_id,
      coalesce(v_member_ids, '{}'::uuid[])
    );
  end if;

  perform public.oe_hand_in_earlier_project(v_earlier_id, p_hand_in_earlier);

  insert into public.submissions (
    task_id, teacher_id, student_uid, student_name, class_name, group_name,
    map_data, status, class_id, primary_student_id, submission_number,
    copied_from_submission_id
  )
  values (
    v_task.id, v_task.teacher_id, auth.uid(), v_earlier.student_name,
    v_earlier.class_name, v_earlier.group_name, v_earlier.map_data, 'draft',
    v_earlier.class_id, v_earlier.primary_student_id, 1, v_earlier.id
  )
  returning id into v_new;

  -- The same Group, except anyone who is already a member of a map here.
  -- Checked on member records only: the new copy has none yet, so a lookup
  -- that also matches primary_student_id would wrongly skip its main student.
  insert into public.submission_members (
    submission_id, task_id, student_id, is_creator, submission_number
  )
  select v_new, v_task.id, sm.student_id, sm.is_creator, 1
  from public.submission_members sm
  where sm.submission_id = v_earlier.id
    and not exists (
      select 1 from public.submission_members x
      where x.task_id = v_task.id
        and x.student_id = sm.student_id
    );

  -- The student starting it always belongs to it.
  if not exists (
    select 1 from public.submission_members sm
    where sm.submission_id = v_new
      and sm.student_id = p_student_id
  ) then
    insert into public.submission_members (
      submission_id, task_id, student_id, is_creator, submission_number
    )
    values (v_new, v_task.id, p_student_id, true, 1);
  end if;

  -- Never leave a map nobody can open: fail, and keep nothing, instead.
  if not exists (
    select 1 from public.submission_members sm
    where sm.submission_id = v_new
      and sm.student_id = p_student_id
  ) then
    raise exception 'Your map could not be linked to you. Please try again.';
  end if;

  return v_new;
end;
$function$;


-- ---------------------------------------------------------------
-- 3. Reconnect every Follow-on map that left out any of its students
-- ---------------------------------------------------------------

select public.oe_link_follow_on_members(s.id)
from public.submissions s
where s.copied_from_submission_id is not null
  and s.class_name is distinct from 'Guest';


-- ---------------------------------------------------------------
-- 4. Who can call what
-- ---------------------------------------------------------------

revoke all on function public.oe_link_follow_on_members(uuid) from public, anon, authenticated;
revoke all on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) from public, anon;
grant execute on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) to authenticated;

commit;
