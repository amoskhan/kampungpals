-- Follow-on members: undo. Puts student_start_follow_on_project back as it
-- was (copied from docs/sql/follow-on-tasks/apply.sql)
-- and removes oe_link_follow_on_members. Member records added by apply.sql are
-- kept: each links a student to their own copied map.

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

  -- The same Group, except anyone who somehow already has a Project here.
  insert into public.submission_members (
    submission_id, task_id, student_id, is_creator, submission_number
  )
  select v_new, v_task.id, sm.student_id, sm.is_creator, 1
  from public.submission_members sm
  where sm.submission_id = v_earlier.id
    and public.oe_student_project_for_task(v_task.id, sm.student_id) is null;

  return v_new;
end;
$function$;

revoke all on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) from public, anon;
grant execute on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) to authenticated;

drop function if exists public.oe_link_follow_on_members(uuid);

commit;
