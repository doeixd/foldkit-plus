# Proposals from the demo round

Each demo agent in the showcase round (one per `examples/*` folder) sends the
coordinator a proposal when it finds something the project itself should
change: a package defect, a missing or awkward API, a docs error. The
coordinator approves, declines or defers it. This file is the record.

Status words:

- **Landed**: built, tested and committed (the commit is named).
- **Building**: approved, an agent is on it.
- **Queued**: approved, not started.
- **Plan**: accepted as real, deferred as design work to
  [`ui-followup-PLAN.md`](./ui-followup-PLAN.md).
- **Open**: needs a decision from the maintainer.

Last updated 2026-11-16.

## Defects found in packages

| # | From | What was wrong | Package | Status |
|---|------|----------------|---------|--------|
| D1 | todo-app | A `Style.media`/`pseudo`/`nest` rule silently loses to a `Style.inline` of the same property in one composition, so responsive overrides did nothing (shipped in the todo app's phone layout). Fix: a definition-time diagnostic. | `foldkit-mixins` | Landed `57e83a460`; kept out of production builds `686e5eb80` |
| D2 | widgets | `Sheet.close` on a closed sheet, and `Dialog.update` on a dismissal while closed, returned an equal copy of the Model, so Foldkit rendered. Upstream's Dialog rebuilds the Model; guarded in our wrapper. `Dialog.close` is new. | `foldkit-mixins-ui` | Landed `c8df36ba6`, `a493b96d2` |
| D3 | widgets | `Table` lost focus when a sort moved the focused row. Fix: a `control` slot names a part, so an application's `FocusRecovery` keeps focus (opt-in: a stateless view cannot run the recovery itself). | `foldkit-mixins-ui` | Landed `01755f470` |
| D4 | widgets/authoring | `Press.events` dropped every event on an `aria-disabled` element, the release included, so a stepper that disabled itself while held left `Repeat` stuck. Enter and Space had the same hole. | `foldkit-primitives` | Landed `3b39c9ea3` |
| D5 | widgets/authoring | The interaction README said a held `Repeat` press survives the pointer leaving; it ends. Behaviour pinned (leaving ends the hold, returning does not resume) and docs corrected. | `foldkit-primitives` | Landed `56f63050d` |
| D6 | data-grid | A header filter form closed itself about 100 ms after a mouse click. Cause: Foldkit's Vite plugin brands a node by the function that returned it and replaces a node whose brand changed; the funnel was returned from two arrows. Only workspace builds are branded, so the browser tests never saw it. | `foldkit-mixins-data-grid` | Landed `5b2a13ebd` |
| D7 | data-grid | Header filter and column-menu buttons were 24px targets on a coarse pointer. Now 44px tall; along the row the funnel reaches 32px and the menu stays 24px, since more would overlap the neighbour or the resize handle. | `foldkit-mixins-data-grid` | Landed `6eaa42696` |
| D8 | pages | `redecorate` in `richtext-dom` restored the DOM selection without the `ownsSelection()` guard, so any decoration refresh pulled focus back into the editor from whatever button the user had moved to. | `foldkit-richtext-dom` | Landed `e50339c78`; the content redraw path had the same fault, `9e8539673` |
| D9 | authoring guide | `Conformance.listbox`'s doc comment said `enter` runs "first, and again whenever an activation has closed the options"; it runs only when no option is drawn. Comment corrected. | `foldkit-mixins` | Landed `cf84dc70d` |
| D11 | cms | In the CMS page builder, a real-mouse drag from the palette or of a layer row showed its preview but nothing landed on release, and no drop indicator was drawn; on a phone the canvas could not be reached. The package's own browser tests pass. | `foldkit-builder`, `foldkit-mixins-builder`, `examples/cms` | Landed `c97412830`, `617b61d69`; a gap drop lands between nodes `ee6e65559`, `a21725854` |
| D10 | widgets | A `File` kept in a Model or Message makes Foldkit's dev-tools relay reject with `SchemaError: Expected JSON value` under `vite dev` (not reproduced in isolation; the relay only runs under `import.meta.hot`). README note written. | `foldkit-mixins-ui` docs; upstream Foldkit | Landed `22c8c0b75` (note). Not filed upstream: two agents saw it and neither reproduced it in isolation. |

## API additions and changes

| # | From | Proposal | Package | Status |
|---|------|----------|---------|--------|
| A1 | cms | List rows carry `data-row-key`, so focus can return to the row a record was opened from. | `foldkit-mixins-crud` | Landed `83907c5e0` |
| A2 | pages | `formattingToolbar`: the standard rich text bar as one roving tab stop. | `foldkit-mixins-richtext` | Landed `09b9111b9` |
| A3 | cms | `richTextInput` takes a codec (`value`, `fill`, `blank`), so a form key can hold Markdown text while the editor holds a Document. | `foldkit-richtext-dom` | Landed `406f96ad0`, `c5edee4e7` |
| A4 | widgets | `Keys.conflict(routes, slot?)`: a key-route clash as an `Option` of the diagnostic, without a throw. | `foldkit-mixins` | Landed `92381b466` |
| A5 | data-grid | The read-only lock icon in a grid header gets a visible `title` from `words.readOnly`. | `foldkit-mixins-data-grid` | Landed `2981f2866` |
| A6 | data-grid | Copy reports its size (`Out.Copied`); `Grid.rangeSize`; a `reveal` helper; `Grid.hasFilters`, `Grid.filterCount`. | `foldkit-data-grid`, `foldkit-mixins-data-grid` | Landed `2981f2866` |
| A7 | widgets | `FileInput.cases` to spread the widget's own Messages into an application's union. | `foldkit-mixins-ui` | Landed `0ba42a55a` |
| A8 | widgets | `Table` sort keys typed through to `onSort`; `Table.defineColumns` for hoisted columns. | `foldkit-mixins-ui` | Landed `21331cecd` |
| A9 | widgets | `FocusRecovery`: a fallback naming an undeclared part is a type error; `parts` may name a widget's own `recoveryPart` without inventing a Slot. | `foldkit-primitives` | Landed `b458375f1` (the part check needs the inferred form) |
| A10 | widgets/authoring | `Repeat.behavior` takes the `SlotView.over` binder with inference, a `disabled` option, and supplies `activation`. | `foldkit-primitives` | Landed `92da18aa4` |
| A11 | widgets/authoring | `Selection` helpers `select` (replace and anchor) and `range`. | `foldkit-primitives` | Landed `7df47c587` |
| A12 | widgets/authoring | `Pressed` carries `modifiers` (shift, ctrl, meta, alt) in place of `shiftKey`. **Breaking.** | `foldkit-primitives` | Landed `4d3d7cd81` |
| A13 | widgets/authoring | `GridNavigation.behavior` takes application key `routes`. | `foldkit-primitives` | Landed `adaf67191` |
| A14 | design-system | A runtime-only Themes entry (apply, choose, changes, boot script) importable without the style compiler (`foldkit-mixins/theme/runtime`), and knob metadata as generated plain data, one export per knob (`foldkit-mixins/theme/knob-data`). | `foldkit-mixins` | Landed `82c01b9a4`, `a7171cfd4` |
| A15 | richtext-playground | `formattingToolbar`: application entries in the Insert menu, and application controls inside the bar's one tab stop, a compact mode that does not draw low-priority controls, and Escape back to the text. | `foldkit-mixins-richtext` | Landed `6bf9f4bd3` |
| A16 | cms | `Cms.bySlug` (and sibling read-side functions) typed by what they read (`ContentReader`), so a public site does not import the content type's form and with it the editor. | `foldkit-cms` | Landed `4b3d01550` |
| A18 | cms | The editor's `role="textbox"` root had no accessible name. A placement takes `label` or `labelledBy`; in a form the key's label names the editor and focuses it on click. | `foldkit-richtext-dom` | Landed `3431ea801` |
| A19 | richtext-playground | The editor scrolls the caret into view after an edit or key moves it (a phone with the keyboard up left it 400px off screen). | `foldkit-richtext-dom` | Landed `e186711ff` |
| A17 | widgets | SpatialNavigation README: it needs `Capability.Focusable` on the item, and what the wrong capability does. | `foldkit-primitives` docs | Landed `b458375f1` |

## Found by the docs and audit work

The expression-language guide, the domain guides and the claim-by-claim audit of
the guard and entity READMEs found these; each is a GitHub issue.

| Issue | What was wrong | Package | Status |
|-------|----------------|---------|--------|
| #568 | A list page statement selected `id` twice. | `foldkit-remote-drizzle` | Landed `e089c8444` |
| #569 | `evaluate` orders text with no declared collation, where placement and comparisons refuse it. Decision: a reader refuses such an order only when the order is what is asked; judging membership never refuses for it. | `foldkit-entity` | Landed `c956f1652` |
| #570 | `GuardServer.mutation`, `GuardSync` and `GuardServer.memory` died per request on a rule that reads another row; they now refuse where they are made. | `foldkit-guard` | Landed `7d664d41a`, `fcfff2dad` |
| #571 | An interaction `may` leaves unanswered read as refused, so an editor locked a row its reader may edit. `May.answer` gives yes, no or not said; hints act only on a no. | `foldkit-guard` | Landed `b17214c2e` |
| #572 | A write's `when` reading the viewer or the clock was accepted where declared and refused only where served. | `foldkit-entity` | Landed `c283dca5a` |
| #573 | An exception's message inside a read, list or mutation reached the client. A handler says reader text with `RemoteServer.tell(message)`; everything else is `Internal error` with an `incident`, and the detail goes to `ServerDefect`. | `foldkit-remote-server` | Landed `a021c9f4e`, `667e2b1a8`, `79a3f91aa`; adopted `8ad019194`, `af38750fb`, `5f750b112`, `3fc2e9e57` |
| #575 | The socket transport sent a failed exchange's error message to the client. `RemoteServer.report(during, cause)` is the shared reporter. | `foldkit-sync` | Landed `b6a6b2b58`, `bd4a391c7`, `fad6066d6`, `b271c434e`, `0e95d1185` |
| #576 | A resolver's error message, a close reason and a reaction's stored reason carried internal text. | `foldkit-sync` | Landed `d10ec9f26`, `bdad5b3c3` |
| #577 | A principal admitted to Update but not Read learned an entry's type and state from a refusal. | `foldkit-cms-drizzle` | Landed `00c8f7790`, `1d7e6ba53` |
| #578 | A mutation handler's returned entities reach the caller unfiltered by what they may read. | `foldkit-remote-server` | Open |
| #566 | `print` wrote unescaped backslashes and character references in link and image URLs. | `foldkit-richtext-markdown` | Landed `577d1bdc3`, `7704c1d73` |
| (wire) | A 401 or 403 answer's reason is the fixed reader text, not the thrown message. | `foldkit-remote-server` | Landed `2fa8b4034`, `bc839b9ad` |
| (render) | `ColorPicker` read `EyeDropper` and `Avatar` read the environment while drawing, so a server and a browser drew different markup. `eyedropper` is an input, false by default. | `foldkit-mixins-ui` | Landed `ccc026905`, `43b6fcb9e` |
| (type) | `Query.define` typed its `body` optional though it always sets one; it returns `DefinedQuery` now. | `foldkit-remote` | Landed `6fc9fc030` |

Also from this work: the view-identity plugin now runs in the browser test
projects (`f1d59e0d1`), which found a `WindowList.reveal` that kept scrolling a
replaced list (`e67b4a939`); per-widget `conflict(routes)` checks (`63ae78259`);
the key-race fixes in Listbox, Menu, Segmented, Picker, Nav and TagsInput; the
editor's selection kept across a toolbar press (`53d283ed7`) and its caret
scrolled into view (`e186711ff`); builder drops that land where shown
(`c97412830`, `617b61d69`, `ee6e65559`, `a21725854`); the website split into a
shell and a gallery application by path, which adopts its served pages
(`c3c52eb86` through `978ba05e8`).

## Dependencies approved for examples

| # | From | Change | Status |
|---|------|--------|--------|
| X1 | data-grid | `examples/data-grid` depends on `foldkit-mixins-ui` (toolbar widgets, lazily loaded). | Landed `7444b309b` |
| X2 | cms | `examples/cms` depends on `foldkit-mixins-richtext` (to adopt `formattingToolbar`). | Landed `261b06ed2` |
| X3 | data-grid | `examples/data-grid` depends on `foldkit-primitives` (`formatHotkey` in the lazy toolbar chunk). | Landed `bd6331b4c` |
| X4 | registry | Edit one sentence in `examples/site/src/demos.ts` to match the registry's renamed offline control. | Landed `a0b9c83fb` |

## Deferred to the follow-up plan

Accepted as real; each needs a design decision before code.

| # | From | Gap |
|---|------|-----|
| P1 | widgets | A Slot capability a Behavior refuses should be a type error at `Behavior.attach`, not a throw at module load. |
| P2 | widgets | A placement's `onOut` cannot call its own helpers without annotations (TS7022); pass the helpers in. |
| P3 | widgets | A fold helper for a child `update` that cannot drop the child's commands and keeps no-op identity (check `Update.foldChild` first). |
| P4 | todo-app | Sync: a status Message option on `Sync.mount`; an offline or pause switch on the socket transport; per-operation pending state. |
| P5 | data-grid | `Bundle.declare` should accept a lazy bundle; an application Message union lacks `matchOrElse` for routing its own Messages. |
| P6 | authoring guide | `helpers.hideAll(ids)` for keyed Presence; less boilerplate for per-key Presence; a shared `Collection` memo; a Navigation supplier when application routes share the list's container. |
| P7 | authoring guide | `docs-check` skips untracked files and builds unrelated test files, so another change's red test fails an unrelated document. |
| P8 | data-grid package | Sweep the view packages for D6's shape (a focused control returned from different arrows by state), and run browser tests with Foldkit's view-identity plugin on. |
| P9 | widgets/authoring | Press modifiers do not replace a grid's hand-written row-click handler: `Pressed` has no row id. Needs a per-row press design. |
| P10 | widgets | `Table`: the checkbox control as a named recovery part. |
| P11 | richtext | A ready `markdownCodec({ mint })` in `foldkit-richtext-markdown` (needs the editor's blank document exported). |
| P13 | registry | `Button.view` costs about 1.4 kB brotli for one button: `ButtonSlots` and the recipe share a module with the Press wiring. Split them. |
| P14 | registry | The data grid's helpers are members of one object, so each new one is kept in every page. Named exports and an `absent` pin. |
| P15 | registry, todo-app | The website's fixed "How to try this demo" pill covers demo content; give `demoGuide` a position option (website pass). |
| P16 | cms | A model-backed form control rejects `Form.Message.Changed`, so a test or script writes it with the control's own Messages; and a toolbar button must wrap each editor Message by hand. |
| P12 | widgets (report) | Smaller rough edges: `Menu` row `icon` is `Html`, not data; `SegmentedMultiple` has no `id`, so `multiple: false` type-checks; SpatialNavigation's item mark is private; `OnInput` carries no time for `History`; the 8-field `Pressed` payload is re-declared by applications; `SwipeActions.Released` needs the row width; `Repeat` has fixed timing; a `Table` markup cell cannot be named by its row; a Scene test cannot resolve a `FocusRecovery` Mount. |

## Declined

| # | From | Proposal | Why |
|---|------|----------|-----|
| N1 | richtext-playground | Make `Command.define`'s no-argument form consistent with its argument form. | Foldkit's own API, not this project's. |

## Adoption still owed in examples

An agent is removing the workarounds that were left with an `ADOPT` comment:

- `examples/authoring`: the stepper's `aria-disabled` dodge and old `Repeat` call (D4, A10); the grid's `Ranged` call and root key routes (A11, A13). The grid's `RowClicks` Mount stays until P9.
- `examples/widgets`: the key-clash `try`/`catch` (A4); the invented `dismiss` Slot for focus recovery (A9). The file-input e2e's one ignored page error stays (D10).
- `examples/pages`: the toolbar's compact mode and Escape back to the text (A15).
- `examples/design-system`: the theme runtime and knob data (A14), in its second round.
- `examples/richtext-playground`: its `test.fails` caret e2e becomes a passing test with A19.
