-- Students absent from the earlier lesson join a Group (issue #38,
-- GLOSSARY.md: Follow-on Task, Group).
--
-- A Follow-on Task builds on a finished map, so nobody starts it blank:
--   * a Roster student with no earlier map joins a Group of classmates whose
--     Follow-on map has been started, using the two new functions below;
--   * a Guest with no earlier map can't take part, as a Guest is never in a
--     Group.
-- Students who had a map are unaffected: they still get a copy of it.
--
-- Run after docs/sql/follow-on-members. Run by hand in the Supabase SQL
-- editor, then run check.sql.

begin;


-- ---------------------------------------------------------------
-- 1. No blank start
-- ---------------------------------------------------------------

-- Start (or reopen) a Roster student's Project for a Follow-on Task: a copy
-- of their earlier map, with the same Group.
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
    -- No earlier map (absent from the earlier lesson): join a Group instead.
    raise exception 'NO_EARLIER_MAP'
      using hint = 'You had no map in the earlier Task, so join a Group that has one.';
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


-- A Guest's Follow-on map: a copy of their earlier map on this device.
create or replace function public.guest_start_follow_on_project(
  p_task_code text,
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
begin
  if auth.uid() is null
     or not exists (select 1 from public.guest_profiles gp where gp.auth_uid = auth.uid())
  then
    raise exception 'Guest profile not found.';
  end if;

  select t.* into v_task
  from public.tasks t
  where upper(t.task_code) = upper(trim(p_task_code))
    and t.allow_guests = true
  limit 1;

  if not found then
    raise exception 'Task code not found or guest access is disabled.';
  end if;

  if v_task.follows_on_task_id is null then
    raise exception 'This Task does not follow on from another Task.';
  end if;

  v_existing := public.oe_guest_project_for_task(v_task.id);

  if v_existing is not null then
    return v_existing;
  end if;

  v_earlier_id := public.oe_guest_project_for_task(v_task.follows_on_task_id);

  if v_earlier_id is null then
    -- A Guest is never in a Group, so without an earlier map they can't take part.
    raise exception 'NO_EARLIER_MAP'
      using hint = 'This Task builds on an earlier map you don''t have. Ask your teacher.';
  end if;

  select * into v_earlier
  from public.submissions s
  where s.id = v_earlier_id
  for update;

  perform public.oe_hand_in_earlier_project(v_earlier_id, p_hand_in_earlier);

  insert into public.submissions (
    task_id, teacher_id, student_uid, student_name, class_name, group_name,
    map_data, status, submission_number, copied_from_submission_id
  )
  values (
    v_task.id, v_task.teacher_id, auth.uid(), v_earlier.student_name,
    'Guest', null, v_earlier.map_data, 'draft', 1, v_earlier.id
  )
  returning id into v_new;

  update public.guest_profiles set last_seen_at = now() where auth_uid = auth.uid();

  return v_new;
end;
$function$;


-- ---------------------------------------------------------------
-- 2. Joining a Group
-- ---------------------------------------------------------------

-- The Follow-on maps a student with no earlier map can join: started by
-- classmates, still being drawn. Empty for anyone who had an earlier map or
-- already has a map in this Task.
create or replace function public.student_list_follow_on_groups(
  p_task_code text,
  p_student_id uuid
)
returns table (
  submission_id uuid,
  group_name text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks%rowtype;
begin
  v_task := public.oe_student_follow_on_task(p_task_code, p_student_id);

  if public.oe_student_project_for_task(v_task.follows_on_task_id, p_student_id) is not null
     or public.oe_student_project_for_task(v_task.id, p_student_id) is not null
  then
    return;
  end if;

  return query
  select s.id, coalesce(nullif(s.group_name, ''), s.student_name)
  from public.submissions s
  join public.students me on me.id = p_student_id
  where s.task_id = v_task.id
    and s.class_id = me.class_id
    and s.class_name is distinct from 'Guest'
    and s.status = 'draft'
    and not exists (select 1 from public.submission_reviews r where r.submission_id = s.id)
  order by 2;
end;
$function$;

-- A student with no earlier map joins one of those Groups. Nobody can be
-- removed once added.
create or replace function public.student_join_follow_on_group(
  p_task_code text,
  p_student_id uuid,
  p_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks%rowtype;
begin
  v_task := public.oe_student_follow_on_task(p_task_code, p_student_id);

  perform 1 from public.submissions s where s.id = p_submission_id for update;

  if not exists (
    select 1
    from public.student_list_follow_on_groups(p_task_code, p_student_id) g
    where g.submission_id = p_submission_id
  ) then
    raise exception 'You can''t join this Group. Choose another, or ask your teacher.';
  end if;

  insert into public.submission_members (
    submission_id, task_id, student_id, is_creator, submission_number
  )
  values (p_submission_id, v_task.id, p_student_id, false, 1);

  update public.submissions s
  set group_name = (
    select string_agg(st.student_name, ', ' order by st.register_no nulls last, st.student_name)
    from public.submission_members sm
    join public.students st on st.id = sm.student_id
    where sm.submission_id = p_submission_id
  )
  where s.id = p_submission_id;

  return p_submission_id;
end;
$function$;


-- ---------------------------------------------------------------
-- 3. Who can call what
-- ---------------------------------------------------------------

revoke all on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) from public, anon;
grant execute on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) to authenticated;
revoke all on function public.guest_start_follow_on_project(text, boolean) from public, anon;
grant execute on function public.guest_start_follow_on_project(text, boolean) to authenticated;
revoke all on function public.student_list_follow_on_groups(text, uuid) from public, anon;
grant execute on function public.student_list_follow_on_groups(text, uuid) to authenticated;
revoke all on function public.student_join_follow_on_group(text, uuid, uuid) from public, anon;
grant execute on function public.student_join_follow_on_group(text, uuid, uuid) to authenticated;

commit;
