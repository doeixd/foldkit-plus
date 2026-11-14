# #558 audit, items 3 to 5: findings (U-WP11)

Record of what was run against the shipped widgets and primitives for
reordering (item 3), overlays (item 4) and virtual lists, bottom-following,
spatial navigation, ranges and canvas (item 5). Design:
`551-558-ui-authoring-DESIGN.md` D22 and §10. Every row names the browser test
that holds its evidence; a test with "today" in its name asserts the behaviour
this note calls a gap, so the fix changes that assertion and nothing else.
`test.fails` marks a defect: it passes while the defect stands and goes red
when it is fixed.

Chromium build 1248, the `browser` project. Nothing here proposes a primitive
from a name in UI SDK's index; each gap is a behaviour a test observed.

## Summary

| # | Behaviour | Verdict | Severity | Fixed by |
| --- | --- | --- | --- | --- |
| R1 | Edge scrolling during a drag | missing | medium | U-WP13 (new) |
| R2 | A key path for a drag | missing | high | U-WP12 |
| R3 | Announcements for a drag | missing | medium | U-WP12 |
| R4 | A drop over a descendant of what is dragged | present, unguarded | low | U-WP12 (guard in `update`, doc) |
| R5 | Cross-list transfer | present | none | none |
| R6 | A press on empty space starts a selection | missing | low | U-WP13 (new) |
| R7 | A drop after the list scrolled under the pointer | present | none | none |
| O1 | Nested modal dialogs: Escape and focus return | present | none | none |
| O2 | A trigger removed while its dialog is open | wrong | medium | U-WP14 (new) |
| O3 | A portaled panel inherits a region's custom properties | wrong | medium | U-WP14 (new) |
| V1 | Focus in a virtual row that scrolls out | by design, undocumented | low | U-WP10 (guide), D12's recipe |
| V2 | Shift range over a virtual list | present, caller-fed | low | U-WP10 (guide) |
| V3 | `GridNavigation` against a wrapped layout | missing (spatial) | low | not built, see below |
| C1 | Bottom-following when the frame changes height | defect | medium | U-WP15 (new) |
| C2 | Bottom-following when a message above the end grows | present | none | none |

## Item 3: reorder, tree moves, transfers, announcements, edge scrolling

Evidence: `packages/primitives/test/audit-reorder.browser.test.ts`. A scrolling
box of twenty marked rows, a tree of nested marked nodes, two lists joined by
`targets`, and a canvas of absolutely placed nodes, driven with `PointerEvent`
dispatched at the element under each point (as a real pointer's target is).

**R1. Edge scrolling: missing.** A drag held 2px from the bottom of a 100px
box for 500ms started (`DragStarted`) and reported its place, and the box's
`scrollTop` stayed 0. `PointerDrag` has no scrolling code. A list longer than
its box cannot be reordered past the visible rows by pointer unless the
application scrolls it itself. Test: "does not scroll the list while a drag is
held at its edge (today: no edge scrolling)". A fix needs a scrolling ancestor
to move on a clock (an option of the Mount, the pointer's edge distance and a
speed); the drop's re-hit test (R7) already tolerates a moving list. Severity
medium: it blocks the work, and the workaround is per-application.

**R2. A key path: missing.** `keydown` of Space, Enter, ArrowDown, ArrowUp and
Escape on a focused marked row produced no fact. The Mount's header says so
(the keyboard's way is the parent's to give). A list that can be reordered
only with a pointer cannot be reordered with a keyboard, a switch device or a
screen reader. Test: "reports nothing for keys on a marked row (today: no
keyboard path)". Severity high (accessibility). Fixed by U-WP12 (`Reorder`).

**R3. Announcements: missing.** A whole drag (press, move, release) added no
node to the page and no `aria-live`, `role="status"` or `role="alert"` region
exists. `LiveAnnounce` is the existing owner of announcements, and nothing
connects a drag's facts to it. Test: "adds nothing to the page for a reader of
it during a drag (today: no announcement)". Severity medium. Fixed by U-WP12
(its `announce` helper over `LiveAnnounce`).

**R4. A descendant drop: present, unguarded.** Dragging a tree node `p` over
its own child `c` reported `DragDropped { id: 'p', over: { id: 'c' } }`. The
Mount reports "over itself is over nothing" only for the dragged id, so a
move that makes a node its own descendant arrives as an ordinary fact. The
design puts the meaning of a drop in the parent's `update`, which is right;
the gap is that nothing says so, and `Reorder` will carry the same fact.
Test: "reports a drop over a descendant of what is dragged, which only the
parent can refuse". Severity low. U-WP12 refuses it in `update` for the tree
form and documents it.

**What `place` needs (U-WP12's open question).** `{ id, zone: before | inside |
after, part? }` with the `region` flag is enough for list reorder, tree moves
(the application knows each node's parent, so `before` and `after` name the
target parent from the Model) and cross-list transfer (`targets`; R5). It does
not need to carry a parent or a list: an id is unique across the lists a drag
spans, and the zone is the position. What it lacks is a descendant check (R4),
which is the Model's. So `Reorder`'s `place` is `DragPlace` unchanged, plus
the keyboard's own steps (`before`/`after` an id, `inside` an id).

**R5. Cross-list transfer: present.** A row of list `from` dragged onto
`targets: { attribute: 'data-slot', within: '#to' }` reported the row of `to`
under the pointer with `region: true`, and released over `to`'s empty space
reported `over: null, region: true`. Test: "moves a row to another list
through `targets`, reporting its empty space as the region".

**R6. A press on empty space: missing.** A press on a canvas's empty area,
moved 100px, produced no fact: `PointerDrag` starts only from a marked
element. A marquee (lasso) selection has nothing to ride on. Test: "starts no
drag from a press on empty space (today: nothing a lasso could ride)". No
consumer in the tree needs it yet (the builder drags nodes). Per the repo's
scope rule this is built, not deferred for want of a consumer: a `Marquee`
fact stream (rectangle in container coordinates, and the marked ids it
touches) that shares `PointerDrag`'s press and Escape handling. Severity low.

**R7. A drop after a scroll: present.** A drop re-tests the pointer's position
at release, so a list scrolled 60px under a still pointer drops on the row now
beneath it, not the last one seen. Test: "drops where the pointer is let go
after the list scrolled under it, with no move between" (killed by deleting the
release's hit test, checked by hand).

Not audited: a touch hold-to-drag (needs the `browser-touch` project; the
Mount's unit tests cover its timing), and tree `TreeNavigation` collapse
focus (the design note's probes B2a to B2d already record it).

## Item 4: overlays

Evidence: `packages/mixins-ui/test/audit/dialog-nesting.browser.test.ts` and
`popover-theme.browser.test.ts`, on a real runtime with `@foldkit/ui`'s Dialog
and Popover. `Conformance.dialog` (U-WP7) does not exist yet; these are the
scenarios it should take.

**O1. Nested modal dialogs: present.** Outer opened, inner opened from inside
it: Escape closes the inner only, focus returns to the inner's opener inside
the outer, a second Escape closes the outer and focus returns to its opener.
Test: "Escape closes the inner dialog only, and focus returns to each opener in
turn".

**O2. A removed trigger: wrong.** With the outer dialog open, the view stopped
drawing its trigger; closing the dialog left `document.activeElement` on
`<body>`. The user's place in the page is lost, and a keyboard or screen
reader user starts again from the top. Test: "a trigger removed while its
dialog is open leaves focus on the body when it closes (today)". Severity
medium. A fix is a fallback target for a dialog's restoration (the trigger's
neighbour, or a caller-named element): the same `FocusRecovery` vocabulary
as D9 (`same`, `next`, `previous`, `parent`, `owner`), applied to the
dialog's opener instead of a roving row. U-WP5 builds `FocusRecovery` for
roving stops; its use for an overlay's opener is a new package, U-WP14.

**O3. Portaled theme inheritance: wrong.** A custom property set on a region
that holds the Popover's trigger reached the panel with the default anchor
(the panel stays under the region), and did not with `portal: true`: the panel
moved to the document and read `''`. This is the trap CLAUDE.md records for
Menu, Listbox and Combobox, reproduced on the Popover. Tests: "the default
anchor keeps the panel under the trigger region, so a region property reaches
it" and "a portaled anchor moves the panel out of the region, so a region
property no longer reaches it (today)". Severity medium for an application
that scopes a theme to a region. Fix: the portal's root takes the owner's
resolved custom properties, or the Style adds the region's scope to the
panel's slot; U-WP14.

Not audited, said plainly: `DismissLayer` in a runtime with portaled layers.
It orders layers by DOM order at the event, so a portaled child that lands
before its parent in the document would be dismissed in the wrong order; the
unit tests drive `toDismiss` with a given order and cannot see it. D8 (a
handled Escape yields to `defaultPrevented`) is built by U-WP3b; its browser
scenario belongs to it. Opener modality (pointer or key opened) was not
checked.

## Item 5: virtual lists, bottom-following, spatial navigation, ranges, canvas

Evidence: `packages/mixins-ui/test/audit/virtual-focus.browser.test.ts`,
`chat-following.browser.test.ts`, and
`packages/primitives/test/audit-selection-spatial.browser.test.ts`.

**V1. Focus in a virtual row.** A button focused in row 3 of a thousand-row
`VirtualList`, the list scrolled 20,000px: the row is unmounted and focus is on
`<body>`; scrolled back, the row is a new element and focus is still on
`<body>`. While scrolling stays inside the drawn window the same element keeps
focus. This is the cost of not drawing a row, and D12 already decides that
held focus is the Model's (a `focus` capability and a Command after the
scroll). Severity low; the gap is the recipe, which U-WP10 documents. Tests:
"a focused control in a row that scrolls out of the window leaves focus on the
body, and the row coming back is not focused (today)" and "a drawn row keeps
focus while scrolling stays within the window that draws it".

**V2. A range over a virtual list.** `between(order, anchor, to)` returns
`[to]` when the anchor is not in `order`; a caller that passes the drawn
window as the order loses the range it meant. Passing the whole ordered list is
correct and cheap (ids only). Documentation, not code: U-WP10. Test:
"extends a range over the order it is given, so the caller must give the whole
list, not the drawn rows".

**V3. Spatial navigation: not present.** `GridNavigation.move` walks indices by
a fixed column count. Over a wrapped flex layout (rows of 2, 3 and 1 cells)
the cell under cell 0 is cell 2 on screen and cell 3 by `move`. For a
regular grid this is right and is what a calendar or palette needs; for an
irregular layout (a canvas, tags, wrapped chips) arrow keys land somewhere the
eye does not expect. Test: "moves by index and column count, which is not where
a wrapped layout draws the cell below (today)". Not built here: no consumer in
the tree has an irregular layout that needs it, and the design note excludes a
primitive from a name alone. It is recorded so one is built from a real
consumer's layout (a geometric nearest-in-direction `move`, measured), not
from this test.

**C1. Bottom-following when the frame changes height: defect.** At the end of a
30-message `MessageScroller`, the frame's height changed 300px to 120px (a
keyboard opening, a window resized, a panel above growing). After 300ms the
end was 180px out of view, exactly what the frame lost. `MessageScroller` observes its log
(`observer.observe(element)`, `messageScroller.ts`), which does not change
size when its scrolling parent does; the scroll position is clamped by the
browser, not scrolled. Test: `test.fails` "DEFECT: the frame shrinking while
the reader follows (a keyboard opening) leaves the end out of view". Severity
medium: it breaks the one promise a chat makes on a phone. Fix: observe the
scroller as well and re-seat the end while following; U-WP15 (small).

**C2. A message above the end growing: present.** A padding of 200px added to
a message that is not the last, while following, kept the end in view (the log
grew, the observer fired). The shipped tests cover arrival, streaming, jumping
and prepending; this is the image-loading case. Test: "a message above the end
growing while the reader follows keeps the end in view".

**Canvas manipulation.** Only the pointer half was audited (R1, R4, R6, R7
use the same Mount the builder's canvas uses). Pan, zoom, resize handles and
key nudging of a selected node were not run; the builder's own browser tests
are the existing evidence and were not re-read for this audit.

## Work packages proposed

| WP | Scope | Size |
| --- | --- | --- |
| U-WP12 (existing) | `Reorder`: R2, R3, the descendant guard of R4; `place` stays `DragPlace` | as designed |
| U-WP13 (new) | `PointerDrag`: edge scrolling option (R1) and a marquee fact stream (R6) | medium |
| U-WP14 (new) | Overlay restoration fallback for a removed opener (O2) and the portal's inherited custom properties (O3) | medium |
| U-WP15 (new) | `MessageScroller` re-seats the end when its frame resizes (C1) | small |
| U-WP10 (existing) | The guide: virtual-row focus recipe (V1), ranges over the whole order (V2) | docs |

U-WP12 can start now: the one open question of §10 (whether `place` needs more
than `DragPlace`) is answered above.
