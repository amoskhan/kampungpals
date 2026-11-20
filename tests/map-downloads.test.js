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
