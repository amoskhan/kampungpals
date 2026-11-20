// Issue #38: a student absent from the earlier lesson joins a Group; nobody
// starts a Follow-on map blank.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const sql = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

const SCRIPTS = [
    "tests/sql/schema.sql",
    "docs/sql/follow-on-tasks/apply.sql",
    "docs/sql/follow-on-fixes/apply.sql",
    "docs/sql/follow-on-members/live-lookup.sql",
    "docs/sql/follow-on-members/apply.sql",
    "docs/sql/follow-on-groups/apply.sql"
].map(sql);
const CHECK = sql("docs/sql/follow-on-groups/check.sql");
const UNDO = sql("docs/sql/follow-on-groups/undo.sql");

const CLASS = "00000000-0000-0000-0000-00000000c1a5";

async function one(db, query, params = []) {
    return (await db.query(query, params)).rows[0];
}

async function signIn(db, uid) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
}

/*
Task MAP1 and its Follow-on Task HAZ1, for one Class:
  Ali       a handed-in map, working alone
  Bea, Cam  one handed-in map together
  Dan       absent: no map
*/
async function lesson() {
    const db = new PGlite();
    for (const script of SCRIPTS) {
        await db.exec(script);
    }

    const student = async (name, register) => {
        const { id } = await one(db,
            "insert into students (class_id, student_name, register_no) values ($1, $2, $3) returning id",
            [CLASS, name, register]);
        const { uid } = await one(db, "select gen_random_uuid() as uid");
        await db.query("insert into student_sessions (auth_uid, student_id) values ($1, $2)", [uid, id]);
        return { id, uid, name };
    };

    const ali = await student("Ali", 1);
    const bea = await student("Bea", 2);
    const cam = await student("Cam", 3);
    const dan = await student("Dan", 4);

    const task = async (code, followsOn = null) => {
        const { id } = await one(db,
            "insert into tasks (task_code, allow_guests) values ($1, true) returning id", [code]);
        await db.query("insert into task_classes (task_id, class_id) values ($1, $2)", [id, CLASS]);
        if (followsOn) {
            await db.query("update tasks set follows_on_task_id = $1 where id = $2", [followsOn, id]);
        }
        return id;
    };

    const task1 = await task("MAP1");
    const task2 = await task("HAZ1", task1);

    const map = async (members) => {
        const { id } = await one(db, `
            insert into submissions (task_id, student_name, class_name, map_data, status, class_id, primary_student_id)
            values ($1, $2, 'TG1', '{}', 'submitted', $3, $4) returning id`,
            [task1, members.map((m) => m.name).join(", "), CLASS, members[0].id]);
        for (const [i, m] of members.entries()) {
            await db.query(
                "insert into submission_members (submission_id, student_id, is_creator) values ($1, $2, $3)",
                [id, m.id, i === 0]);
        }
        return id;
    };

    await map([ali]);
    await map([bea, cam]);

    const start = async (s) => {
        await signIn(db, s.uid);
        return (await one(db, "select student_start_follow_on_project('HAZ1', $1) as id", [s.id])).id;
    };

    const groups = async (s) => {
        await signIn(db, s.uid);
        return (await db.query("select * from student_list_follow_on_groups('HAZ1', $1)", [s.id])).rows;
    };

    const join = async (s, submissionId) => {
        await signIn(db, s.uid);
        return (await one(db,
            "select student_join_follow_on_group('HAZ1', $1, $2) as id", [s.id, submissionId])).id;
    };

    return { db, ali, bea, cam, dan, task1, task2, start, groups, join };
}

test("a student with no earlier map can't start a blank Follow-on map", async () => {
    const { dan, start } = await lesson();
    await assert.rejects(start(dan), /NO_EARLIER_MAP/);
});

test("a student with no earlier map sees the Groups whose Follow-on map has started", async () => {
    const { ali, bea, dan, start, groups } = await lesson();
    assert.deepEqual(await groups(dan), [], "nobody has started yet");

    const aliCopy = await start(ali);
    const groupCopy = await start(bea);

    assert.deepEqual(
        (await groups(dan)).map((g) => [g.submission_id, g.group_name]).sort(),
        [[aliCopy, "Ali"], [groupCopy, "Bea, Cam"]].sort()
    );
    assert.deepEqual(await groups(ali), [], "Ali had an earlier map, so he has his own copy");
});

test("joining a Group makes the student a member, and reopening the Task opens that map", async () => {
    const { db, bea, dan, start, join } = await lesson();
    const groupCopy = await start(bea);

    assert.equal(await join(dan, groupCopy), groupCopy);

    const { rows } = await db.query(
        "select student_id from submission_members where submission_id = $1", [groupCopy]);
    assert.ok(rows.some((r) => r.student_id === dan.id));
    assert.equal((await one(db, "select group_name from submissions where id = $1", [groupCopy])).group_name,
        "Bea, Cam, Dan");
    assert.equal(await start(dan), groupCopy);
});

test("a student can't join a handed-in map, or join twice", async () => {
    const { db, ali, bea, dan, start, join } = await lesson();
    const aliCopy = await start(ali);
    const groupCopy = await start(bea);
    await db.query("update submissions set status = 'submitted' where id = $1", [aliCopy]);

    await assert.rejects(join(dan, aliCopy), /can't join this Group/);
    await join(dan, groupCopy);
    await assert.rejects(join(dan, groupCopy), /can't join this Group/);
});

test("a student who had an earlier map can't join another Group", async () => {
    const { ali, bea, start, join } = await lesson();
    const groupCopy = await start(bea);
    await assert.rejects(join(ali, groupCopy), /can't join this Group/);
});

test("a Guest with no earlier map can't take part", async () => {
    const { db } = await lesson();
    const { uid } = await one(db, "select gen_random_uuid() as uid");
    await db.query("insert into guest_profiles (auth_uid) values ($1)", [uid]);
    await signIn(db, uid);

    await assert.rejects(
        db.query("select guest_start_follow_on_project('HAZ1')"),
        /NO_EARLIER_MAP/
    );
});

test("check.sql passes, and undo.sql brings back the blank start", async () => {
    const { db, dan, start } = await lesson();
    for (const row of (await db.query(CHECK)).rows) {
        assert.equal(row.ok, true, row.item);
    }

    await db.exec(UNDO);
    // The blank start hands over to student_start_group_project again.
    await assert.rejects(start(dan), /student_start_group_project is not part of these tests/);
});
