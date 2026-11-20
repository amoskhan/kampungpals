/*
Opens the real app in a test browser with Supabase replaced by
fake-supabase.js, and gives tests the steps they share.
*/
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const APP_URL = "http://kampungpals.test/";

const fakeSupabase = fs.readFileSync(
    path.join(__dirname, "fake-supabase.js"),
    "utf8"
);

/*
setup runs in the page before the app loads, with arg, and fills in
window.fakeSupabase (tables and rpc replies).
*/
async function openApp(page, setup = () => {}, arg = null) {
    const errors = [];

    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.dismiss());

    await page.route("**/*", route => {
        const url = new URL(route.request().url());

        if (url.host === "cdn.jsdelivr.net" && url.pathname.includes("supabase")) {
            return route.fulfill({
                contentType: "text/javascript",
                body: fakeSupabase
            });
        }

        // Nothing leaves the test browser.
        if (url.origin + "/" !== APP_URL) {
            return route.fulfill({ body: "" });
        }

        const file = path.join(
            ROOT,
            decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)
        );

        if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
            return route.fulfill({ status: 404, body: "" });
        }

        return route.fulfill({ path: file });
    });

    await page.addInitScript(
        ([source, value]) => {
            window.fakeSupabase = { tables: {}, rpc: {} };
            new Function("arg", `(${source})(arg);`)(value);
        },
        [setup.toString(), arg]
    );

    await page.goto(APP_URL);

    return errors;
}

async function signInAsTeacher(page) {
    await page.evaluate(async () => {
        currentTeacherUser = { id: "teacher-1", email: "teacher@moe.edu.sg" };
        await openTeacherDashboard();
    });
}

/*
Opens a Project as a registered student or a Guest, as the app does after
the student enters a Task Code and chooses their name.
*/
async function openProjectAsLearner(page, submissionId, identity = "registered") {
    await page.evaluate(
        async ([id, type]) => {
            currentIdentityType = type;

            if (type === "guest") {
                currentGuestProfile = { guest_id: "guest-1", guest_name: "Guest", class_name: "TG1" };
            } else {
                currentStudentProfile = { student_id: "student-1", student_name: "Ali", class_name: "TG1" };
            }

            startupModal.hidden = true;
            await loadStudentProject(id);
        },
        [submissionId, identity]
    );
}

/*
Drags out a freehand Landmark in the middle of the map. Returns how many
Landmarks the map has afterwards.
*/
async function drawLandmark(page) {
    await page.evaluate(() => setTool("freehand"));

    const box = await page.locator("#drawingCanvas").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let step = 1; step <= 12; step++) {
        await page.mouse.move(
            x + 8 * step,
            y + (step % 2 ? 30 : -30) + 3 * step
        );
    }

    await page.mouse.move(x, y + 4);
    await page.mouse.up();

    return page.evaluate(() => shapes.length);
}

module.exports = {
    openApp,
    signInAsTeacher,
    openProjectAsLearner,
    drawLandmark
};
