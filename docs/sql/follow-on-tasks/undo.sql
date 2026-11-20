-- Follow-on Tasks: undo. Restores today's database exactly.
--
-- Projects already started in a Follow-on Task are kept as ordinary Projects
-- of that Task, but lose their link to the map they were copied from, and the
-- Task loses its link to the earlier Task. Run check.sql afterwards: every
-- "exists" row should then say false.

begin;

drop function if exists public.project_task_links(uuid[]);
drop function if exists public.student_add_groupmate(uuid, uuid, uuid);
drop function if exists public.student_list_follow_on_free(text, uuid);
drop function if exists public.guest_start_follow_on_project(text, boolean);
drop function if exists public.student_start_follow_on_project(text, uuid, uuid[], boolean);
drop function if exists public.follow_on_start_info(text, uuid);
drop function if exists public.oe_hand_in_earlier_project(uuid, boolean);
drop function if exists public.oe_student_follow_on_task(text, uuid);
drop function if exists public.oe_guest_project_for_task(uuid);
drop function if exists public.oe_student_project_for_task(uuid, uuid);

drop trigger if exists guard_follow_on_link on public.tasks;
drop function if exists public.oe_guard_follow_on_link();

drop index if exists public.submissions_copied_from_submission_id_idx;
drop index if exists public.tasks_follows_on_task_id_idx;

alter table public.submissions drop column if exists copied_from_submission_id;
alter table public.tasks drop column if exists follows_on_task_id;

commit;
