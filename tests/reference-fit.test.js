const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normaliseReferenceCrop,
    isReferenceCropAdjusted,
    referenceImageStyle,
    referenceDeviceForMap,
    dragReferenceCrop
} = require("../js/reference-fit.js");

test("Stretch and Keep shape ignore any crop", () => {
    const crop = { x: 10, y: 90, zoom: 3 };

    assert.deepEqual(referenceImageStyle("stretch", crop), {
        objectFit: "fill",
        objectPosition: "",
        transform: "",
        transformOrigin: ""
    });
    assert.equal(referenceImageStyle("keep", crop).objectFit, "contain");
    assert.equal(referenceImageStyle("keep", crop).transform, "");
});

test("an unknown fit falls back to Stretch", () => {
    assert.equal(referenceImageStyle("nonsense").objectFit, "fill");
    assert.equal(referenceImageStyle(undefined).objectFit, "fill");
});

test("Crop positions and zooms the image about the same point", () => {
    assert.deepEqual(referenceImageStyle("crop", { x: 20, y: 70, zoom: 2 }), {
        objectFit: "cover",
        objectPosition: "20% 70%",
        transform: "scale(2)",
        transformOrigin: "20% 70%"
    });
});

test("Crop with nothing saved is centred and not zoomed", () => {
    assert.deepEqual(referenceImageStyle("crop"), {
        objectFit: "cover",
        objectPosition: "50% 50%",
        transform: "scale(1)",
        transformOrigin: "50% 50%"
    });
});

test("saved crops are kept within limits", () => {
    assert.deepEqual(normaliseReferenceCrop({ x: -5, y: 200, zoom: 99 }), { x: 0, y: 100, zoom: 4 });
    assert.deepEqual(normaliseReferenceCrop({ zoom: 0 }), { x: 50, y: 50, zoom: 1 });
    assert.deepEqual(normaliseReferenceCrop({ x: "bad", y: null, zoom: "bad" }), { x: 50, y: 50, zoom: 1 });
    assert.deepEqual(normaliseReferenceCrop(null), { x: 50, y: 50, zoom: 1 });
});

test("only a moved or zoomed crop counts as adjusted", () => {
    assert.equal(isReferenceCropAdjusted(undefined), false);
    assert.equal(isReferenceCropAdjusted({ x: 50, y: 50, zoom: 1 }), false);
    assert.equal(isReferenceCropAdjusted({ x: 51, y: 50, zoom: 1 }), true);
    assert.equal(isReferenceCropAdjusted({ x: 50, y: 50, zoom: 1.5 }), true);
});

const measured = [
    ["iPhone upright", 370, 514, 844, "iphone"],
    ["iPhone sideways", 810, 514, 390, "iphone-sideways"],
    ["small iPhone sideways", 633, 514, 375, "iphone-sideways"],
    ["iPad upright", 786, 514, 1180, "ipad-upright"],
    ["iPad sideways", 1146, 480, 820, "ipad-sideways"],
    ["laptop", 1332, 558, 768, "computer"],
    ["desktop", 1886, 792, 1080, "computer"]
];

for (const [name, width, height, screenHeight, device] of measured) {
    test(`a ${name} map area gets the ${device} crop`, () => {
        assert.equal(referenceDeviceForMap(width, height, screenHeight), device);
    });
}

test("with no screen height, that shape counts as an upright iPad", () => {
    assert.equal(referenceDeviceForMap(810, 514), "ipad-upright");
});

test("a map area with no size yet gets the computer crop", () => {
    assert.equal(referenceDeviceForMap(0, 0), "computer");
});

// A 2000x1000 image in a 500x500 frame is scaled to 1000x500, so 500px hides.
const wideImage = { frameWidth: 500, frameHeight: 500, imageWidth: 2000, imageHeight: 1000 };

test("dragging right reveals more of the left of the image", () => {
    const moved = dragReferenceCrop({ crop: { x: 50, y: 50, zoom: 1 }, dx: 100, dy: 0, ...wideImage });
    assert.equal(moved.x, 30);
});

test("the image follows the pointer exactly at every zoom", () => {
    // At zoom 2 the image is 2000px wide, so 1500px hides and 150px is 10%.
    const moved = dragReferenceCrop({ crop: { x: 50, y: 50, zoom: 2 }, dx: 150, dy: 0, ...wideImage });
    assert.equal(moved.x, 40);
});

test("a direction with nothing hidden does not move", () => {
    const moved = dragReferenceCrop({ crop: { x: 50, y: 50, zoom: 1 }, dx: 0, dy: 300, ...wideImage });
    assert.equal(moved.y, 50);
});

test("dragging stops at the edge of the image", () => {
    const moved = dragReferenceCrop({ crop: { x: 50, y: 50, zoom: 1 }, dx: 5000, dy: 0, ...wideImage });
    assert.equal(moved.x, 0);
});

test("dragging keeps the zoom, and an image not loaded yet stays put", () => {
    assert.equal(dragReferenceCrop({ crop: { x: 50, y: 50, zoom: 3 }, dx: 10, dy: 0, ...wideImage }).zoom, 3);
    assert.deepEqual(
        dragReferenceCrop({ crop: { x: 20, y: 30, zoom: 2 }, dx: 50, dy: 50, frameWidth: 500, frameHeight: 500, imageWidth: 0, imageHeight: 0 }),
        { x: 20, y: 30, zoom: 2 }
    );
});
