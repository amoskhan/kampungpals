-- Follow-on Tasks (docs/specs/follow-on-tasks.md, issue #11)
--
-- Additive only: two new columns, one guard trigger and new functions.
-- No existing function is changed, so today's page keeps working.
-- Run in the Supabase SQL Editor as one script. Check with check.sql;
-- undo with undo.sql.

begin;

-- ---------------------------------------------------------------
-- 1. Links
-- ---------------------------------------------------------------

-- The earlier Task a Follow-on Task builds on.
alter table public.tasks
  add column if not exists follows_on_task_id uuid
    references public.tasks (id) on delete set null;

create index if not exists tasks_follows_on_task_id_idx
  on public.tasks (follows_on_task_id);

-- The earlier Project a Follow-on Project was copied from.
-- (parent_submission_id already means "Revised Map of", so it is not reused.)
alter table public.submissions
  add column if not exists copied_from_submission_id uuid
    references public.submissions (id) on delete set null;

create index if not exists submissions_copied_from_submission_id_idx
  on public.submissions (copied_from_submission_id);


-- A Follow-on Task's link is fixed once any Project exists for it.
create or replace function public.oe_guard_follow_on_link()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.follows_on_task_id is distinct from old.follows_on_task_id
     and exists (select 1 from public.submissions s where s.task_id = old.id)
     -- Clearing the link because the earlier Task was deleted is fine.
     and new.follows_on_task_id is not null
  then
    raise exception 'FOLLOW_ON_LINK_FIXED';
  end if;

  if new.follows_on_task_id = new.id then
    raise exception 'A Task cannot follow on from itself.';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_follow_on_link on public.tasks;
create trigger guard_follow_on_link
  before update of follows_on_task_id on public.tasks
  for each row execute function public.oe_guard_follow_on_link();


-- ---------------------------------------------------------------
-- 2. Helpers (not callable by the page)
-- ---------------------------------------------------------------

-- A Roster student's latest Project for a Task (Revised Map first), if any.
create or replace function public.oe_student_project_for_task(
  p_task_id uuid,
  p_student_id uuid
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select sub.id
  from public.submission_members sm
  join public.submissions sub on sub.id = sm.submission_id
  where sm.task_id = p_task_id
    and sm.student_id = p_student_id
  order by sub.submission_number desc, sub.updated_at desc
  limit 1;
$function$;

-- The signed-in Guest's latest Project for a Task (Revised Map first), if any.
create or replace function public.oe_guest_project_for_task(
  p_task_id uuid
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.id
  from public.submissions s
  where s.task_id = p_task_id
    and s.student_uid = auth.uid()
    and s.class_name = 'Guest'
  order by s.submission_number desc, s.updated_at desc
  limit 1;
$function$;

-- The Follow-on Task a signed-in Roster student can open with this code.
create or replace function public.oe_student_follow_on_task(
  p_task_code text,
  p_student_id uuid
)
returns public.tasks
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks%rowtype;
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.student_sessions ss
       where ss.auth_uid = auth.uid()
         and ss.student_id = p_student_id
     )
  then
    raise exception 'Please select your student profile again.';
  end if;

  select t.* into v_task
  from public.tasks t
  join public.task_classes tc on tc.task_id = t.id
  join public.students st on st.class_id = tc.class_id
  where st.id = p_student_id
    and st.active = true
    and upper(t.task_code) = upper(trim(p_task_code))
  limit 1;

  if not found then
    raise exception 'Task code was not found for this class.';
  end if;

  if v_task.follows_on_task_id is null then
    raise exception 'This Task does not follow on from another Task.';
  end if;

  return v_task;
end;
$function$;

-- Hand in a draft earlier Project, the same way a student pressing Hand in does.
create or replace function public.oe_hand_in_earlier_project(
  p_submission_id uuid,
  p_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from public.submissions s
    where s.id = p_submission_id
      and s.status = 'draft'
  ) then
    if not coalesce(p_confirmed, false) then
      raise exception 'EARLIER_PROJECT_NOT_HANDED_IN';
    end if;

    update public.submissions
    set status = 'submitted',
        submitted_at = now(),
        updated_at = now()
    where id = p_submission_id
      and status = 'draft';

    -- Nobody may keep drawing on it.
    delete from public.submission_edit_locks
    where submission_id = p_submission_id;
  end if;
end;
$function$;


-- ---------------------------------------------------------------
-- 3. Starting a Follow-on Task
-- ---------------------------------------------------------------

-- What the page needs before a student starts: does this Task follow on,
-- and does the student (or Guest) have an earlier Project?
-- No rows when the code is unknown or the Task is not a Follow-on Task.
create or replace function public.follow_on_start_info(
  p_task_code text,
  p_student_id uuid default null
)
returns table (
  earlier_task_id uuid,
  earlier_task_title text,
  earlier_submission_id uuid,
  earlier_status text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_task public.tasks%rowtype;
  v_earlier uuid;
begin
  if p_student_id is not null then
    select t.* into v_task
    from public.tasks t
    join public.task_classes tc on tc.task_id = t.id
    join public.students st on st.class_id = tc.class_id
    join public.student_sessions ss on ss.student_id = st.id
    where ss.auth_uid = auth.uid()
      and st.id = p_student_id
      and st.active = true
      and upper(t.task_code) = upper(trim(p_task_code))
    limit 1;

    if not found or v_task.follows_on_task_id is null then
      return;
    end if;

    v_earlier := public.oe_student_project_for_task(v_task.follows_on_task_id, p_student_id);
  else
    select t.* into v_task
    from public.tasks t
    where upper(t.task_code) = upper(trim(p_task_code))
      and t.allow_guests = true
      and exists (select 1 from public.guest_profiles gp where gp.auth_uid = auth.uid())
    limit 1;

    if not found or v_task.follows_on_task_id is null then
      return;
    end if;

    v_earlier := public.oe_guest_project_for_task(v_task.follows_on_task_id);
  end if;

  return query
  select earlier.id, earlier.title, s.id, s.status
  from public.tasks earlier
  left join public.submissions s on s.id = v_earlier
  where earlier.id = v_task.follows_on_task_id;
end;
$function$;


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


-- Start (or reopen) a Guest's Project for a Follow-on Task. A Guest's earlier
-- Project is found only through the same Guest identity (same device).
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


-- ---------------------------------------------------------------
-- 4. Groups in a Follow-on Task
-- ---------------------------------------------------------------

-- Classmates who had no Project in the earlier Task and have none yet for
-- this one: the only students who can join a Group in a Follow-on Task.
create or replace function public.student_list_follow_on_free(
  p_task_code text,
  p_student_id uuid
)
returns table (
  student_id uuid,
  register_no integer,
  student_name text
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

  return query
  select st.id, st.register_no, st.student_name
  from public.students st
  join public.students me on me.id = p_student_id
  where st.class_id = me.class_id
    and st.active = true
    and st.id <> p_student_id
    and public.oe_student_project_for_task(v_task.follows_on_task_id, st.id) is null
    and public.oe_student_project_for_task(v_task.id, st.id) is null
  order by st.register_no nulls last, st.student_name;
end;
$function$;


-- A Group member adds a classmate who missed the earlier Task. Nobody can be
-- removed.
create or replace function public.student_add_groupmate(
  p_submission_id uuid,
  p_student_id uuid,
  p_new_member_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sub public.submissions%rowtype;
  v_task public.tasks%rowtype;
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.student_sessions ss
       join public.submission_members sm on sm.student_id = ss.student_id
       where ss.auth_uid = auth.uid()
         and ss.student_id = p_student_id
         and sm.submission_id = p_submission_id
     )
  then
    raise exception 'You are not a member of this project.';
  end if;

  select * into v_sub
  from public.submissions s
  where s.id = p_submission_id
  for update;

  select * into v_task from public.tasks t where t.id = v_sub.task_id;

  if v_task.follows_on_task_id is null then
    raise exception 'Groupmates can only be added in a Follow-on Task.';
  end if;

  if v_sub.status <> 'draft'
     or exists (select 1 from public.submission_reviews r where r.submission_id = v_sub.id)
  then
    raise exception 'PROJECT_HANDED_IN';
  end if;

  if not exists (
    select 1
    from public.students st
    join public.students me on me.id = p_student_id
    where st.id = p_new_member_id
      and st.class_id = me.class_id
      and st.active = true
  ) then
    raise exception 'Only a classmate can be added.';
  end if;

  if public.oe_student_project_for_task(v_task.follows_on_task_id, p_new_member_id) is not null then
    raise exception 'This classmate already has a map from the earlier Task.';
  end if;

  if public.oe_student_project_for_task(v_task.id, p_new_member_id) is not null then
    raise exception 'This classmate already has a project for this task.';
  end if;

  insert into public.submission_members (
    submission_id, task_id, student_id, is_creator, submission_number
  )
  values (p_submission_id, v_task.id, p_new_member_id, false, 1);

  update public.submissions s
  set group_name = (
    select string_agg(st.student_name, ', ' order by st.register_no nulls last, st.student_name)
    from public.submission_members sm
    join public.students st on st.id = sm.student_id
    where sm.submission_id = p_submission_id
  )
  where s.id = p_submission_id;
end;
$function$;


-- ---------------------------------------------------------------
-- 5. Links shown to students
-- ---------------------------------------------------------------

-- For each of the caller's Projects: the earlier Project it was copied from,
-- and the Follow-on Task that continues it, if there is one for them.
create or replace function public.project_task_links(
  p_submission_ids uuid[]
)
returns table (
  submission_id uuid,
  earlier_task_title text,
  earlier_submission_id uuid,
  next_task_title text,
  next_task_code text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    s.id,
    earlier_task.title,
    case
      when public.current_auth_can_access_submission(s.copied_from_submission_id)
        then s.copied_from_submission_id
    end,
    next_task.title,
    next_task.task_code
  from public.submissions s
  left join public.submissions earlier on earlier.id = s.copied_from_submission_id
  left join public.tasks earlier_task on earlier_task.id = earlier.task_id
  left join lateral (
    select t.title, t.task_code
    from public.tasks t
    where t.follows_on_task_id = s.task_id
      and (
        (s.class_name = 'Guest' and t.allow_guests = true)
        or exists (
          select 1
          from public.task_classes tc
          join public.students st on st.class_id = tc.class_id
          join public.student_sessions ss on ss.student_id = st.id
          where tc.task_id = t.id
            and ss.auth_uid = auth.uid()
        )
      )
    order by t.created_at desc
    limit 1
  ) next_task on true
  where s.id = any(p_submission_ids)
    and public.current_auth_can_access_submission(s.id);
$function$;


-- ---------------------------------------------------------------
-- 6. Who may call what
-- ---------------------------------------------------------------

revoke all on function public.oe_guard_follow_on_link() from public, anon, authenticated;
revoke all on function public.oe_student_project_for_task(uuid, uuid) from public, anon, authenticated;
revoke all on function public.oe_guest_project_for_task(uuid) from public, anon, authenticated;
revoke all on function public.oe_student_follow_on_task(text, uuid) from public, anon, authenticated;
revoke all on function public.oe_hand_in_earlier_project(uuid, boolean) from public, anon, authenticated;

revoke all on function public.follow_on_start_info(text, uuid) from public, anon;
revoke all on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) from public, anon;
revoke all on function public.guest_start_follow_on_project(text, boolean) from public, anon;
revoke all on function public.student_list_follow_on_free(text, uuid) from public, anon;
revoke all on function public.student_add_groupmate(uuid, uuid, uuid) from public, anon;
revoke all on function public.project_task_links(uuid[]) from public, anon;

grant execute on function public.follow_on_start_info(text, uuid) to authenticated;
grant execute on function public.student_start_follow_on_project(text, uuid, uuid[], boolean) to authenticated;
grant execute on function public.guest_start_follow_on_project(text, boolean) to authenticated;
grant execute on function public.student_list_follow_on_free(text, uuid) to authenticated;
grant execute on function public.student_add_groupmate(uuid, uuid, uuid) to authenticated;
grant execute on function public.project_task_links(uuid[]) to authenticated;

commit;
