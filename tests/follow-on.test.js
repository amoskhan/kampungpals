const test = require("node:test");
const assert = require("node:assert/strict");
const {
    followOnTitle,
    FOLLOW_ON_INSTRUCTIONS,
    followOnTaskSettings,
    canCreateFollowOn,
    handInSummary,
    orderTasksForList,
    isReferenceShared,
    followOnStartStep,
    effectiveTools
} = require("../js/follow-on.js");

test("a Follow-on Task is suggested as the Hazards lesson", () => {
    assert.equal(followOnTitle("School map"), "School map — Hazards");
    assert.equal(followOnTitle("  "), "Untitled Task — Hazards");
});

test("only a Task that is not itself a Follow-on Task can have one", () => {
    assert.equal(canCreateFollowOn({ id: "t1", follows_on_task_id: null }), true);
    assert.equal(canCreateFollowOn({ id: "t2", follows_on_task_id: "t1" }), false);
    assert.equal(canCreateFollowOn(null), false);
});

test("the Teacher's own title and instructions are used", () => {
    const settings = followOnTaskSettings(
        { id: "t1", title: "School map" },
        { title: "  Danger spots  ", instructions: "  Mark two Hazards.  " }
    );
    assert.equal(settings.title, "Danger spots");
    assert.equal(settings.instructions, "Mark two Hazards.");

    const blank = followOnTaskSettings({ id: "t1", title: "School map" }, { title: "   ", instructions: "" });
    assert.equal(blank.title, "School map — Hazards", "an empty title falls back to the suggestion");
    assert.equal(blank.instructions, "", "instructions may be left empty");
});

test("a Follow-on Task copies the earlier Task's settings and switches Hazards on", () => {
    const earlier = {
        id: "t1",
        title: "School map",
        instructions: "Draw the school",
        reference_path: "teacher/t1/map.png",
        allow_guests: false,
        allowed_tools: { shapes: true, hazard: false, reference_fits: { iphone: "crop" }, reference_crops: { iphone: { x: 10, y: 20, zoom: 2 } } }
    };
    const settings = followOnTaskSettings(earlier);

    assert.equal(settings.follows_on_task_id, "t1");
    assert.equal(settings.title, "School map — Hazards");
    assert.equal(settings.instructions, FOLLOW_ON_INSTRUCTIONS);
    assert.equal(settings.reference_path, "teacher/t1/map.png");
    assert.equal(settings.allow_guests, false);
    assert.equal(settings.allowed_tools.hazard, true);
    assert.equal(settings.allowed_tools.hazards_only, true);
    assert.equal(settings.allowed_tools.shapes, true);
    assert.deepEqual(settings.allowed_tools.reference_crops, earlier.allowed_tools.reference_crops);
    assert.equal(earlier.allowed_tools.hazard, false, "the earlier Task is not changed");
});

const ids = list => list.map(({ task, depth }) => `${"  ".repeat(depth)}${task.id}`);

test("Follow-on Tasks are listed under the Task they follow on from", () => {
    const tasks = [
        { id: "newest", created_at: "2026-11-05" },
        { id: "part3", follows_on_task_id: "map", created_at: "2026-11-04" },
        { id: "part2", follows_on_task_id: "map", created_at: "2026-11-03" },
        { id: "map", created_at: "2026-11-01" },
        { id: "part2b", follows_on_task_id: "part2", created_at: "2026-11-06" }
    ];

    assert.deepEqual(ids(orderTasksForList(tasks)), ["newest", "map", "  part2", "    part2b", "  part3"]);
});

test("a Follow-on Task whose earlier Task is not in the list stands on its own", () => {
    assert.deepEqual(ids(orderTasksForList([{ id: "a", follows_on_task_id: "gone" }])), ["a"]);
});

test("no Task is lost, even with a loop of links", () => {
    const tasks = [
        { id: "a", follows_on_task_id: "b" },
        { id: "b", follows_on_task_id: "a" },
        { id: "c", follows_on_task_id: "c" }
    ];
    assert.deepEqual(orderTasksForList(tasks).map(({ task }) => task.id).sort(), ["a", "b", "c"]);
});

test("a Reference Map shared with another Task is kept", () => {
    const tasks = [
        { id: "t1", reference_path: "x/t1/map.png" },
        { id: "t2", reference_path: "x/t1/map.png" },
        { id: "t3", reference_path: "x/t3/other.png" }
    ];
    assert.equal(isReferenceShared("x/t1/map.png", tasks, "t2"), true);
    assert.equal(isReferenceShared("x/t3/other.png", tasks, "t3"), false);
    assert.equal(isReferenceShared(null, tasks, "t1"), false);
});

test("what a student sees when starting a Follow-on Task", () => {
    assert.equal(followOnStartStep(undefined), null);
    assert.equal(followOnStartStep({ earlier_submission_id: null }), "blank");
    assert.equal(followOnStartStep({ earlier_submission_id: "p1", earlier_status: "draft" }), "hand-in");
    assert.equal(followOnStartStep({ earlier_submission_id: "p1", earlier_status: "submitted" }), "copy");
});

test("the hand-in summary counts maps and students for each Class", () => {
    const classes = [{ id: "c1", name: "TG1" }, { id: "c2", name: "TG2" }];
    const roster = [
        { id: "amir", student_name: "Amir", class_id: "c1", register_no: 1 },
        { id: "bea", student_name: "Bea", class_id: "c1", register_no: 2 },
        { id: "chen", student_name: "Chen", class_id: "c1", register_no: 3 },
        { id: "dan", student_name: "Dan", class_id: "c1", register_no: 4 },
        { id: "eli", student_name: "Eli", class_id: "c1", register_no: 5 },
        { id: "fay", student_name: "Fay", class_id: "c2", register_no: 1 }
    ];
    const projects = [
        { id: "p1", status: "submitted", class_id: "c1", primary_student_id: "amir", submission_number: 1 },
        { id: "p2", status: "draft", class_id: "c1", primary_student_id: "chen", submission_number: 1 },
        // Linked only through its main student, with no Group member rows.
        { id: "p3", status: "submitted", class_id: "c1", primary_student_id: "dan", submission_number: 1 },
        // A Guest is never counted.
        { id: "g1", status: "submitted", class_id: null, class_name: "Guest", primary_student_id: null, submission_number: 1 }
    ];
    const members = [
        { submission_id: "p1", student_id: "amir" },
        { submission_id: "p1", student_id: "bea" },
        { submission_id: "p2", student_id: "chen" }
    ];

    const [tg1, tg2] = handInSummary({ classes, roster, projects, members });

    assert.equal(tg1.className, "TG1");
    assert.equal(tg1.handedInMaps, 2);
    assert.equal(tg1.handedInStudents, 3);
    assert.deepEqual(tg1.notHandedIn, [["Chen"]]);
    assert.equal(tg1.notHandedInStudents, 1);
    assert.deepEqual(tg1.noMap, ["Eli"]);

    assert.equal(tg2.className, "TG2");
    assert.equal(tg2.handedInMaps, 0);
    assert.deepEqual(tg2.noMap, ["Fay"]);
});

test("a student's newest map is the one that counts", () => {
    const summary = handInSummary({
        classes: [{ id: "c1", name: "TG1" }],
        roster: [{ id: "amir", student_name: "Amir", class_id: "c1" }],
        projects: [
            { id: "p1", status: "submitted", class_id: "c1", primary_student_id: "amir", submission_number: 1 },
            { id: "p2", status: "draft", class_id: "c1", primary_student_id: "amir", submission_number: 2 }
        ],
        members: [
            { submission_id: "p1", student_id: "amir" },
            { submission_id: "p2", student_id: "amir" }
        ]
    });

    assert.equal(summary[0].handedInMaps, 0);
    assert.deepEqual(summary[0].notHandedIn, [["Amir"]]);
});

test("a Hazards-only Task gives students only the Hazard tool and Select", () => {
    const tools = effectiveTools({
        hazards_only: true,
        move: false,
        shapes: true,
        freehand: true,
        path: true,
        road: true,
        colour: true,
        transform: true,
        layers: true,
        hazard: false,
        reference: true,
        download: false
    });

    assert.equal(tools.move, true);
    assert.equal(tools.hazard, true);
    for (const key of ["shapes", "freehand", "path", "road", "colour", "transform", "layers"]) {
        assert.equal(tools[key], false, key);
    }
    assert.equal(tools.reference, true, "the Reference Map is still the Teacher's choice");
    assert.equal(tools.download, false, "downloads are still the Teacher's choice");
});

test("an ordinary Task's tools are unchanged", () => {
    const tools = { shapes: true, hazard: false };
    assert.equal(effectiveTools(tools), tools);
});
