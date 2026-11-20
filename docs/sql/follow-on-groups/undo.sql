-- Absent students join a Group: undo. Students and Guests with no earlier
-- map start a blank map again, as before. The functions are put back as
-- docs/sql/follow-on-members and docs/sql/follow-on-tasks left them.
-- Students who joined a Group stay in it.

begin;

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
    return public.guest_start_project(p_task_code);
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

drop function if exists public.student_join_follow_on_group(text, uuid, uuid);
drop function if exists public.student_list_follow_on_groups(text, uuid);

revoke all on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) from public, anon;
grant execute on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) to authenticated;
revoke all on function public.guest_start_follow_on_project(text, boolean) from public, anon;
grant execute on function public.guest_start_follow_on_project(text, boolean) to authenticated;

commit;
