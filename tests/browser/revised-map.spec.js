const { test, expect } = require("@playwright/test");
const { openApp, openProjectAsLearner, drawLandmark } = require("./app");

/*
One Task with two Projects for the same student:
  original  Submission 1, submitted
  revised   Submission 2, its Revised Map, a draft
reviews says which of them the Teacher has Marked.
*/
function setUpRevisedMap(reviews) {
    const project = (id, status) => ({
        submission_id: id,
        task_id: "task-1",
        task_title: "My school",
        task_code: "ABC123",
        instructions: "Map the canteen.",
        reference_path: null,
        allowed_tools: {},
        status,
        updated_at: "2026-11-20T00:00:00Z",
        submitted_at: status === "submitted" ? "2026-11-20T00:00:00Z" : null,
        map_data: { shapes: [], routes: [], hazards: [] },
        group_members: [{ student_name: "Ali" }]
    });

    const projects = {
        original: project("original", "submitted"),
        revised: project("revised", "draft")
    };

    window.fakeSupabase.reviews = { ...reviews };

    const loadProject = ({ p_submission_id }) => [projects[p_submission_id]];

    const getReview = ({ p_submission_id }) =>
        window.fakeSupabase.reviews[p_submission_id]
            ? [{
                teacher_feedback: window.fakeSupabase.reviews[p_submission_id],
                teacher_annotations: [],
                reviewed_at: "2026-11-20T01:00:00Z"
            }]
            : null;

    const getRevisionInfo = ({ p_submission_id }) => [
        p_submission_id === "revised"
            ? { submission_number: 2, parent_submission_id: "original", correction_submission_id: null }
            : { submission_number: 1, parent_submission_id: null, correction_submission_id: "revised" }
    ];

    const lock = () => [{ acquired: true }];

    Object.assign(window.fakeSupabase.rpc, {
        student_load_project: loadProject,
        guest_load_project: loadProject,
        student_get_review: getReview,
        guest_get_review: getReview,
        student_get_revision_info: getRevisionInfo,
        guest_get_revision_info: getRevisionInfo,
        claim_submission_edit_lock: lock,
        renew_submission_edit_lock: lock
    });
}

// Waits until the Revised Map has loaded the earlier Project's Review.
async function waitForEarlierReview(page) {
    await expect.poll(() =>
        page.evaluate(() => studentReviewData?.feedback || "")
    ).toBe("Move the canteen north.");
}

for (const identity of ["registered", "guest"]) {
    test.describe(`as a ${identity === "guest" ? "Guest" : "student"}`, () => {
        test("can draw on a Revised Map whose earlier Project is Marked", async ({ page }) => {
            await openApp(page, setUpRevisedMap, { original: "Move the canteen north." });
            await openProjectAsLearner(page, "revised", identity);
            await waitForEarlierReview(page);

            expect(await drawLandmark(page)).toBe(1);
            await expect(page.locator("#studentTeacherFeedbackText")).toContainText("Move the canteen north.");
        });

        test("cannot draw on a Marked Revised Map", async ({ page }) => {
            await openApp(page, setUpRevisedMap, {
                original: "Move the canteen north.",
                revised: "Well done."
            });
            await openProjectAsLearner(page, "revised", identity);
            await expect.poll(() =>
                page.evaluate(() => studentReviewData?.feedback || "")
            ).toBe("Well done.");

            expect(await drawLandmark(page)).toBe(0);
        });

        test("cannot draw on the Marked original Project", async ({ page }) => {
            await openApp(page, setUpRevisedMap, { original: "Move the canteen north." });
            await openProjectAsLearner(page, "original", identity);
            await waitForEarlierReview(page);

            expect(await drawLandmark(page)).toBe(0);
        });
    });
}

test("a Revised Map locks when the Teacher marks it while the student is drawing", async ({ page }) => {
    await openApp(page, setUpRevisedMap, { original: "Move the canteen north." });
    await openProjectAsLearner(page, "revised");
    await waitForEarlierReview(page);
    expect(await drawLandmark(page)).toBe(1);

    // The Teacher saves a Review; the student's page picks it up on its next check.
    await page.evaluate(async () => {
        window.fakeSupabase.reviews.revised = "Well done.";
        await checkForReviewUpdate();
    });
    await expect.poll(() =>
        page.evaluate(() => studentReviewData?.feedback || "")
    ).toBe("Well done.");

    expect(await drawLandmark(page)).toBe(1);
    expect(await page.evaluate(() => isStudentEditingAllowed())).toBe(false);
});
