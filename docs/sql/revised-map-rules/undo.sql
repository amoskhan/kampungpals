-- When a Revised Map can be started: undo. Any Reviewed map can have a
-- Revised Map again, even after a Follow-on Task exists, as before.

begin;

drop trigger if exists guard_revised_map on public.submissions;
drop function if exists public.oe_guard_revised_map();
drop function if exists public.task_has_follow_on(uuid);

commit;
