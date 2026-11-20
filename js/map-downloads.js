/*
Map downloads for Teachers: saving handed-in maps to print.
See GitHub issue #20 (spec) and #15-#19 (tickets).
*/

// Only a handed-in map (Submitted or Marked) can be downloaded.
function canDownloadMap(
    submission
) {
    return Boolean(submission) &&
        submission.status !== "draft";
}

// A file name that is safe on Windows, macOS, iPadOS and ChromeOS.
function safePrintFileName(
    text
) {
    const cleaned =
        String(text || "")
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^\.+|\.+$/g, "")
            .slice(0, 150)
            .trim();

    return cleaned || "map";
}

/*
The line printed above a map, and the file name it is saved under:
  heading:  "Amir, Bea · TG1 · School map"
  fileBase: "TG1 - Amir, Bea - School map"   (no extension)
A Group is named by all its members; a student working alone by their name.
*/
function printableMapLabel(
    submission,
    taskTitle
) {
    const names =
        String(
            submission?.group_name ||
            submission?.student_name ||
            ""
        ).trim() ||
        "Student";

    const className =
        String(submission?.class_name || "").trim();

    const title =
        String(taskTitle || "").trim() ||
        "Untitled Task";

    const parts =
        [names, className, title].filter(Boolean);

    return {
        heading:
            parts.join(" · "),
        fileBase:
            safePrintFileName(
                [className, names, title]
                    .filter(Boolean)
                    .join(" - ")
            )
    };
}

// The formats a Teacher can choose for a downloaded map.
const MAP_FORMATS = {
    png: {
        label: "PNG",
        extension: "png",
        type: "image/png"
    },
    jpeg: {
        label: "JPEG",
        extension: "jpg",
        type: "image/jpeg"
    },
    pdf: {
        label: "PDF",
        extension: "pdf",
        type: "application/pdf"
    }
};

/*
Where a map picture goes on one A4 landscape page (297 × 210 mm), in mm:
as large as fits inside the margin, keeping its shape, centred.
*/
function a4LandscapePlacement(
    imageWidth,
    imageHeight,
    margin = 10
) {
    const pageWidth = 297;
    const pageHeight = 210;
    const roomWidth = pageWidth - 2 * margin;
    const roomHeight = pageHeight - 2 * margin;

    const scale =
        Math.min(
            roomWidth / imageWidth,
            roomHeight / imageHeight
        );

    const width = imageWidth * scale;
    const height = imageHeight * scale;

    return {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height
    };
}

if (
    typeof module !== "undefined"
) {
    module.exports = {
        MAP_FORMATS,
        a4LandscapePlacement,
        canDownloadMap,
        printableMapLabel,
        safePrintFileName
    };
}
