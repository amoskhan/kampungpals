const { test, expect } = require("@playwright/test");
const { openApp, signInAsTeacher, openProjectAsLearner } = require("./app");

/*
A student's Follow-on map: a copy with one Landmark, in a Hazards-only Task
whose stored switches would otherwise allow every tool (issue #35).
*/
function setUpFollowOnMap() {
    const project = {
        submission_id: "copy",
        task_id: "task-2",
        task_title: "School map — Hazards",
        task_code: "HAZ1",
        instructions: "Find Hazards.",
        reference_path: null,
        allowed_tools: {
            hazards_only: true,
            move: true,
            shapes: true,
            freehand: true,
            path: true,
            road: true,
            colour: true,
            transform: true,
            layers: true,
            hazard: false
        },
        status: "draft",
        updated_at: "2026-11-21T00:00:00Z",
        submitted_at: null,
        map_data: {
            shapes: [{
                id: 1,
                type: "rectangle",
                label: "Pool",
                meaning: "",
                fill: "#cfe8ff",
                rotation: 0,
                x: 300,
                y: 250,
                width: 260,
                height: 180
            }],
            routes: [],
            hazards: []
        },
        group_members: [{ student_name: "Ali" }]
    };

    const lock = () => [{ acquired: true }];

    Object.assign(window.fakeSupabase.rpc, {
        student_load_project: () => [project],
        student_get_review: () => null,
        student_get_revision_info: () => [
            { submission_number: 1, parent_submission_id: null, correction_submission_id: null }
        ],
        claim_submission_edit_lock: lock,
        renew_submission_edit_lock: lock
    });
}

test("on a Follow-on map students get only Select and the Hazard tool", async ({ page }) => {
    const errors = await openApp(page, setUpFollowOnMap);
    await openProjectAsLearner(page, "copy");

    await expect(page.locator("#selectTool")).toBeVisible();

    // "Add" opens a menu with only the Hazard in it.
    await page.click("#shapeMenuButton");
    await expect(page.locator("#hazardTool")).toBeVisible();
    await expect(page.locator("#shapeFlyout .shape-grid")).toBeHidden();

    for (const selector of [
        ".oe-enhance-draw-menu",
        "#transformTool",
        "#colourMenuButton",
        "#clearButton"
    ]) {
        await expect(page.locator(selector), selector).toBeHidden();
    }

    expect(errors).toEqual([]);
});

test("the copied Landmark can't be selected or moved, but Hazards can be added and selected", async ({ page }) => {
    const errors = await openApp(page, setUpFollowOnMap);
    await openProjectAsLearner(page, "copy");

    const before = await page.evaluate(() => ({ x: shapes[0].x, y: shapes[0].y }));

    await page.evaluate(() => setTool("select"));
    const landmark = page.locator('.map-shape[data-shape-id="1"]');
    const box = await landmark.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 6 });
    await page.mouse.up();

    expect(await page.evaluate(() => selectedItem)).toBeNull();
    expect(await page.evaluate(() => ({ x: shapes[0].x, y: shapes[0].y }))).toEqual(before);

    // A Hazard on the Landmark itself.
    await page.evaluate(() => setTool("hazard"));
    await page.mouse.click(box.x + 20, box.y + 20);
    await expect(page.locator("#hazardModal")).toBeVisible();
    await page.fill("#hazardNameInput", "Slippery edge");
    await page.click("#saveHazardButton");
    expect(await page.evaluate(() => hazards.map(hazard => hazard.name))).toEqual(["Slippery edge"]);

    await page.evaluate(() => setTool("select"));
    await page.locator("[data-hazard-id]").first().click();
    expect(await page.evaluate(() => selectedItem?.kind)).toBe("hazard");

    expect(await page.evaluate(() => shapes.length)).toBe(1);
    expect(errors).toEqual([]);
});

test("a Follow-on Task's tool switches are fixed in the Task editor and stay Hazards-only when saved", async ({ page }) => {
    await openApp(page, () => {
        window.fakeSupabase.tables.classes = [
            { id: "class-1", name: "TG1", archived: false, created_at: "2026-01-01" }
        ];
        window.fakeSupabase.tables.tasks = [{
            id: "task-2",
            teacher_id: "teacher-1",
            title: "School map — Hazards",
            task_code: "HAZ1",
            instructions: "Find Hazards.",
            follows_on_task_id: "task-1",
            allow_guests: true,
            allowed_tools: { shapes: true, hazard: true },
            created_at: "2026-11-21T00:00:00Z"
        }];
    });
    await signInAsTeacher(page);

    await page.evaluate(async () => {
        await selectTeacherTask(window.fakeSupabase.tables.tasks[0]);
    });

    await expect(page.locator("#hazardsOnlyNote")).toBeVisible();
    await expect(page.locator("#allowShapes")).toBeDisabled();
    await expect(page.locator("#allowShapes")).not.toBeChecked();
    await expect(page.locator("#allowHazard")).toBeChecked();
    await expect(page.locator("#allowReference")).toBeEnabled();

    await page.click("#saveTaskSettingsButton");

    await expect.poll(() =>
        page.evaluate(() => window.fakeSupabase.tables.tasks[0].allowed_tools.hazards_only)
    ).toBe(true);
});
