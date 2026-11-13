# UI SDK comparison: evidence ledger

Part of [#558](https://github.com/doeixd/foldkit-plus/issues/558). Baseline: Foldkit `3c601ebfb74f2497def7b5fe413e5a22fa816b2e`, UI SDK `d6996097b9f8dbe5fe98c3f04210b9daa969a06c`. This ledger is incomplete: each row of the [review matrix](https://github.com/doeixd/foldkit-plus/blob/ui-sdk-core-review/docs/ui-sdk-core-review.md#comparison-matrix) still needs an entry or an explicit disposition. Evidence below is source review, not a browser parity verdict.

## Windowed lists

- Foldkit [WindowList](../packages/mixins-ui/src/windowList.ts) renders the visible key slice between spacers; the reviewed API does not include a pinned focused row or a find-in-page stand-in. [VirtualList](../packages/mixins-ui/src/virtualList.ts) adapts a different upstream component and needs its own review.
- UI SDK's experimental [virtualizer](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/lists/virtualizer.ts) accepts rows to keep and offers findable stand-ins.
- **Next:** reproduce focus moving off the rendered window and browser find on off-window text. If either fails for the intended use, design retention without rendering an unbounded contiguous range and evaluate an accessible findable representation. Measure DOM and geometry costs. This is an API difference, not yet a demonstrated user-facing failure.

## Following new messages

- Foldkit [MessageScroller](../packages/mixins-ui/src/messageScroller.ts) follows content while at the end, records unseen messages and preserves the reader's position on prepend. Its [browser tests](../packages/mixins-ui/test/messageScroller.browser.test.ts) exercise streaming, scrolling away, jumping and prepend.
- UI SDK's experimental [stick-to-bottom](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/lists/stick-to-bottom.ts) additionally listens for upward wheel, touch and keyboard intent before scroll; Foldkit observes the scroll.
- **Next:** test content arriving between upward intent and the scroll, programmatic smooth scrolling and viewport resizing. Fix a demonstrated race in the existing scroller rather than adding another owner; no race has yet been reproduced.

## Preferences and theme

- Foldkit [Themes](../packages/mixins/src/theme/themes.ts) persists named selection and provides a pre-paint script; invalid saved names and unavailable storage have defined behavior. [Scheme](../packages/mixins/src/theme/scheme.ts) already supports light, dark and system; Mirror and media-query primitives cover related state and observation.
- UI SDK's [preference](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/preferences/preference.ts) and [color scheme](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/preferences/color-scheme.ts) include storage and system-scheme behavior.
- **Next:** compare server snapshots, first paint, cross-tab updates and system-scheme transitions against existing Mirror/Theme contracts. Keep the application Model as the owner. Do not infer a missing pre-paint facility.

## Mobile viewport

- Foldkit [KeyboardInset](../packages/primitives/src/dom/keyboard-inset.ts) derives a bottom inset from `visualViewport` and observes its resize and scroll. Its [browser test](../packages/primitives/test/keyboard-inset.browser.test.ts) uses a simulated viewport; it does not establish behavior with a real OS keyboard.
- UI SDK's [viewport helpers](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/platform/viewport.ts) expose additional dimensions, offsets, scale, keyboard detection and safe-area information, and support keyboard avoidance.
- **Next:** compare zoom, panning, multiple instances, cleanup and keyboard avoidance against actual Foldkit consumers; test DOM behavior and validate on real devices before claiming keyboard compatibility. Consider shared observation only if it fits the existing DOM/Model ownership and safe-area tokens.

## Selection and grid clipboard

- [Selection](../packages/primitives/src/interaction/selection.ts) implements item selection and an anchor; the [grid](../packages/data-grid/src/selection.ts) separately handles rectangular selection and unloaded select-all, with [clipboard parsing](../packages/data-grid/src/clipboard.ts). No grid clipboard parity defect was established in this review.
- **Confirmed inconsistency:** `Replaced` in single mode accepts more than one distinct ID although the module says single selection keeps one. Explicit `clear` and empty replacement are separate parent decisions; `allowEmpty` controls activation. A targeted correction must preserve those semantics, reject invalid replacement explicitly, and cover duplicate IDs and no-op identity. Implementation and verification are in progress.

## Trees, reorder and spatial selection

- [TreeView](../packages/mixins-ui/src/treeView.ts) already propagates checked/mixed states, retains disabled states and distinguishes Space from Enter; its unit and browser tests cover those paths. UI SDK's [tree checking](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/lists/tree-checked.ts) offers multiple checked-value strategies. Compare representations before changing existing semantics.
- The [Builder](../packages/builder/src/index.ts) has keyboard reorder, indent and outdent shortcuts; [PointerDrag](../packages/primitives/src/interaction/pointer-drag.ts) supports pointer/touch drop zones. UI SDK's [reorder](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/drag-and-drop/reorder.ts) and [transfer](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/drag-and-drop/transfer.ts) provide pick-up/move/drop/cancel drafts and announcements. Investigate a reusable Model-owned operation, keeping drop validation with the application and resolving the target against current state on drop.
- No general shared lasso or geometric navigation counterpart was established in this audit. UI SDK's [lasso](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/selection/lasso.ts) and [spatial focus](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/focus/spatial.ts) are starting points; a design must address layout/scroll invalidation and a keyboard-accessible alternative.

## In-place editing

- [EditableText](../packages/primitives/src/dom/editable-text.ts) already handles commit, cancel, multiline, IME and plaintext paste; the data grid has its own cell-edit lifecycle. UI SDK's experimental [inline edit](https://github.com/vercel-labs/ui/blob/d6996097b9f8dbe5fe98c3f04210b9daa969a06c/packages/core/src/foundation/lists/inline-edit.ts) additionally coordinates input-backed editing, refusal and focus fallback. Compare against the grid's existing owner before extracting shared behavior.
