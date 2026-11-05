const test = require("node:test");
const assert = require("node:assert/strict");
const { projectAccess, submissionAccess } = require("../project-access.js");

const cases = [
    {
        name: "the Editor of a draft can draw",
        facts: { status: "draft", isEditor: true },
        state: "drawing", label: "Drawing", className: "", statusWord: "draft",
        handedIn: false, marked: false, canDraw: true, teacherCanMark: false
    },
    {
        name: "another device on a draft is View-only",
        facts: { status: "draft", isEditor: false },
        state: "view-only", label: "View-only", className: "", statusWord: "draft",
        handedIn: false, marked: false, canDraw: false, teacherCanMark: false
    },
    {
        name: "a Teacher watching a draft sees Drawing but cannot mark it",
        facts: { status: "draft" },
        state: "drawing", label: "Drawing", className: "", statusWord: "draft",
        handedIn: false, marked: false, canDraw: false, teacherCanMark: false
    },
    {
        name: "a Project with no status yet counts as a draft",
        facts: { isEditor: true },
        state: "drawing", label: "Drawing", className: "", statusWord: "draft",
        handedIn: false, marked: false, canDraw: true, teacherCanMark: false
    },
    {
        name: "Submitted locks the Editor out and lets a Teacher mark",
        facts: { status: "submitted", isEditor: true },
        state: "submitted", label: "Submitted", className: "submitted", statusWord: "submitted",
        handedIn: true, marked: false, canDraw: false, teacherCanMark: true
    },
    {
        name: "a Marked Project is final",
        facts: { status: "submitted", hasReview: true, isEditor: true },
        state: "marked", label: "Marked", className: "marked", statusWord: "submitted",
        handedIn: true, marked: true, canDraw: false, teacherCanMark: true
    },
    {
        name: "any saved Review counts as Marked and handed in, even on a draft",
        facts: { status: "draft", hasReview: true, isEditor: true },
        state: "marked", label: "Marked", className: "marked", statusWord: "submitted",
        handedIn: true, marked: true, canDraw: false, teacherCanMark: true
    }
];

for (const { name, facts, ...expected } of cases) {
    test(name, () => {
        const { lockedMessage, ...actual } = projectAccess(facts);
        assert.deepEqual(actual, expected);
    });
}

test("only a handed-in Project explains why it is locked", () => {
    assert.equal(projectAccess({ status: "draft", isEditor: false }).lockedMessage, null);
    assert.match(projectAccess({ status: "submitted" }).lockedMessage, /handed in/);
    assert.match(projectAccess({ hasReview: true }).lockedMessage, /marked/);
});

test("a list row is Marked once it has reviewed_at", () => {
    assert.equal(submissionAccess({ status: "draft", reviewed_at: "2026-11-05" }).state, "marked");
    assert.equal(submissionAccess({ status: "submitted", reviewed_at: null }).state, "submitted");
    assert.equal(submissionAccess({ status: "draft", reviewed_at: null }).state, "drawing");
});
