/*
Follow-on Tasks: a Task that builds on one earlier Task. Each Group's Project
for it starts as a copy of the map that Group made for the earlier Task.
See docs/specs/follow-on-tasks.md.
*/

// What students do in a Follow-on Task, unless the Teacher writes otherwise.
const FOLLOW_ON_INSTRUCTIONS =
    "Find places on your map that could be dangerous. Mark each one with the Hazard tool (⚠) and say why.";

// "School map" → "School map — Hazards".
function followOnTitle(
    title
) {
    const base =
        String(title || "").trim() ||
        "Untitled Task";

    return `${base} — Hazards`;
}

// Only a lesson-1 Task can have a Follow-on Task, not a Follow-on Task itself.
function canCreateFollowOn(
    task
) {
    return Boolean(task) &&
        !task.follows_on_task_id;
}

/*
The settings a new Follow-on Task starts with: the earlier Task's tools,
Reference Map and Reference Fit on every device, with the Hazard tool on.
The Teacher's own title and instructions, if given, replace the suggestions.
*/
function followOnTaskSettings(
    earlier,
    chosen
) {
    const title =
        String(chosen?.title ?? "").trim();

    return {
        title:
            title ||
            followOnTitle(earlier?.title),
        instructions:
            chosen && chosen.instructions != null
                ? String(chosen.instructions).trim()
                : FOLLOW_ON_INSTRUCTIONS,
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
Who has handed in their map for a Task, for each Class:
  handedInMaps / handedInStudents        — Submitted or Marked
  notHandedIn (names per map) / notHandedInIds / notHandedInStudents — still a draft
  noMap                                  — on the Roster, with no Project ("No map (absent?)")
A student belongs to a map through its Group members or as its main student.
Where a student has more than one map, the newest counts. Guests are never counted.
*/
function handInSummary({
    classes,
    roster,
    projects,
    members
}) {
    const projectById =
        new Map(
            (projects || []).map(
                project => [project.id, project]
            )
        );

    const latestFor =
        new Map();

    const link =
        (studentId, project) => {
            if (!studentId || !project) {
                return;
            }

            const current =
                latestFor.get(studentId);

            if (
                !current ||
                Number(project.submission_number || 1) >
                    Number(current.submission_number || 1)
            ) {
                latestFor.set(studentId, project);
            }
        };

    (members || []).forEach(
        member =>
            link(
                member.student_id,
                projectById.get(member.submission_id)
            )
    );

    (projects || []).forEach(
        project =>
            link(
                project.primary_student_id,
                project
            )
    );

    const byRegister =
        (a, b) =>
            Number(a.register_no || 0) - Number(b.register_no || 0) ||
            String(a.student_name || "").localeCompare(String(b.student_name || ""));

    return (classes || []).map(
        item => {
            const students =
                (roster || [])
                    .filter(student => student.class_id === item.id)
                    .sort(byRegister);

            const handedIn = new Set();
            const notHandedIn = new Map();
            const noMap = [];
            let handedInStudents = 0;
            let notHandedInStudents = 0;

            students.forEach(
                student => {
                    const project =
                        latestFor.get(student.id);

                    if (!project) {
                        noMap.push(student.student_name);
                        return;
                    }

                    if (project.status === "draft") {
                        notHandedInStudents += 1;

                        if (!notHandedIn.has(project.id)) {
                            notHandedIn.set(project.id, []);
                        }

                        notHandedIn.get(project.id).push(student.student_name);
                        return;
                    }

                    handedInStudents += 1;
                    handedIn.add(project.id);
                }
            );

            return {
                classId:
                    item.id,
                className:
                    item.name,
                handedInMaps:
                    handedIn.size,
                handedInStudents,
                notHandedIn:
                    [...notHandedIn.values()],
                // The draft maps, for "Hand in all".
                notHandedInIds:
                    [...notHandedIn.keys()],
                notHandedInStudents,
                noMap
            };
        }
    );
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
        FOLLOW_ON_INSTRUCTIONS,
        followOnTitle,
        canCreateFollowOn,
        followOnTaskSettings,
        handInSummary,
        orderTasksForList,
        isReferenceShared,
        followOnStartStep
    };
}
