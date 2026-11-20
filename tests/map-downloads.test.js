const test = require("node:test");
const assert = require("node:assert/strict");
const {
    MAP_FORMATS,
    a4LandscapePlacement,
    canDownloadMap,
    printableMapLabel,
    safePrintFileName
} = require("../js/map-downloads.js");

test("only a handed-in map can be downloaded", () => {
    assert.equal(canDownloadMap({ status: "submitted" }), true);
    assert.equal(canDownloadMap({ status: "draft" }), false);
    assert.equal(canDownloadMap(null), false);
});

test("a student's map is labelled with their name, Class and Task", () => {
    const label = printableMapLabel(
        { student_name: "Muhammad Akid Durrani Bin Imran", class_name: "TG1", group_name: null },
        "NIE First Floor Mapping"
    );

    assert.equal(label.heading, "Muhammad Akid Durrani Bin Imran · TG1 · NIE First Floor Mapping");
    assert.equal(label.fileBase, "TG1 - Muhammad Akid Durrani Bin Imran - NIE First Floor Mapping");
});

test("a Group's map is labelled with every member", () => {
    const label = printableMapLabel(
        { student_name: "Amir", class_name: "TG1", group_name: "Amir, Bea" },
        "School map"
    );

    assert.equal(label.heading, "Amir, Bea · TG1 · School map");
    assert.equal(label.fileBase, "TG1 - Amir, Bea - School map");
});

test("missing details fall back to something readable", () => {
    const label = printableMapLabel({}, "");

    assert.equal(label.heading, "Student · Untitled Task");
    assert.equal(label.fileBase, "Student - Untitled Task");
});

test("file names are safe on every computer", () => {
    assert.equal(safePrintFileName("TG1 - A/B: \"C\" <D>? *E* | F\\G"), "TG1 - A-B- -C- -D-- -E- - F-G");
    assert.equal(safePrintFileName("  lots   of   space  "), "lots of space");
    assert.equal(safePrintFileName("..."), "map");
    assert.equal(safePrintFileName("x".repeat(300)).length, 150);
});

test("the Teacher can choose PNG, JPEG or PDF", () => {
    assert.deepEqual(Object.keys(MAP_FORMATS), ["png", "jpeg", "pdf"]);
    assert.equal(MAP_FORMATS.jpeg.extension, "jpg");
    assert.equal(MAP_FORMATS.pdf.type, "application/pdf");
});

test("a wide map fills the width of an A4 landscape page, centred", () => {
    const place = a4LandscapePlacement(1600, 900);
    assert.ok(Math.abs(place.width - 277) < 1e-9);
    assert.ok(Math.abs(place.height - 155.8125) < 1e-9);
    assert.ok(Math.abs(place.x - 10) < 1e-9);
    assert.ok(Math.abs(place.y - (210 - place.height) / 2) < 1e-9);
});

test("a tall map fills the height instead, and nothing is cut off", () => {
    const place = a4LandscapePlacement(1600, 1400);
    assert.ok(Math.abs(place.height - 190) < 1e-9);
    assert.ok(place.width <= 277);
    assert.ok(place.x >= 10 && place.x + place.width <= 287 + 1e-9);
});

const { mapsToDownload } = require("../js/map-downloads.js");

const project = (id, extra) => ({
    id, status: "submitted", submission_number: 1, class_name: "TG1",
    student_name: "Amir", group_name: null, updated_at: "2026-11-20T09:00:00Z", ...extra
});

test("Download all has one file per handed-in map, leaving out drafts", () => {
    const files = mapsToDownload({
        taskTitle: "School map",
        projects: [
            project("p1", { student_name: "Amir", group_name: "Amir, Bea" }),
            project("p2", { student_name: "Cai", status: "draft" }),
            project("p3", { student_name: "Dan" })
        ],
        members: [
            { submission_id: "p1", student_id: "amir" }, { submission_id: "p1", student_id: "bea" },
            { submission_id: "p2", student_id: "cai" },
            { submission_id: "p3", student_id: "dan" }
        ]
    });

    assert.deepEqual(files.map(file => file.submission.id), ["p1", "p3"]);
    assert.deepEqual(files.map(file => file.fileBase), ["TG1 - Amir, Bea - School map", "TG1 - Dan - School map"]);
    assert.equal(files[0].heading, "Amir, Bea · TG1 · School map");
});

test("a Group with a handed-in Revised Map gives the Revised Map", () => {
    const files = mapsToDownload({
        taskTitle: "School map",
        projects: [
            project("marked", { updated_at: "2026-11-20T09:00:00Z" }),
            project("revised", { submission_number: 2, updated_at: "2026-11-20T08:00:00Z" })
        ],
        members: [
            { submission_id: "marked", student_id: "amir" },
            { submission_id: "revised", student_id: "amir" }
        ]
    });

    assert.deepEqual(files.map(file => file.submission.id), ["revised"]);
});

test("a Revised Map still in draft gives the Marked map instead", () => {
    const files = mapsToDownload({
        taskTitle: "School map",
        projects: [
            project("marked"),
            project("revised", { submission_number: 2, status: "draft" })
        ],
        members: [
            { submission_id: "marked", student_id: "amir" },
            { submission_id: "revised", student_id: "amir" }
        ]
    });

    assert.deepEqual(files.map(file => file.submission.id), ["marked"]);
});

test("Guests and maps with no members listed are still included", () => {
    const files = mapsToDownload({
        taskTitle: "School map",
        projects: [
            project("g1", { class_name: "Guest", student_name: "Zara" }),
            project("lonely", { student_name: "Eve" })
        ],
        members: []
    });

    assert.deepEqual(files.map(file => file.fileBase), ["Guest - Zara - School map", "TG1 - Eve - School map"]);
});

test("two files that would have the same name are numbered", () => {
    const files = mapsToDownload({
        taskTitle: "School map",
        projects: [project("a", { student_name: "Amir" }), project("b", { student_name: "Amir" })],
        members: [{ submission_id: "a", student_id: "amir-1" }, { submission_id: "b", student_id: "amir-2" }]
    });

    assert.deepEqual(files.map(file => file.fileBase).sort(), ["TG1 - Amir - School map", "TG1 - Amir - School map (2)"]);
});

test("files are listed by Class, then name", () => {
    const files = mapsToDownload({
        taskTitle: "T",
        projects: [
            project("x", { class_name: "TG2", student_name: "Ann" }),
            project("y", { class_name: "TG1", student_name: "Zed" }),
            project("z", { class_name: "TG1", student_name: "Bob" })
        ],
        members: [
            { submission_id: "x", student_id: "1" }, { submission_id: "y", student_id: "2" }, { submission_id: "z", student_id: "3" }
        ]
    });

    assert.deepEqual(files.map(file => file.submission.id), ["z", "y", "x"]);
});
