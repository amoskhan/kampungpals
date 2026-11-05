/*
Project Access: what may be done with a Project, given the facts about it.

status     the Project's saved status, "draft" or "submitted"
hasReview  whether a Teacher has saved a Review for it
isEditor   true if this device is the Editor, false if it is another
           student's device, left out when a Teacher is looking at it

Any saved Review counts as Marked and handed in, so a mismatch between the
status and the Review always locks the Project rather than leaving it open.
*/
function projectAccess({
    status,
    hasReview = false,
    isEditor
} = {}) {
    const marked =
        Boolean(hasReview);

    const handedIn =
        marked ||
        status === "submitted";

    const state =
        marked
            ? "marked"
            : handedIn
                ? "submitted"
                : isEditor === false
                    ? "view-only"
                    : "drawing";

    const presentation = {
        marked: {
            label: "Marked",
            className: "marked",
            lockedMessage:
                "This map has been marked, so it can't be changed now."
        },
        submitted: {
            label: "Submitted",
            className: "submitted",
            lockedMessage:
                "This map has been handed in, so it can't be changed now."
        },
        "view-only": {
            label: "View-only",
            className: "",
            lockedMessage: null
        },
        drawing: {
            label: "Drawing",
            className: "",
            lockedMessage: null
        }
    };

    return {
        state,
        marked,
        handedIn,
        canDraw:
            !handedIn &&
            isEditor === true,
        teacherCanMark:
            handedIn,
        statusWord:
            handedIn
                ? "submitted"
                : "draft",
        ...presentation[state]
    };
}

/*
The same answer for a row from a Teacher's list of Projects.
*/
function submissionAccess(
    submission
) {
    return projectAccess({
        status:
            submission?.status,
        hasReview:
            Boolean(
                submission?.reviewed_at
            )
    });
}

if (
    typeof module !== "undefined"
) {
    module.exports = {
        projectAccess,
        submissionAccess
    };
}
