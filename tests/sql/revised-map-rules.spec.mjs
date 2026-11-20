// Issues #36 and #40: when a Revised Map can be started.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../../", import.meta.url);
const sql = (path) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");

const SCHEMA = sql("tests/sql/schema.sql");
const FOLLOW_ON_TASKS = sql("docs/sql/follow-on-tasks/apply.sql");
const VERDICTS = sql("docs/sql/review-verdicts/apply.sql");
const APPLY = sql("docs/sql/revised-map-rules/apply.sql");
const CHECK = sql("docs/sql/revised-map-rules/check.sql");
const UNDO = sql("docs/sql/revised-map-rules/undo.sql");

async function one(db, query, params = []) {
    return (await db.query(query, params)).rows[0];
}

// A Task with one handed-in map, Reviewed with the given verdict (or none).
async function lesson(verdict) {
    const db = new PGlite();
    await db.exec(SCHEMA);
    await db.exec(FOLLOW_ON_TASKS);
    await db.exec(VERDICTS);
    await db.exec(APPLY);
    const { id: task } = await one(db, "insert into tasks (task_code) values ('MAP1') returning id");
    const { id: original } = await one(db,
        "insert into submissions (task_id, status, class_name) values ($1, 'submitted', 'TG1') returning id", [task]);
    if (verdict) {
        await db.query("insert into submission_reviews (submission_id, verdict) values ($1, $2)", [original, verdict]);
    }
    const startRevisedMap = () =>
        db.query(`insert into submissions (task_id, status, class_name, submission_number, parent_submission_id)
                  values ($1, 'draft', 'TG1', 2, $2)`, [task, original]);
    return { db, task, original, startRevisedMap };
}

test("a Returned map can have a Revised Map", async () => {
    const { startRevisedMap } = await lesson("returned");
    await startRevisedMap();
});

test("an Approved map can't have a Revised Map", async () => {
    const { startRevisedMap } = await lesson("approved");
    await assert.rejects(startRevisedMap(), /REVISED_MAP_NOT_RETURNED/);
});

test("a map with no Review can't have a Revised Map", async () => {
    const { startRevisedMap } = await lesson(null);
    await assert.rejects(startRevisedMap(), /REVISED_MAP_NOT_RETURNED/);
});

test("maps that aren't Revised Maps are not affected", async () => {
    const { db, task } = await lesson(null);
    await db.query("insert into submissions (task_id, status, class_name) values ($1, 'draft', 'TG1')", [task]);
});

test("check.sql passes, and undo.sql lets any map have a Revised Map again", async () => {
    const { db, startRevisedMap } = await lesson("approved");
    for (const row of (await db.query(CHECK)).rows) {
        assert.equal(row.ok, true, row.item);
    }
    await db.exec(UNDO);
    await startRevisedMap();
});
