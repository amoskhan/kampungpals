-- When a Revised Map can be started (GLOSSARY.md: Revised Map, Returned).
--
-- A Revised Map can be started only from a Returned map (issue #36).
-- The rule is checked when the Revised Map is saved, whichever way it is
-- started. Revised Maps that already exist are not touched.
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

  return new;
end;
$function$;

drop trigger if exists guard_revised_map on public.submissions;
create trigger guard_revised_map
  before insert on public.submissions
  for each row execute function public.oe_guard_revised_map();

revoke all on function public.oe_guard_revised_map() from public, anon, authenticated;

commit;
