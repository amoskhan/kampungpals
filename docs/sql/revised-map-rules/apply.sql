-- When a Revised Map can be started (GLOSSARY.md: Revised Map, Returned).
--
-- A Revised Map can be started only from a Returned map (issue #36), and not
-- once a Follow-on Task has been created from its Task (issue #40), so each
-- student has one clear latest map. The rules are checked when the Revised Map
-- is saved, whichever way it is started. Revised Maps that already exist are
-- not touched. task_has_follow_on lets the page hide the button in time.
--
-- Run after docs/sql/review-verdicts. Run by hand in the Supabase SQL editor,
-- then run check.sql.

begin;

create or replace function public.oe_guard_revised_map()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.parent_submission_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.submission_reviews r
    where r.submission_id = new.parent_submission_id
      and r.verdict = 'returned'
  ) then
    raise exception 'REVISED_MAP_NOT_RETURNED'
      using hint = 'Only a Returned map can have a Revised Map.';
  end if;

  if exists (
    select 1 from public.tasks t
    where t.follows_on_task_id = new.task_id
  ) then
    raise exception 'FOLLOW_ON_TASK_EXISTS'
      using hint = 'The class has moved on to the Follow-on Task.';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_revised_map on public.submissions;
create trigger guard_revised_map
  before insert on public.submissions
  for each row execute function public.oe_guard_revised_map();

-- Whether a Follow-on Task has been created from the Task of a map the
-- signed-in student or Guest can open.
create or replace function public.task_has_follow_on(
  p_submission_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.submissions s
    join public.tasks t on t.follows_on_task_id = s.task_id
    where s.id = p_submission_id
      and public.current_auth_can_access_submission(p_submission_id)
  );
$function$;

revoke all on function public.oe_guard_revised_map() from public, anon, authenticated;
revoke all on function public.task_has_follow_on(uuid) from public, anon;
grant execute on function public.task_has_follow_on(uuid) to authenticated;

commit;
