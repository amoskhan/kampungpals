-- Approved or Returned Reviews (issue #33, GLOSSARY.md: Review, Approved,
-- Returned).
--
-- A Review is now either Approved (the map needs no changes) or Returned (a
-- Revised Map is expected). This script:
--   1. adds submission_reviews.verdict, and sets it for every existing Review:
--      Returned if the map already has a Revised Map, otherwise Approved;
--   2. keeps a Review Returned once its Revised Map has been started;
--   3. adds review_verdict, so a student can see which one they got.
--
-- A Review saved by a page from before this change (an old tab still open)
-- has no verdict, so it is saved as Returned: the student can still make a
-- Revised Map, as before. The Teacher can change it afterwards.
--
-- Run by hand in the Supabase SQL editor, then run check.sql.

begin;


-- ---------------------------------------------------------------
-- 1. The verdict
-- ---------------------------------------------------------------

alter table public.submission_reviews
  add column if not exists verdict text;

update public.submission_reviews r
set verdict = case
  when exists (
    select 1 from public.submissions s
    where s.parent_submission_id = r.submission_id
  ) then 'returned'
  else 'approved'
end
where r.verdict is null;

alter table public.submission_reviews
  alter column verdict set default 'returned',
  alter column verdict set not null;

alter table public.submission_reviews
  drop constraint if exists submission_reviews_verdict_check;

alter table public.submission_reviews
  add constraint submission_reviews_verdict_check
  check (verdict in ('approved', 'returned'));


-- ---------------------------------------------------------------
-- 2. Returned stays Returned once a Revised Map is started
-- ---------------------------------------------------------------

create or replace function public.oe_guard_review_verdict()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.verdict = 'approved'
     and (tg_op = 'INSERT' or old.verdict is distinct from 'approved')
     and exists (
       select 1 from public.submissions s
       where s.parent_submission_id = new.submission_id
     )
  then
    raise exception 'REVISED_MAP_STARTED'
      using hint = 'A Revised Map has been started, so this Review stays Returned.';
  end if;

  return new;
end;
$function$;

drop trigger if exists guard_review_verdict on public.submission_reviews;
create trigger guard_review_verdict
  before insert or update of verdict on public.submission_reviews
  for each row execute function public.oe_guard_review_verdict();


-- ---------------------------------------------------------------
-- 3. What a student sees
-- ---------------------------------------------------------------

-- 'approved' or 'returned' for a map the signed-in student or Guest can open
-- and that has a Review; otherwise nothing.
create or replace function public.review_verdict(
  p_submission_id uuid
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.verdict
  from public.submission_reviews r
  where r.submission_id = p_submission_id
    and public.current_auth_can_access_submission(p_submission_id);
$function$;


-- ---------------------------------------------------------------
-- 4. Who can call what
-- ---------------------------------------------------------------

revoke all on function public.oe_guard_review_verdict() from public, anon, authenticated;
revoke all on function public.review_verdict(uuid) from public, anon;
grant execute on function public.review_verdict(uuid) to authenticated;

commit;
