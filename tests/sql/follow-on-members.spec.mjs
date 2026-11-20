// Issue #29: a copied Follow-on map must always belong to its students.
// Runs docs/sql scripts in PGlite against a minimal stand-in schema and the
// live definition of oe_student_project_for_task.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const sql = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

const SCHEMA = sql("tests/sql/schema.sql");
const FOLLOW_ON_TASKS = sql("docs/sql/follow-on-tasks/apply.sql");
const FOLLOW_ON_FIXES = sql("docs/sql/follow-on-fixes/apply.sql");
const LIVE_LOOKUP = sql("docs/sql/follow-on-members/live-lookup.sql");
const FIX = sql("docs/sql/follow-on-members/apply.sql");
const CHECK = sql("docs/sql/follow-on-members/check.sql");
const UNDO = sql("docs/sql/follow-on-members/undo.sql");

const CLASS = "00000000-0000-0000-0000-00000000c1a5";

// The database as production had it before the fix: the Follow-on scripts,
// then the live lookup on top. With { fixed: true }, the fix is applied too.
async function database({ fixed = false } = {}) {
    const db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(FOLLOW_ON_TASKS);
    await db.exec(FOLLOW_ON_FIXES);
    await db.exec(LIVE_LOOKUP);
    if (fixed) await db.exec(FIX);
    return db;
}

async function one(db, query, params = []) {
    const { rows } = await db.query(query, params);
    return rows[0];
}

async function student(db, name) {
    const { id } = await one(db,
        "insert into students (class_id, student_name) values ($1, $2) returning id",
        [CLASS, name]);
    const { uid } = await one(db, "select gen_random_uuid() as uid");
    await db.query("insert into student_sessions (auth_uid, student_id) values ($1, $2)", [uid, id]);
    return { id, uid, name };
}

async function task(db, code, followsOn = null) {
    const { id } = await one(db,
        "insert into tasks (task_code, title) values ($1, $1) returning id", [code]);
    await db.query("insert into task_classes (task_id, class_id) values ($1, $2)", [id, CLASS]);
    if (followsOn) {
        await db.query("update tasks set follows_on_task_id = $1 where id = $2", [followsOn, id]);
    }
    return id;
}

// A handed-in map in a Task for a Group (first member is its main student).
async function map(db, taskId, members, { number = 1, parent = null, drawing = {} } = {}) {
    const { id } = await one(db, `
        insert into submissions (task_id, student_name, class_name, map_data, status,
                                 class_id, primary_student_id, submission_number, parent_submission_id)
        values ($1, $2, 'TG1', $3, 'submitted', $4, $5, $6, $7) returning id`,
        [taskId, members.map((m) => m.name).join(", "), JSON.stringify(drawing),
         CLASS, members[0].id, number, parent]);
    for (const [i, m] of members.entries()) {
        await db.query(`
            insert into submission_members (submission_id, student_id, is_creator, submission_number)
            values ($1, $2, $3, $4)`, [id, m.id, i === 0, number]);
    }
    return id;
}

async function startFollowOn(db, s, code) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [s.uid]);
    const { id } = await one(db,
        "select student_start_follow_on_project($1, $2) as id", [code, s.id]);
    return id;
}

async function memberIds(db, submissionId) {
    const { rows } = await db.query(
        "select student_id from submission_members where submission_id = $1 order by student_id",
        [submissionId]);
    return rows.map((r) => r.student_id).sort();
}

async function mapsIn(db, taskId) {
    return (await one(db, "select count(*)::int as n from submissions where task_id = $1", [taskId])).n;
}

// Ali works alone and has a Revised Map; Bea and Cam share one map.
async function lesson(db) {
    const ali = await student(db, "Ali");
    const bea = await student(db, "Bea");
    const cam = await student(db, "Cam");
    const task1 = await task(db, "MAP1");
    const task2 = await task(db, "HAZ1", task1);
    const aliOriginal = await map(db, task1, [ali], { drawing: { landmarks: ["pool"] } });
    const aliRevised = await map(db, task1, [ali],
        { number: 2, parent: aliOriginal, drawing: { landmarks: ["pool", "hall"] } });
    const group = await map(db, task1, [bea, cam], { drawing: { landmarks: ["field"] } });
    return { ali, bea, cam, task1, task2, aliRevised, group };
}

test("before the fix: a student working alone is left off their own copy (the #29 bug)", async () => {
    const db = await database();
    const { ali, task2 } = await lesson(db);

    const copy = await startFollowOn(db, ali, "HAZ1");

    assert.ok(copy, "the copy is made");
    assert.deepEqual(await memberIds(db, copy), [], "but Ali is not a member of it");
    assert.equal(await mapsIn(db, task2), 1);
});

test("a student working alone becomes a member of the copy of their Revised Map", async () => {
    const db = await database({ fixed: true });
    const { ali, aliRevised } = await lesson(db);

    const copy = await startFollowOn(db, ali, "HAZ1");

    assert.deepEqual(await memberIds(db, copy), [ali.id]);
    const row = await one(db,
        "select copied_from_submission_id, map_data from submissions where id = $1", [copy]);
    assert.equal(row.copied_from_submission_id, aliRevised);
    assert.deepEqual(row.map_data, { landmarks: ["pool", "hall"] });
});

for (const starter of ["Bea", "Cam"]) {
    test(`a Group's copy keeps every member, including its main student, when ${starter} starts it`, async () => {
        const db = await database({ fixed: true });
        const people = await lesson(db);
        const first = people[starter.toLowerCase()];
        const other = starter === "Bea" ? people.cam : people.bea;

        const copy = await startFollowOn(db, first, "HAZ1");
        assert.deepEqual(await memberIds(db, copy), [people.bea.id, people.cam.id].sort());

        assert.equal(await startFollowOn(db, other, "HAZ1"), copy, "the other member joins the same copy");
        assert.equal(await mapsIn(db, people.task2), 1);
    });
}

test("the one-time repair reconnects copies that lost their students", async () => {
    const db = await database();
    const { ali, bea, cam, task2 } = await lesson(db);
    const aliCopy = await startFollowOn(db, ali, "HAZ1");
    const groupCopy = await startFollowOn(db, cam, "HAZ1");
    assert.deepEqual(await memberIds(db, aliCopy), []);

    await db.exec(FIX);

    assert.deepEqual(await memberIds(db, aliCopy), [ali.id]);
    assert.deepEqual(await memberIds(db, groupCopy), [bea.id, cam.id].sort());
    assert.equal(await startFollowOn(db, ali, "HAZ1"), aliCopy, "Ali reopens it");
    assert.equal(await startFollowOn(db, bea, "HAZ1"), groupCopy, "Bea reopens the Group's copy");
    assert.equal(await mapsIn(db, task2), 2);
});

test("before the fix: a Group's copy started by another member leaves out its main student", async () => {
    const db = await database();
    const { cam } = await lesson(db);

    const copy = await startFollowOn(db, cam, "HAZ1");

    assert.deepEqual(await memberIds(db, copy), [cam.id], "Bea, the main student, is missing");
});

test("a copy that lost its members is reopened, not copied a second time", async () => {
    const db = await database({ fixed: true });
    const { ali, task2 } = await lesson(db);
    const copy = await startFollowOn(db, ali, "HAZ1");
    await db.query("delete from submission_members where submission_id = $1", [copy]);

    assert.equal(await startFollowOn(db, ali, "HAZ1"), copy);
    assert.deepEqual(await memberIds(db, copy), [ali.id]);
    assert.equal(await mapsIn(db, task2), 1);
});

test("check.sql passes after the fix, and undo.sql runs cleanly", async () => {
    const db = await database();
    const { ali } = await lesson(db);
    await startFollowOn(db, ali, "HAZ1");
    await db.exec(FIX);

    const results = await db.query(CHECK);
    for (const row of results.rows) {
        assert.equal(row.ok, true, row.item);
    }

    await db.exec(UNDO);
    const helper = await one(db,
        "select count(*)::int as n from pg_proc where proname = 'oe_link_follow_on_members'");
    assert.equal(helper.n, 0);
});
