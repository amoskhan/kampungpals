/*
Follow-on Tasks: a Task that builds on one earlier Task. Each Group's Project
for it starts as a copy of the map that Group made for the earlier Task.
See docs/specs/follow-on-tasks.md.
*/

const FOLLOW_ON_PART =
    /\s+—\s+part\s+(\d+)\s*$/i;

// "School map" → "School map — part 2"; "School map — part 2" → "… — part 3".
function nextFollowOnTitle(
    title
) {
    const base =
        String(title || "").trim() ||
        "Untitled Task";

    const match =
        base.match(FOLLOW_ON_PART);

    if (match) {
        return base.replace(
            FOLLOW_ON_PART,
            ` — part ${Number(match[1]) + 1}`
        );
    }

    return `${base} — part 2`;
}

/*
The settings a new Follow-on Task starts with: the earlier Task's tools,
Reference Map and Reference Fit on every device, with the Hazard tool on.
*/
function followOnTaskSettings(
    earlier
) {
    return {
        title:
            nextFollowOnTitle(earlier?.title),
        instructions:
            "",
        reference_path:
            earlier?.reference_path || null,
        allowed_tools: {
            ...(earlier?.allowed_tools || {}),
            hazard: true
        },
        allow_guests:
            earlier?.allow_guests !== false,
        follows_on_task_id:
            earlier?.id || null
    };
}

/*
The Teacher's Task list, with each Follow-on Task directly under the Task it
follows on from. Tasks keep their given order otherwise; Follow-on Tasks of the
same Task are listed oldest first, so part 2 comes before part 3.
*/
function orderTasksForList(
    tasks
) {
    const list =
        Array.isArray(tasks)
            ? tasks
            : [];

    const ids =
        new Set(
            list.map(task => task.id)
        );

    const children =
        new Map();

    list.forEach(
        task => {
            const parent =
                task.follows_on_task_id;

            if (
                parent &&
                ids.has(parent) &&
                parent !== task.id
            ) {
                if (!children.has(parent)) {
                    children.set(parent, []);
                }

                children.get(parent).push(task);
            }
        }
    );

    children.forEach(
        group =>
            group.sort(
                (a, b) =>
                    String(a.created_at || "").localeCompare(
                        String(b.created_at || "")
                    )
            )
    );

    const ordered = [];
    const placed = new Set();

    const place =
        (task, depth) => {
            if (placed.has(task.id)) {
                return;
            }

            placed.add(task.id);

            ordered.push({
                task,
                depth
            });

            (children.get(task.id) || []).forEach(
                child =>
                    place(child, depth + 1)
            );
        };

    list.forEach(
        task => {
            const parent =
                task.follows_on_task_id;

            if (
                !parent ||
                !ids.has(parent) ||
                parent === task.id
            ) {
                place(task, 0);
            }
        }
    );

    // A loop of links would leave Tasks unplaced; list them rather than lose them.
    list.forEach(
        task =>
            place(task, 0)
    );

    return ordered;
}

// Whether another Task uses the same Reference Map image, so it must be kept.
function isReferenceShared(
    path,
    tasks,
    taskId
) {
    return Boolean(path) &&
        (tasks || []).some(
            task =>
                task.id !== taskId &&
                task.reference_path === path
        );
}

/*
What happens when a student opens a Follow-on Task they have no Project for
yet, from follow_on_start_info:
  "copy"      — start from a copy of their earlier map
  "hand-in"   — their earlier map is still a draft: warn that starting hands it in
  "blank"     — they had no earlier map: choose a Group of others who had none
  null        — not a Follow-on Task
*/
function followOnStartStep(
    info
) {
    if (!info) {
        return null;
    }

    if (!info.earlier_submission_id) {
        return "blank";
    }

    return info.earlier_status === "draft"
        ? "hand-in"
        : "copy";
}

if (
    typeof module !== "undefined"
) {
    module.exports = {
        nextFollowOnTitle,
        followOnTaskSettings,
        orderTasksForList,
        isReferenceShared,
        followOnStartStep
    };
}
