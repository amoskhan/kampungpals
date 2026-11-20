-- Follow-on Task fixes: undo. Removes the two functions.
-- Maps already filled stay filled, with their link to the earlier map.

begin;

drop function if exists public.follow_on_fill_empty_project(uuid);
drop function if exists public.oe_map_is_empty(jsonb);

commit;
