const test = require("node:test");
const assert = require("node:assert/strict");
const {
    nextFollowOnTitle,
    followOnTaskSettings,
    orderTasksForList,
    isReferenceShared,
    followOnStartStep
} = require("../js/follow-on.js");

test("a Follow-on Task is suggested as the next part", () => {
    assert.equal(nextFollowOnTitle("School map"), "School map — part 2");
    assert.equal(nextFollowOnTitle("School map — part 2"), "School map — part 3");
    assert.equal(nextFollowOnTitle("  "), "Untitled Task — part 2");
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
    assert.equal(settings.title, "School map — part 2");
    assert.equal(settings.instructions, "");
    assert.equal(settings.reference_path, "teacher/t1/map.png");
    assert.equal(settings.allow_guests, false);
    assert.equal(settings.allowed_tools.hazard, true);
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
