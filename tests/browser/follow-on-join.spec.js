const { test, expect } = require("@playwright/test");
const { openApp } = require("./app");

/*
Dan was absent from the earlier lesson, so he has no earlier map. Bea and
Cam have opened the Follow-on Task, so their copied map can be joined.
*/
function setUpAbsentStudent() {
    const followOnTask = {
        task_id: "task-2",
        title: "School map — Hazards",
        task_code: "HAZ1",
        existing_submission_id: null
    };
    const copy = {
        submission_id: "copy-1",
        task_id: "task-2",
        task_title: "School map — Hazards",
        task_code: "HAZ1",
        instructions: "Find Hazards.",
        reference_path: null,
        allowed_tools: { hazards_only: true },
        status: "draft",
        updated_at: "2026-11-21T00:00:00Z",
        submitted_at: null,
        map_data: { shapes: [], routes: [], hazards: [] },
        group_members: [{ student_name: "Bea" }, { student_name: "Cam" }, { student_name: "Dan" }]
    };

    Object.assign(window.fakeSupabase.rpc, {
        student_get_task_by_code: () => [followOnTask],
        guest_get_task_by_code: () => [followOnTask],
        follow_on_start_info: () => [{ earlier_submission_id: null, earlier_task_title: "School map" }],
        student_list_follow_on_groups: () => [{ submission_id: "copy-1", group_name: "Bea, Cam" }],
        student_join_follow_on_group: () => "copy-1",
        student_load_project: () => [copy],
        student_get_review: () => null,
        student_get_revision_info: () => [{ submission_number: 1, parent_submission_id: null, correction_submission_id: null }],
        student_project_history: () => [],
        guest_project_history: () => [],
        claim_submission_edit_lock: () => [{ acquired: true }],
        renew_submission_edit_lock: () => [{ acquired: true }]
    });
}

async function enterTaskCode(page, identity) {
    await page.evaluate(async type => {
        currentIdentityType = type;
        if (type === "guest") {
            currentGuestProfile = { guest_id: "guest-1", guest_name: "Guest", class_name: "Guest" };
        } else {
            currentStudentProfile = { student_id: "dan", student_name: "Dan", class_name: "TG1" };
        }
        startupModal.hidden = true;
        await returnToStudentProfile();
    }, identity);

    await page.locator(".profile-start-card input[type=text]").fill("HAZ1");
    await page.locator(".profile-start-card .primary-button").click();
}

const rpcCalls = (page, name) =>
    page.evaluate(
        rpc => window.fakeSupabase.calls.filter(call => call.rpc === rpc).map(call => call.args),
        name
    );

test("a student with no earlier map joins a Group instead of starting blank", async ({ page }) => {
    const errors = await openApp(page, setUpAbsentStudent);
    await enterTaskCode(page, "registered");

    await expect(page.locator("#joinGroupModal")).toBeVisible();
    await page.getByLabel("Bea, Cam").check();
    await page.click("#confirmJoinGroupButton");

    await expect.poll(() => page.evaluate(() => currentSubmission?.id)).toBe("copy-1");
    expect(await rpcCalls(page, "student_join_follow_on_group")).toEqual([
        { p_task_code: "HAZ1", p_student_id: "dan", p_submission_id: "copy-1" }
    ]);
    expect(await rpcCalls(page, "student_start_group_project")).toEqual([]);
    expect(await rpcCalls(page, "student_list_follow_on_free")).toEqual([]);
    expect(errors).toEqual([]);
});

test("with no Group started yet, the student is told to ask their Group", async ({ page }) => {
    await openApp(page, setUpAbsentStudent);
    await page.evaluate(() => {
        window.fakeSupabase.rpc.student_list_follow_on_groups = () => [];
    });
    await enterTaskCode(page, "registered");

    await expect(page.locator("#joinGroupList")).toHaveText(
        "No Group has opened this Task yet. Ask your Group to open it, then try again."
    );
    await expect(page.locator("#confirmJoinGroupButton")).toBeDisabled();
});

test("a Guest with no earlier map is told they can't take part", async ({ page }) => {
    await openApp(page, setUpAbsentStudent);
    await enterTaskCode(page, "guest");

    await expect.poll(() => page.evaluate(() => studentTaskError.textContent)).toContain(
        "This Task builds on an earlier map you don't have. Ask your teacher."
    );
    expect(await rpcCalls(page, "guest_start_follow_on_project")).toEqual([]);
    expect(await rpcCalls(page, "guest_start_project")).toEqual([]);
});
