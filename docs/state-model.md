# Who changes application state, and how

When keystrokes arrive faster than the screen redraws, or when two parts of an application write to the same field, updates overwrite each other silently. Foldkit Plus avoids lost updates by separating **what caused a change** (your `Message`s and `update`) from **where a value is installed** (infrastructure seams and single-owner rules).

## Messages carry intent, not results worked out from the last frame

Typing `"Dowel"` faster than an inline editor opened used to leave only `"l"` in the box.

Why? Foldkit renders on the next animation frame. While a fast typist presses five keys inside one frame, the DOM still shows the view as it was last drawn — before the editor opened. Because the view still saw a closed cell, each key handler sent `EditStarted({ draft: key })`, and `update` restarted the edit on every keystroke.

The same frame-lag bug appears in four other places:

- **Submitting right after typing:** Pressing Enter in a todo input within a frame of typing sent the empty draft the form was last drawn with, adding nothing.
- **Double-clicking a sort header:** Two clicks in one frame both read `"ascending"` from the drawn button and both sent `Sorted({ direction: 'ascending' })` instead of toggling to descending.
- **Resized columns during a drag:** Computing a drop target during `pointermove` landed columns by widths that a resize had changed before release.
- **Clicking an open menu's button:** Clicking the trigger moved focus away from the menu so it closed, and the click — bound on the last frame — reopened it on the next frame.

The rule is simple: **a Message states what the user did, and `update` computes what it means against the current `Model`.**

| Instead of | Send | And `update` |
| --- | --- | --- |
| The next sort direction (`Sorted({ sort })`) | The column clicked (`Sorted({ column })`) | Toggles `model.sort` via `PostSort.toggle` |
| Starting an edit per key (`EditStarted({ draft })`) | The key typed (`EditTyped({ text })`) | Starts an edit or appends to the open one |
| A drop index computed on `pointermove` | Pointer offset at release (`ColumnDragEnded`) | Computes drop target from current columns |
| The menu item label as drawn | Its index (`MenuChosen({ index })`) | Reads the item from the live menu |
| The draft string as drawn (`RequestedTodo`) | The submit intent (`DraftSubmitted()`) | Reads `model.draft` from the Model |

Close a menu when focus leaves the wrapper holding both the menu and its trigger button, rather than on blur of the menu alone.

### Testing fast input with held frames

A test that awaits a redraw between clicks will never catch frame-lag bugs. Use `Frames.track()` from `foldkit-mixins/testing` to hold animation frames during a sequence of events (`frames.hold()`), dispatch rapid clicks or keystrokes against the stale DOM, and then call `frames.release()` to verify `update` computed the right result from the live `Model`. See [`examples/registry/test/page.test.ts`](../examples/registry/test/page.test.ts) for a full browser test using `Frames.track()`.

## The two write paths

Every change to your `Model` takes one of two paths depending on whether it is a domain transition or an infrastructure installation:

1. **Application transitions** travel from a user click, AI agent call, Behavior, or Command through a `Message` into `update`, which returns the next `Model` via `modifyFields`.
2. **Infrastructure installations** write an already-derived snapshot (a Sync checkpoint, a restored URL slice from Mirror, a Remote cache update, or SSR state) through a structural seam: `ModelRef.set`, `ModelRef.modify`, or `WritableProjection.set`.

`ModelRef.modify` is a convenience wrapper around `ModelRef.set(f(get))` so container-aware `.at` and `.index` updates keep working. Never call `ModelRef.set` or `WritableProjection.set` from application click handlers or components to shortcut a `Message` — doing so bypasses `update`, breaks replay, and hides state changes from subscribers.

### Who owns each kind of change

| Situation | Owner | Change mechanism |
| --- | --- | --- |
| Local UI or domain state | Application | `Message` → `update` → `modifyFields` |
| Child Submodel state | Submodel | Child `Message` → child `update` → `modifyFields` |
| Server data | Server | Remote `Message` → `Data.reduce` |
| Replicated user operation | Application + durable log | `Message` → `update` → `modifyFields` |
| Sync checkpoint | Authoritative replica | `WritableProjection.set` |
| URL or storage restoration | Local application | Mirror → `WritableProjection.set` |
| AI agent action | Application | Agent → `Message` → `update` |
| UI widget behavior | Application | Behavior → `Message` → `update` |

## What a reader sees while a change is in flight

Both `foldkit-remote` and `foldkit-sync` show optimistic changes immediately before the server confirms them. Remote layers optimistic patches over its normalized cache; Sync replays pending durable operations over its committed replica slice. Because both share the same model, both use the same four terms:

`visible = confirmed / committed + pending`

| Concept | In `foldkit-remote` | In `foldkit-sync` |
| --- | --- | --- |
| Authority's last word | `Data.confirmed(projection)` | `mounted.committed` |
| Pending, unanswered work | Optimistic layers and overlays | Durable operations in the outbox |
| What views render | The projection itself | The replica's shared slice |
| Settled either way | `settled` (applied or failed) | Exchange rebased the operation |

Two rules follow from separating visible from confirmed state:

- **Views read the visible state.** Passing a Projection to `foldkit-remote` or reading a `foldkit-sync` slice gives you the optimistic view by default, because that is what screens want.
- **Reporters wait for the confirmed state.** Any check confirming a write to an outside caller — such as an `Agent.when` completion predicate — must read `Data.confirmed(projection)` (Remote) or `mounted.committed` (Sync). That way it waits for the server instead of trusting a local edit.

Remote and Sync keep separate implementations instead of hiding behind one shared overlay abstraction, because a single wrapper would obscure which authority a reader is waiting on. Where server-owned rows are edited offline through a journal (`foldkit-sync/entity`), the application lays pending journal edits over Remote rows by row revision; see [Editing server data through a journal](./editing-server-data.md).

## Semantic state is not runtime work

`RemoteData` (`Initial`, `Loading`, `Ready`, `Refreshing`, `Failed`, `NotFound`) lives inside your `Model`. Because it is part of the `Model`, tests can snapshot it, time-travel debuggers can replay it, and views render deterministically from it.

Background fiber activity (whether an Effect fiber happens to be running right now) is runtime instrumentation, not application state. Views must render from `RemoteData` in the `Model`, never from live fiber status, so any screen can be reproduced solely from a `Model` value.

Foldkit also needs no separate `action()` wrapper to coordinate optimistic updates and network calls: `update` applies the optimistic field update and returns the `Command`, the `Command` runs the effect, and its completion `Message` reconciles the result in `update`.

## Presentation state is not a fact

DOM geometry — element bounding boxes, scroll offsets, caret positions inside an input — changes on every pointer move or scroll frame. Putting DOM measurements into the `Model` fires a `Message` and full view pass on every pixel of movement for values no transition reads.

Use this test to decide where state belongs: **is it replayed, stored, sent over the wire, or read by `update` to decide a `Message`?**

- If yes, it is an application fact and belongs in the `Model`.
- If no, it is presentation and belongs in a DOM `Behavior` or `Mount`.

Examples from the Foldkit Plus widgets:

- **Selection vs. selection box:** A page builder's selected node id is a fact (Delete reads it, URLs encode it), so it lives in the `Model`. The bounding rectangle drawn around that node is measured directly by `Measure` (`foldkit-primitives/dom`) and written as CSS custom properties with zero `Message`s.
- **Form draft vs. caret position:** Unparsed text in a form field is a fact because submit validates it; the cursor offset inside that `<input>` stays in the DOM.
- **Hovered row across panels:** When hovering a layer row highlights a node on another canvas, route hover through a `Message` into the `Model`. Call `settle` before saving so stale hover state is cleared.

## Next

- See what happens when a synced Message reads local state during replay: [Events, folds and gates](./events-folds-and-gates.md)
- Trace a domain entity, query, and write to the screen: [From declarations to the screen](./declared-data-to-ui.md)
- Look up any term in plain English: [Glossary](./glossary.md)
