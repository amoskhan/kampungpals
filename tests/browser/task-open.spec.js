const { test, expect } = require("@playwright/test");
const { openApp } = require("./app");

/*
A student enters a Task Code for a Task they have no map for yet. failure, if
given, is the error starting it throws (issue #31: the error used to land in
the hidden code box, leaving a Task heading over an empty list).
*/
function setUpTask(failure) {
    Object.assign(window.fakeSupabase.rpc, {
        student_get_task_by_code: () => [{
            task_id: "task-2",
            title: "School map — Hazards",
            task_code: "HAZ1",
            existing_submission_id: null
        }],
        student_project_history: () => [],
        follow_on_start_info: () => {
            if (failure) {
                throw new Error(failure);
            }
            return [];
        }
    });
}

async function enterTaskCode(page, code) {
    await page.evaluate(async () => {
        currentIdentityType = "registered";
        currentStudentProfile = { student_id: "student-1", student_name: "Ali", class_name: "TG1" };
        startupModal.hidden = true;
        await returnToStudentProfile();
    });

    const input = page.locator(".profile-start-card input[type=text]");
    await input.fill(code);
    await page.locator(".profile-start-card .primary-button").click();
}

test("a Task that can't be opened says so in the Task folder", async ({ page }) => {
    const errors = await openApp(page, setUpTask, "Your map could not be linked to you.");

    await enterTaskCode(page, "HAZ1");

    const message = page.locator("#studentProjectsList [role=alert]");
    await expect(message).toContainText("This Task couldn't be opened.");
    await expect(message).toContainText("Your map could not be linked to you.");
    await expect(page.locator("#studentProjectsList")).not.toContainText("Enter a task code above");
    expect(errors).toEqual([]);
});

test("an empty Task folder doesn't ask for a task code under the Task's heading", async ({ page }) => {
    await openApp(page, setUpTask, null);

    await enterTaskCode(page, "HAZ1");
    await page.evaluate(() => renderStudentProjectHistory());

    await expect(page.locator("#studentProjectsList")).toHaveText("No maps for this Task yet.");
});
