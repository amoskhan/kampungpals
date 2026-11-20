-- When a Revised Map can be started: undo. Any Reviewed map can have a
-- Revised Map again, as before.

begin;

drop trigger if exists guard_revised_map on public.submissions;
drop function if exists public.oe_guard_revised_map();

commit;
