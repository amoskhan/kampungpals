-- Hazards-only Follow-on Tasks: read-only check. The row should say ok = true.

select 'every Follow-on Task is Hazards only' as item,
       not exists (
         select 1 from public.tasks
         where follows_on_task_id is not null
           and coalesce((allowed_tools ->> 'hazards_only')::boolean, false) = false
       ) as ok;
