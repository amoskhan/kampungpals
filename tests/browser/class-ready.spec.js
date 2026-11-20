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
