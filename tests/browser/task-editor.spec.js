const { test, expect } = require("@playwright/test");
const { openApp, signInAsTeacher } = require("./app");

const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
);

test.beforeEach(async ({ page }) => {
    await openApp(page, () => {
        window.fakeSupabase.tables.classes = [
            { id: "class-1", name: "TG1", archived: false, created_at: "2026-01-01" }
        ];
    });

    await signInAsTeacher(page);
});

test("uploading a Reference Map keeps unsaved Task edits", async ({ page }) => {
    await page.click("#createTaskButton");
    await expect(page.locator("#teacherTaskTitle")).toHaveValue("New OE Mapping Task");

    await page.fill("#teacherTaskTitle", "my house");
    await page.fill("#teacherTaskInstructions", "Map the canteen.");
    const classBox = page.locator('#taskAssignedClasses input[type="checkbox"]').first();
    await classBox.check();

    await page.setInputFiles("#teacherReferenceFile", {
        name: "site.png",
        mimeType: "image/png",
        buffer: PNG
    });

    // The upload is done once the Task points at the new image.
    await expect.poll(() =>
        page.evaluate(() => Boolean(selectedTeacherTask?.reference_path))
    ).toBe(true);
    await expect(page.locator("#teacherReferenceFile")).toHaveValue("");

    await expect(page.locator("#teacherTaskTitle")).toHaveValue("my house");
    await expect(page.locator("#teacherTaskInstructions")).toHaveValue("Map the canteen.");
    await expect(classBox).toBeChecked();
});
