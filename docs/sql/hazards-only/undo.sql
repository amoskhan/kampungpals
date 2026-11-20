-- Hazards-only Follow-on Tasks: undo. Removes the Hazards-only setting from
-- every Task. The Hazard tool is left switched on.

begin;

update public.tasks
set allowed_tools = allowed_tools - 'hazards_only'
where allowed_tools ? 'hazards_only';

commit;
