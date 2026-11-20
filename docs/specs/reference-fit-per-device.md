# Spec: Reference Fit for each device

Status: agreed · Front end only (no Supabase changes) · Tracked in [issue #10](https://github.com/amoskhan/kampungpals/issues/10)

## Problem Statement

A Teacher uploads a Reference Map, usually a wide rectangle, and students open it on iPhones, iPads and computers. Today the Teacher picks one Reference Fit (Stretch, Keep shape or Crop) for the whole Task. Only the crop can differ between devices. A fit that looks right on a computer can look squashed or tiny on an upright iPhone, and the Teacher cannot fix it for that device alone. The panel is also hard to work with:

- The three fit cards stretch across the page, far from the preview.
- The selected device is marked only by a slightly darker border.
- The large preview has no label saying which device is being edited.
- "Not adjusted" in small grey text is the only sign of which devices have been set.

## Solution

The Teacher chooses the Reference Fit separately for an iPhone and an iPad, each upright or sideways, and for a computer. The panel is organised device first:

```
Reference Fit
[iPhone] [iPhone sideways] [iPad] [iPad sideways] [Computer]   ← simple device outlines, each
  Crop       Keep             Stretch   Crop          Crop        showing that device's real look

Editing: iPhone upright
[ Stretch | Keep shape | Crop ]   (Use this for all devices)
┌─────────┐
│  large  │   Drag to move · Zoom ──●── · Reset   ← only when Crop is chosen
│ preview │
└─────────┘
```

Any other device, such as an Android tablet, follows the fit and crop of whichever of the five is closest to its shape.

## User Stories

1. As a Teacher, I want to choose Stretch, Keep shape or Crop separately for each device, so that the Reference Map looks right on every device my students use.
2. As a Teacher, I want each device shown as a simple phone, tablet or laptop outline with a one-line label, so that I recognise it at a glance.
3. As a Teacher, I want each device outline to show exactly how the Reference Map looks on that device, with its fit written underneath, so that I can compare devices without clicking each one.
4. As a Teacher, I want the device I am editing to be clearly highlighted and named above the large preview ("Editing: iPhone upright"), so that I always know which device my changes affect.
5. As a Teacher, I want the fit choice as one compact button bar right next to the large preview, so that I can switch fits quickly.
6. As a Teacher, I want a "Use this for all devices" button, so that I can set every device in one click when I don't care about the differences.
7. As a Teacher, I want "Use this for all devices" to copy only the fit and not the crop, so that each device keeps a crop suited to its own shape.
8. As a Teacher, I want the large preview drawn in an outline of the device's real shape, so that I see exactly what a student sees.
9. As a Teacher, I want to drag to move the crop, and zoom by pinch, scroll wheel or slider, so that cropping feels natural on an iPad, a trackpad or a mouse.
10. As a Teacher, I want the device outline to update live while I drag or zoom, and a change of fit to ease in rather than jump, so that the panel feels smooth.
11. As a Teacher, I want a device to remember its crop when I switch away from Crop and back, so that I never lose careful work.
12. As a Teacher, I want a small dot on every device I have changed but not saved, and one Save Task Settings button that saves everything, so that I know what still needs saving.
13. As a Teacher setting up a Task on my phone, I want the row of devices to scroll sideways and keep the selected one in view, so that the panel still fits my screen.
14. As a Teacher with Tasks saved before this change, I want every device to use the Task's old fit and keep its saved crop, so that nothing changes for students until I change it.
15. As a Teacher creating a new Task, I want every device to start on Keep shape, so that the whole image shows until I decide otherwise.
16. As a student, I want the Reference Map to use the fit and crop the Teacher chose for my kind of device, so that it looks the way my Teacher intended.

## Implementation Decisions

- **Stored in the Task's allowed tools,** as now. A new `reference_fits` holds one fit per device key. The existing `reference_fit` stays as the fallback for any device without its own fit, so older Tasks behave as before. `reference_crops` is unchanged.
- **Crops are kept whatever the fit.** A crop saved for a device that is not on Crop is kept and has no effect until the device goes back to Crop. Uploading a new Reference Map still clears the crops but keeps the fits.
- **`js/reference-fit.js`** gains a function that works out a device's fit from the Task's allowed tools. Both the student overlay and the Teacher preview use it.
- **One Save** through the existing Save Task Settings button. The "Unsaved changes" note and the per-device dots compare against the last saved settings.
- **Follow-on Tasks** copy `reference_fits`, `reference_fit` and `reference_crops` along with the other allowed tools (see `follow-on-tasks.md`).

## Testing Decisions

- Unit tests in `tests/reference-fit.test.js` for each device's fit:
  - a per-device fit wins
  - the Task-wide fit is the fallback
  - unknown values fall back to Stretch
  - a crop has no effect when the device's fit is not Crop
- **Real-device checklist** with a TEST Task:
  1. Set a different fit on an upright iPhone and on a computer, then save.
  2. Open the Task on both devices and check each one.
  3. Turn the iPhone sideways and check that it switches to the sideways setting.
  4. Reload the Teacher page and check that the settings stayed.

## Out of Scope

- Planning several lessons ahead. Lesson continuation is handled by Follow-on Tasks, a separate piece of work.
- Rotating the Reference Map, or choosing a different image for each device.
