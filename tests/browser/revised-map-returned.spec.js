const { test, expect } = require("@playwright/test");
const { openApp, openProjectAsLearner } = require("./app");

/*
A student's Marked map with no Revised Map yet. arg.verdict is what the
database says its Review is (undefined: the database step hasn't been run);
arg.followOn says a Follow-on Task exists for its Task.
*/
function setUpMarkedMap(arg) {
    const project = {
        submission_id: "original",
        task_id: "task-1",
        task_title: "My school",
        task_code: "ABC123",
        instructions: "",
        reference_path: null,
        allowed_tools: {},
        status: "submitted",
        updated_at: "2026-11-20T00:00:00Z",
        submitted_at: "2026-11-20T00:00:00Z",
        map_data: { shapes: [], routes: [], hazards: [] },
        group_members: [{ student_name: "Ali" }]
    };

    Object.assign(window.fakeSupabase.rpc, {
        student_load_project: () => [project],
        student_get_review: () => [{ teacher_feedback: "Move the canteen north.", teacher_annotations: [], reviewed_at: "2026-11-20T01:00:00Z" }],
        student_get_revision_info: () => [{ submission_number: 1, parent_submission_id: null, correction_submission_id: null }],
        claim_submission_edit_lock: () => [{ acquired: true }],
        renew_submission_edit_lock: () => [{ acquired: true }]
    });

    window.fakeSupabase.rpc.task_has_follow_on = () => Boolean(arg.followOn);

    if (arg.verdict !== undefined) {
        window.fakeSupabase.rpc.review_verdict = () => arg.verdict;
    } else {
        window.fakeSupabase.rpc.review_verdict = () => {
            throw new Error("function public.review_verdict(uuid) does not exist");
        };
    }
}

const startButton = page => page.getByRole("button", { name: "Start Corrections" });

async function openMarkedMap(page, verdict) {
    await openApp(page, setUpMarkedMap, { verdict });
    await openProjectAsLearner(page, "original");
    await expect(page.locator("#studentTeacherFeedbackText")).toContainText("Move the canteen north.");
    // The verdict is checked after the Review shows.
    await expect.poll(() =>
        page.evaluate(() => window.fakeSupabase.calls.some(call => call.rpc === "review_verdict"))
    ).toBe(true);
}

test("a Returned map offers a Revised Map", async ({ page }) => {
    await openMarkedMap(page, "returned");
    await expect(startButton(page)).toBeVisible();
});

test("an Approved map doesn't offer a Revised Map", async ({ page }) => {
    await openMarkedMap(page, "approved");
    await page.waitForTimeout(300);
    await expect(startButton(page)).toBeHidden();
});

test("before the database step, a Marked map still offers a Revised Map", async ({ page }) => {
    await openMarkedMap(page, undefined);
    await expect(startButton(page)).toBeVisible();
});

test("once the class has a Follow-on Task, a Returned map no longer offers a Revised Map", async ({ page }) => {
    await openApp(page, setUpMarkedMap, { verdict: "returned", followOn: true });
    await openProjectAsLearner(page, "original");
    await expect.poll(() =>
        page.evaluate(() => window.fakeSupabase.calls.some(call => call.rpc === "task_has_follow_on"))
    ).toBe(true);
    await page.waitForTimeout(300);

    await expect(startButton(page)).toBeHidden();
});
