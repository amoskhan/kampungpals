// Issue #33: every Review is Approved or Returned.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const sql = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

const SCHEMA = sql("tests/sql/schema.sql");
const APPLY = sql("docs/sql/review-verdicts/apply.sql");
const CHECK = sql("docs/sql/review-verdicts/check.sql");
const UNDO = sql("docs/sql/review-verdicts/undo.sql");

async function one(db, query, params = []) {
    return (await db.query(query, params)).rows[0];
}

// A Task with two Reviewed maps: Ali's has a Revised Map, Bea's doesn't.
async function lesson() {
    const db = new PGlite();
    await db.exec(SCHEMA);
    const { id: task } = await one(db, "insert into tasks (task_code) values ('MAP1') returning id");
    const map = async (parent = null, number = 1) =>
        (await one(db, `insert into submissions (task_id, status, class_name, submission_number, parent_submission_id)
                        values ($1, 'submitted', 'TG1', $2, $3) returning id`, [task, number, parent])).id;
    const ali = await map();
    const bea = await map();
    await map(ali, 2);
    await db.query("insert into submission_reviews (submission_id, teacher_feedback) values ($1, 'Add the canteen'), ($2, '')", [ali, bea]);
    return { db, task, ali, bea, map };
}

const verdict = async (db, id) =>
    (await one(db, "select verdict from submission_reviews where submission_id = $1", [id])).verdict;

test("existing Reviews: Returned if a Revised Map was made, otherwise Approved", async () => {
    const { db, ali, bea } = await lesson();
    await db.exec(APPLY);

    assert.equal(await verdict(db, ali), "returned");
    assert.equal(await verdict(db, bea), "approved");
});

test("a Review saved without a verdict (an old page) is Returned", async () => {
    const { db, map } = await lesson();
    await db.exec(APPLY);
    const cam = await map();

    await db.query("insert into submission_reviews (submission_id, teacher_feedback) values ($1, 'ok')", [cam]);

    assert.equal(await verdict(db, cam), "returned");
});

test("only Approved or Returned can be saved", async () => {
    const { db, bea } = await lesson();
    await db.exec(APPLY);

    await assert.rejects(
        db.query("update submission_reviews set verdict = 'great' where submission_id = $1", [bea]),
        /submission_reviews_verdict_check/
    );
});

test("a Teacher can switch between Approved and Returned until a Revised Map is started", async () => {
    const { db, ali, bea, map } = await lesson();
    await db.exec(APPLY);

    await db.query("update submission_reviews set verdict = 'returned' where submission_id = $1", [bea]);
    assert.equal(await verdict(db, bea), "returned");
    await db.query("update submission_reviews set verdict = 'approved' where submission_id = $1", [bea]);
    assert.equal(await verdict(db, bea), "approved");

    // Ali's Revised Map exists, so his Review stays Returned.
    await assert.rejects(
        db.query("update submission_reviews set verdict = 'approved' where submission_id = $1", [ali]),
        /REVISED_MAP_STARTED/
    );

    // Saving other changes to a Returned Review still works.
    await db.query("update submission_reviews set teacher_feedback = 'Add the canteen and hall' where submission_id = $1", [ali]);
    assert.equal(await verdict(db, ali), "returned");

    // Once Bea starts a Revised Map of a Returned map, it stays Returned too.
    await db.query("update submission_reviews set verdict = 'returned' where submission_id = $1", [bea]);
    await map(bea, 2);
    await assert.rejects(
        db.query("update submission_reviews set verdict = 'approved' where submission_id = $1", [bea]),
        /REVISED_MAP_STARTED/
    );
});

test("a student can read their verdict", async () => {
    const { db, ali, bea, map } = await lesson();
    await db.exec(APPLY);
    const unreviewed = await map();

    const read = async (id) => (await one(db, "select review_verdict($1) as v", [id])).v;
    assert.equal(await read(ali), "returned");
    assert.equal(await read(bea), "approved");
    assert.equal(await read(unreviewed), null);
});

test("check.sql passes, and undo.sql removes it all", async () => {
    const { db } = await lesson();
    await db.exec(APPLY);

    for (const row of (await db.query(CHECK)).rows) {
        assert.equal(row.ok, true, row.item);
    }

    await db.exec(UNDO);
    const column = await one(db, `select count(*)::int as n from information_schema.columns
                                  where table_name = 'submission_reviews' and column_name = 'verdict'`);
    assert.equal(column.n, 0);
});
