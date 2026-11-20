-- Approved or Returned Reviews: undo. Removes the guard, review_verdict and
-- the verdict column. Every Review's Approved/Returned choice is lost.

begin;

drop trigger if exists guard_review_verdict on public.submission_reviews;
drop function if exists public.oe_guard_review_verdict();
drop function if exists public.review_verdict(uuid);

alter table public.submission_reviews
  drop constraint if exists submission_reviews_verdict_check;

alter table public.submission_reviews
  drop column if exists verdict;

commit;
