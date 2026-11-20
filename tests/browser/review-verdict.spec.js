const { test, expect } = require("@playwright/test");
const { openApp, signInAsTeacher, openProjectAsLearner } = require("./app");

/*
A handed-in map, project-1. review is its saved Review, if any;
revisedMap adds a Revised Map started from it.
*/
function setUpReview({ review = null, revisedMap = false } = {}) {
    const tables = window.fakeSupabase.tables;

    tables.submissions = [{
        id: "project-1",
        task_id: "task-1",
        status: "submitted",
        student_name: "Ali",
        class_name: "TG1",
        submitted_at: "2026-11-20T00:00:00Z",
        updated_at: "2026-11-20T00:00:00Z",
        map_data: { shapes: [], routes: [], hazards: [] }
    }];

    if (revisedMap) {
        tables.submissions.push({
            id: "project-2",
            task_id: "task-1",
            status: "draft",
            parent_submission_id: "project-1",
            submission_number: 2,
            map_data: { shapes: [], routes: [], hazards: [] }
        });
    }

    tables.submission_reviews = review
        ? [{ submission_id: "project-1", teacher_feedback: "", teacher_annotations: [], updated_at: "2026-11-20T01:00:00Z", ...review }]
        : [];
}

async function openReview(page) {
    await signInAsTeacher(page);
    await page.evaluate(async () => {
        selectedTeacherTask = { id: "task-1", title: "My school", task_code: "ABC123", allowed_tools: {} };
        await openSubmissionReview("project-1");
    });
}

const savedVerdicts = page =>
    page.evaluate(() =>
        window.fakeSupabase.calls
            .filter(call => call.table === "submission_reviews" && call.op === "upsert")
            .map(call => call.payload.verdict)
    );

test("a Review isn't saved until the Teacher chooses Approved or Returned", async ({ page }) => {
    const errors = await openApp(page, setUpReview, {});
    await openReview(page);

    await page.click("#saveTeacherFeedbackButton");
    await expect(page.locator("#statusBar")).toHaveText("Choose Approved or Returned first.");
    expect(await savedVerdicts(page)).toEqual([]);

    await page.check('input[name="reviewVerdict"][value="approved"]');
    await page.click("#saveTeacherFeedbackButton");
    await expect.poll(() => savedVerdicts(page)).toEqual(["approved"]);
    expect(errors).toEqual([]);
});

test("a saved Review opens with its choice, and the Teacher can switch it", async ({ page }) => {
    await openApp(page, setUpReview, {});
    await page.evaluate(() => {
        window.fakeSupabase.tables.submission_reviews = [{
            submission_id: "project-1", verdict: "approved", teacher_feedback: "Great",
            teacher_annotations: [], updated_at: "2026-11-20T01:00:00Z"
        }];
    });
    await openReview(page);

    await expect(page.locator('input[name="reviewVerdict"][value="approved"]')).toBeChecked();

    await page.check('input[name="reviewVerdict"][value="returned"]');
    await page.click("#saveTeacherFeedbackButton");
    await expect.poll(() => savedVerdicts(page)).toEqual(["returned"]);
});

test("once a Revised Map is started, a Returned Review can't be switched to Approved", async ({ page }) => {
    await openApp(page, () => {
        window.fakeSupabase.tables.submissions = [
            { id: "project-1", task_id: "task-1", status: "submitted", student_name: "Ali", class_name: "TG1",
              map_data: { shapes: [], routes: [], hazards: [] } },
            { id: "project-2", task_id: "task-1", status: "draft", parent_submission_id: "project-1",
              submission_number: 2, map_data: { shapes: [], routes: [], hazards: [] } }
        ];
        window.fakeSupabase.tables.submission_reviews = [{
            submission_id: "project-1", verdict: "returned", teacher_feedback: "Add the canteen",
            teacher_annotations: [], updated_at: "2026-11-20T01:00:00Z"
        }];
    });
    await openReview(page);

    await expect(page.locator('input[name="reviewVerdict"][value="returned"]')).toBeChecked();
    await expect(page.locator('input[name="reviewVerdict"][value="approved"]')).toBeDisabled();
    await expect(page.locator("#reviewVerdictNote")).toBeVisible();
});

for (const [verdict, text] of [
    ["approved", "Approved: no changes needed."],
    ["returned", "Returned: your teacher would like changes."]
]) {
    test(`a student sees their map was ${verdict}`, async ({ page }) => {
        await openApp(page, value => {
            const project = {
                submission_id: "project-1", task_id: "task-1", task_title: "My school", task_code: "ABC123",
                instructions: "", reference_path: null, allowed_tools: {}, status: "submitted",
                updated_at: "2026-11-20T00:00:00Z", submitted_at: "2026-11-20T00:00:00Z",
                map_data: { shapes: [], routes: [], hazards: [] }, group_members: [{ student_name: "Ali" }]
            };
            Object.assign(window.fakeSupabase.rpc, {
                student_load_project: () => [project],
                student_get_review: () => [{ teacher_feedback: "See the canteen.", teacher_annotations: [], reviewed_at: "2026-11-20T01:00:00Z" }],
                student_get_revision_info: () => [{ submission_number: 1, parent_submission_id: null, correction_submission_id: null }],
                review_verdict: () => value,
                claim_submission_edit_lock: () => [{ acquired: true }],
                renew_submission_edit_lock: () => [{ acquired: true }]
            });
        }, verdict);

        await openProjectAsLearner(page, "project-1");

        await expect(page.locator("#studentReviewVerdict")).toContainText(text);
    });
}
