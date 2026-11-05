/*
Reference Fit: how a Reference Map fills the student's map area.

A Task's fit is "stretch", "keep" or "crop". A cropped Task can hold one crop
per device: { x, y, zoom }, where x and y say which part of the image to show
as percentages, and zoom is how far it is enlarged.
*/
const REFERENCE_FIT_STYLES = {
    stretch: "fill",
    keep: "contain",
    crop: "cover"
};

// Shapes of the student's map area, measured on each device.
const REFERENCE_DEVICES = [
    { key: "iphone", width: 370, height: 514 },
    { key: "iphone-sideways", width: 810, height: 514 },
    { key: "ipad-upright", width: 786, height: 514 },
    { key: "ipad-sideways", width: 1146, height: 480 },
    { key: "computer", width: 1332, height: 558 }
];

// A sideways iPad and a computer have the same shape, so width separates them.
const REFERENCE_SIDEWAYS_IPAD_MAX_WIDTH = 1250;

// A sideways iPhone and an upright iPad have nearly the same map area, but only
// the phone has a screen this short.
const REFERENCE_SIDEWAYS_PHONE_MAX_SCREEN_HEIGHT = 600;

const REFERENCE_MAX_ZOOM = 4;

function clampReferenceValue(
    value,
    min,
    max,
    fallback
) {
    const number =
        Number(value);

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(number)
    ) {
        return fallback;
    }

    return Math.min(
        max,
        Math.max(
            min,
            number
        )
    );
}

function normaliseReferenceCrop(
    crop
) {
    return {
        x:
            clampReferenceValue(
                crop?.x,
                0,
                100,
                50
            ),
        y:
            clampReferenceValue(
                crop?.y,
                0,
                100,
                50
            ),
        zoom:
            clampReferenceValue(
                crop?.zoom,
                1,
                REFERENCE_MAX_ZOOM,
                1
            )
    };
}

function isReferenceCropAdjusted(
    crop
) {
    const {
        x,
        y,
        zoom
    } = normaliseReferenceCrop(crop);

    return (
        x !== 50 ||
        y !== 50 ||
        zoom !== 1
    );
}

/*
Styles for the image. Zooming about the same point the image is positioned at
means x and y reach exactly from one edge of the image to the other.
*/
function referenceImageStyle(
    fit,
    crop
) {
    const objectFit =
        REFERENCE_FIT_STYLES[fit] ||
        REFERENCE_FIT_STYLES.stretch;

    if (
        objectFit !== REFERENCE_FIT_STYLES.crop
    ) {
        return {
            objectFit,
            objectPosition: "",
            transform: "",
            transformOrigin: ""
        };
    }

    const {
        x,
        y,
        zoom
    } = normaliseReferenceCrop(crop);

    const point =
        `${x}% ${y}%`;

    return {
        objectFit,
        objectPosition: point,
        transform: `scale(${zoom})`,
        transformOrigin: point
    };
}

/*
Which device's crop suits a student's map area. Closest shape wins, because
other devices, such as an Android tablet, have no crop of their own.
*/
function referenceDeviceForMap(
    width,
    height,
    screenHeight
) {
    if (
        !(width > 0) ||
        !(height > 0)
    ) {
        return "computer";
    }

    const ratio =
        width / height;

    const distance =
        device =>
            Math.abs(
                device.width / device.height -
                ratio
            );

    const closest =
        REFERENCE_DEVICES.reduce(
            (best, device) =>
                distance(device) < distance(best)
                    ? device
                    : best
        );

    if (
        closest.key === "ipad-sideways" ||
        closest.key === "computer"
    ) {
        return width < REFERENCE_SIDEWAYS_IPAD_MAX_WIDTH
            ? "ipad-sideways"
            : "computer";
    }

    if (
        closest.key === "iphone-sideways" ||
        closest.key === "ipad-upright"
    ) {
        return screenHeight > 0 &&
            screenHeight < REFERENCE_SIDEWAYS_PHONE_MAX_SCREEN_HEIGHT
            ? "iphone-sideways"
            : "ipad-upright";
    }

    return closest.key;
}

/*
The crop after dragging by dx, dy pixels, so that the image follows the pointer.
*/
function dragReferenceCrop({
    crop,
    dx,
    dy,
    frameWidth,
    frameHeight,
    imageWidth,
    imageHeight
}) {
    const current =
        normaliseReferenceCrop(crop);

    if (
        !(imageWidth > 0) ||
        !(imageHeight > 0)
    ) {
        return current;
    }

    const scale =
        Math.max(
            frameWidth / imageWidth,
            frameHeight / imageHeight
        ) * current.zoom;

    const move =
        (position, change, frame, image) => {
            const hidden =
                image * scale -
                frame;

            return hidden > 0.5
                ? clampReferenceValue(
                    position -
                    change / hidden * 100,
                    0,
                    100,
                    position
                )
                : position;
        };

    return {
        x:
            move(
                current.x,
                dx,
                frameWidth,
                imageWidth
            ),
        y:
            move(
                current.y,
                dy,
                frameHeight,
                imageHeight
            ),
        zoom:
            current.zoom
    };
}

if (
    typeof module !== "undefined"
) {
    module.exports = {
        REFERENCE_DEVICES,
        REFERENCE_MAX_ZOOM,
        normaliseReferenceCrop,
        isReferenceCropAdjusted,
        referenceImageStyle,
        referenceDeviceForMap,
        dragReferenceCrop
    };
}
