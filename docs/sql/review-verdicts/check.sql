-- Approved or Returned Reviews: read-only check. Every row should say ok = true.

select 'every Review is Approved or Returned' as item,
       not exists (
         select 1 from public.submission_reviews
         where verdict is null or verdict not in ('approved', 'returned')
       ) as ok
union all
select 'a map with a Revised Map has a Returned Review',
       not exists (
         select 1
         from public.submission_reviews r
         where r.verdict = 'approved'
           and exists (
             select 1 from public.submissions s
             where s.parent_submission_id = r.submission_id
           )
       )
union all
select 'the Returned guard is on',
       exists (
         select 1 from pg_trigger
         where tgname = 'guard_review_verdict' and not tgisinternal
       )
union all
select 'students can call review_verdict',
       has_function_privilege('authenticated', 'public.review_verdict(uuid)', 'execute');
