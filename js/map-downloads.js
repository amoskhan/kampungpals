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

/*
The maps Download all saves: for each student or Group, their newest
handed-in map (a handed-in Revised Map before the map it revises), with the
heading and a file name that is unique within the folder.

A student or Group is recognised by the students listed on the map, or, for
a map with nobody listed (such as a Guest's), by its Class and name, the same
way the Gallery tells them apart.
  projects: { id, status, submission_number, updated_at, submitted_at,
              class_name, group_name, student_name }
  members:  { submission_id, student_id }
*/
function mapsToDownload({
    projects,
    members,
    taskTitle
}) {
    const studentsOn =
        new Map();

    (members || []).forEach(
        member => {
            if (!studentsOn.has(member.submission_id)) {
                studentsOn.set(member.submission_id, []);
            }

            studentsOn.get(member.submission_id).push(String(member.student_id));
        }
    );

    const ownerOf =
        project => {
            const ids =
                (studentsOn.get(project.id) || []).slice().sort();

            if (ids.length) {
                return `members:${ids.join(",")}`;
            }

            return [
                "fallback",
                String(project.class_name || "").trim().toLowerCase(),
                String(project.group_name || project.student_name || "").trim().toLowerCase(),
                project.id
            ].join(":");
        };

    const newer =
        (a, b) =>
            Number(a.submission_number || 1) - Number(b.submission_number || 1) ||
            new Date(a.updated_at || a.submitted_at || 0) - new Date(b.updated_at || b.submitted_at || 0);

    const chosen =
        new Map();

    (projects || [])
        .filter(canDownloadMap)
        .forEach(
            project => {
                const owner =
                    ownerOf(project);

                const current =
                    chosen.get(owner);

                if (!current || newer(project, current) > 0) {
                    chosen.set(owner, project);
                }
            }
        );

    const used =
        new Map();

    return [...chosen.values()]
        .map(
            submission => ({
                submission,
                ...printableMapLabel(submission, taskTitle)
            })
        )
        .sort(
            (a, b) =>
                String(a.submission.class_name || "").localeCompare(String(b.submission.class_name || "")) ||
                a.fileBase.localeCompare(b.fileBase)
        )
        .map(
            file => {
                const key =
                    file.fileBase.toLowerCase();

                const count =
                    (used.get(key) || 0) + 1;

                used.set(key, count);

                return count === 1
                    ? file
                    : { ...file, fileBase: `${file.fileBase} (${count})` };
            }
        );
}

if (
    typeof module !== "undefined"
) {
    module.exports = {
        MAP_FORMATS,
        a4LandscapePlacement,
        canDownloadMap,
        mapsToDownload,
        printableMapLabel,
        safePrintFileName
    };
}
