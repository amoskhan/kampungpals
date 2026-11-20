-- Hazards-only Follow-on Tasks (issue #35).
--
-- A Follow-on map is for Hazards only: students add and change Hazards, and
-- cannot add to or change the Landmarks and Routes they copied. The page reads
-- this from the Task's tool settings (allowed_tools.hazards_only), which every
-- map in the Task receives, including a Revised Map of a Follow-on map.
-- New Follow-on Tasks get it when created; this marks the ones that already
-- exist. Run by hand in the Supabase SQL editor, then run check.sql.

begin;

update public.tasks
set allowed_tools = coalesce(allowed_tools, '{}'::jsonb)
                    || '{"hazards_only": true, "hazard": true}'::jsonb
where follows_on_task_id is not null
  and coalesce((allowed_tools ->> 'hazards_only')::boolean, false) = false;

commit;
