const { test, expect } = require("@playwright/test");
const { openApp, signInAsTeacher } = require("./app");

/*
One Task set for TG1:
  Ali  a map still being drawn
  Bea  a handed-in map
  Cam  no map (absent)
*/
function setUpClass() {
    const tables = window.fakeSupabase.tables;

    tables.classes = [
        { id: "class-1", class_name: "TG1", archived: false, created_at: "2026-01-01" }
    ];
    tables.tasks = [{
        id: "task-1",
        teacher_id: "teacher-1",
        title: "School map",
        task_code: "MAP1",
        instructions: "",
        follows_on_task_id: null,
        allow_guests: true,
        allowed_tools: {},
        created_at: "2026-11-20T00:00:00Z"
    }];
    tables.task_classes = [{ task_id: "task-1", class_id: "class-1" }];
    tables.students = [
        { id: "ali", student_name: "Ali", class_id: "class-1", register_no: 1, active: true },
        { id: "bea", student_name: "Bea", class_id: "class-1", register_no: 2, active: true },
        { id: "cam", student_name: "Cam", class_id: "class-1", register_no: 3, active: true }
    ];
    tables.submissions = [
        { id: "map-ali", task_id: "task-1", status: "draft", class_id: "class-1", primary_student_id: "ali", submission_number: 1 },
        { id: "map-bea", task_id: "task-1", status: "submitted", class_id: "class-1", primary_student_id: "bea", submission_number: 1 }
    ];
    tables.submission_members = [
        { submission_id: "map-ali", task_id: "task-1", student_id: "ali" },
        { submission_id: "map-bea", task_id: "task-1", student_id: "bea" }
    ];
}

async function openFollowOnWindow(page) {
    await signInAsTeacher(page);
    await page.evaluate(async () => {
        window.confirm = () => true;
        await selectTeacherTask(window.fakeSupabase.tables.tasks[0]);
    });
    await page.click("#createFollowOnButton");
    await expect(page.locator("#followOnHandIn")).toContainText("TG1");
}

const status = (page, id) =>
    page.evaluate(
        mapId => window.fakeSupabase.tables.submissions.find(row => row.id === mapId).status,
        id
    );

test("\"Hand in all\" hands in every map in a Class still being drawn", async ({ page }) => {
    const errors = await openApp(page, setUpClass);
    await openFollowOnWindow(page);

    const handInAll = page.getByRole("button", { name: "Hand in all (1 map)" });
    await expect(handInAll).toBeVisible();
    await handInAll.click();

    await expect.poll(() => status(page, "map-ali")).toBe("submitted");
    expect(await status(page, "map-bea")).toBe("submitted");
    await expect(page.locator("#followOnHandIn")).toContainText("Not handed in: 0 maps");
    await expect(handInAll).toBeHidden();
    expect(errors).toEqual([]);
});

test("\"Hand in all\" does nothing if the Teacher cancels", async ({ page }) => {
    await openApp(page, setUpClass);
    await openFollowOnWindow(page);
    await page.evaluate(() => { window.confirm = () => false; });

    await page.getByRole("button", { name: "Hand in all (1 map)" }).click();

    expect(await status(page, "map-ali")).toBe("draft");
});

const reviewFor = (page, id) =>
    page.evaluate(
        mapId => window.fakeSupabase.tables.submission_reviews?.find(row => row.submission_id === mapId) || null,
        id
    );

test("\"Approve all handed-in maps\" Approves only handed-in maps with no Review", async ({ page }) => {
    const errors = await openApp(page, setUpClass);
    // Plus Dan, whose handed-in map was already Returned.
    await page.evaluate(() => {
        const tables = window.fakeSupabase.tables;
        tables.students.push({ id: "dan", student_name: "Dan", class_id: "class-1", register_no: 4, active: true });
        tables.submissions.push({ id: "map-dan", task_id: "task-1", status: "submitted", class_id: "class-1", primary_student_id: "dan", submission_number: 1 });
        tables.submission_members.push({ submission_id: "map-dan", task_id: "task-1", student_id: "dan" });
        tables.submission_reviews = [{ submission_id: "map-dan", verdict: "returned", teacher_feedback: "Add the hall" }];
    });
    await openFollowOnWindow(page);

    await expect(page.locator("#followOnHandIn")).toContainText("Not reviewed yet: 1 map — Bea");
    await page.getByRole("button", { name: "Approve all handed-in maps (1)" }).click();

    await expect.poll(() => reviewFor(page, "map-bea")).toMatchObject({ verdict: "approved", teacher_feedback: "" });
    expect(await reviewFor(page, "map-ali")).toBeNull();
    expect((await reviewFor(page, "map-dan")).verdict).toBe("returned");
    await expect(page.locator("#followOnHandIn")).toContainText("Not reviewed yet: 0 maps");

    // Handing in Ali's map makes it the next to approve.
    await page.getByRole("button", { name: "Hand in all (1 map)" }).click();
    await expect(page.getByRole("button", { name: "Approve all handed-in maps (1)" })).toBeVisible();
    await expect(page.locator("#followOnHandIn")).toContainText("Not reviewed yet: 1 map — Ali");
    expect(errors).toEqual([]);
});

test("a Follow-on Task can't be created until every map is handed in and Reviewed", async ({ page }) => {
    const errors = await openApp(page, setUpClass);
    await openFollowOnWindow(page);

    const create = page.locator("#confirmFollowOnButton");
    const note = page.locator("#followOnReadyNote");
    await expect(create).toBeDisabled();
    await expect(note).toContainText("Waiting for TG1");

    await page.getByRole("button", { name: "Hand in all (1 map)" }).click();
    await expect(page.getByRole("button", { name: "Approve all handed-in maps (2)" })).toBeVisible();
    await expect(create).toBeDisabled();

    await page.getByRole("button", { name: "Approve all handed-in maps (2)" }).click();
    // Cam has no map: he doesn't hold it up.
    await expect(create).toBeEnabled();
    await expect(note).toContainText("Every map is handed in and Reviewed");
    expect(errors).toEqual([]);
});

test("a handed-in Revised Map needn't be Reviewed, but a started one must be handed in", async ({ page }) => {
    await openApp(page, setUpClass);
    await page.evaluate(() => {
        const tables = window.fakeSupabase.tables;
        tables.submissions.find(row => row.id === "map-ali").status = "submitted";
        tables.submissions.push({ id: "map-bea-2", task_id: "task-1", status: "draft", class_id: "class-1", primary_student_id: "bea", submission_number: 2, parent_submission_id: "map-bea" });
        tables.submission_members.push({ submission_id: "map-bea-2", task_id: "task-1", student_id: "bea" });
        tables.submission_reviews = [
            { submission_id: "map-ali", verdict: "approved" },
            { submission_id: "map-bea", verdict: "returned" }
        ];
    });
    await openFollowOnWindow(page);

    const create = page.locator("#confirmFollowOnButton");
    await expect(page.locator("#followOnHandIn")).toContainText("Not handed in: 1 map");
    await expect(create).toBeDisabled();

    await page.getByRole("button", { name: "Hand in all (1 map)" }).click();
    await expect(create).toBeEnabled();
});
