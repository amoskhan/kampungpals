const { test, expect } = require("@playwright/test");
const { openApp, signInAsTeacher } = require("./app");

function setUpSubmittedProject() {
    window.fakeSupabase.tables.submissions = [{
        id: "project-1",
        task_id: "task-1",
        status: "submitted",
        submitted_at: "2026-11-20T00:00:00Z",
        updated_at: "2026-11-20T00:00:00Z",
        map_data: { shapes: [], routes: [], hazards: [] }
    }];
    window.fakeSupabase.tables.submission_reviews = [];
}

async function reviewSaves(page) {
    return page.evaluate(() =>
        window.fakeSupabase.calls.filter(call =>
            call.table === "submission_reviews" && call.op === "upsert"
        ).length
    );
}

test("one click on Save review saves the Review after typing feedback", async ({ page }) => {
    await openApp(page, setUpSubmittedProject);
    await signInAsTeacher(page);
    await page.evaluate(async () => {
        selectedTeacherTask = { id: "task-1", title: "My school", task_code: "ABC123", allowed_tools: {} };
        await openSubmissionReview("project-1");
    });

    const button = page.locator("#saveTeacherFeedbackButton");
    await expect(button).toBeEnabled();

    await page.click("#teacherFeedbackText");
    await page.keyboard.type("Good use of relative size.");

    await button.click();

    await expect.poll(() => reviewSaves(page), { timeout: 3000 }).toBe(1);
    await expect(button).toHaveText("✓ Saved");
});

for (const fromGallery of [false, true]) {
    test(`two saves with ink and a point comment (${fromGallery ? "Gallery" : "Project list"})`, async ({ page }) => {
        const dialogs = [];
        await openApp(page, setUpSubmittedProject);
        page.removeAllListeners("dialog");
        page.on("dialog", dialog => { dialogs.push(dialog.message()); dialog.accept(); });
        await signInAsTeacher(page);
        await page.evaluate(async fromGallery => {
            selectedTeacherTask = { id: "task-1", title: "My school", task_code: "ABC123", allowed_tools: {} };
            await openSubmissionReview("project-1", { fromGallery });
            annotations.push({ type: "comment", id: "c1", x: 100, y: 100, text: "Check north" });
            annotations.push({ type: "ink", points: [{ x: 10, y: 10 }, { x: 40, y: 40 }], color: "#d00", width: 4 });
            renderAnnotations();
        }, fromGallery);

        const button = page.locator("#saveTeacherFeedbackButton");
        for (const text of ["First feedback.", " More."]) {
            await page.click("#teacherFeedbackText");
            await page.keyboard.type(text);
            await expect(button).toHaveText("Save review");
            await button.click();
            await expect(button).toHaveText("✓ Saved");
        }
        expect(await reviewSaves(page)).toBe(2);
        expect(dialogs).toEqual([]);
    });
}
