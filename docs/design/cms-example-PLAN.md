# Revising the packages after the CMS example

**Status:** areas 1 to 3 built; 4 and 5 proposed. The tracking table at
the end is current.
**Source:** [cms-example-FINDINGS.md](./cms-example-FINDINGS.md), whose item
numbers (F1, F2, …) this plan cites. Read the findings for what happened; read
this for what to change.

Building `examples/cms` into a working blog studio and public site found 25
problems. The ownership model held: the Builder knows nothing of the CMS, the
canvas and the site draw with one Renderer, canvas data and picker choices come
through view inputs, the Builder owns its selection with the address as its
mirror, and permissions stayed on the server. Every problem was at a seam
between pieces, and they group into five kinds. This plan revises each seam.

The packages are 0.x: an API is changed where the design gets better, not
given a parallel one. Areas 1 and 2 are the breaking contracts and land before
the 0.1.0 publish; 3 to 5 are additive or internal.

## How the work runs

- **Order:** 1 → 2 → 3 → 4 → 5. Area 1 touches every application's wiring, so
  nothing else should build on the old shapes first.
- **The example is the acceptance test.** After each area, the workarounds it
  made unnecessary are deleted from `examples/cms`, and the finding moves to
  **fixed** in the findings file with its commit. A workaround that cannot be
  deleted means the area is not done.
- **Browser flows become tests.** Add jsdom flow tests for the example's three
  applications (open, edit, publish, visit), so the walkthrough done by hand in
  Chrome is coverage.
- **Every item** follows AGENTS.md: a test that fails without the change, the
  READMEs and the `foldkit-plus` skill updated in the same change, the
  CHANGELOG.

## 1. Absence is an `Option`, and stored vs. decoded is explicit

*Breaking. Findings F4, F11, F13, F14.*

A page stores JSON (the encoded side); a Block's view gets decoded props.
Editing tools work on one side and views on the other, and three bugs came from
mixing them. `null` and `undefined` meant "absent" in some places and "stored as
null" in others. AGENTS.md (De-slop) now says absence is an Effect `Option`; this
area makes the packages keep it.

### 1a. The Builder's Model and Messages

- `selected`, `hovered`, `refused` and `drag` become `Schema.Option(…)`.
- `Selected({ id: NodeId | null })` splits into `Selected({ id })` and
  `Deselected()`. A nullable payload is a second Message in disguise.
- `PageBuilder.placeFor(document, selected, block)` and the other helpers take
  `Option<NodeId>`.

### 1b. The CMS editor's reads

- `placed.entry`, `pageId`, `state`, `error` and `resumed` return `Option`, as
  `storedEntry` already does (`45eb676`).
- The example's `Option.fromUndefinedOr(PostEditor.state(model))` wrappers go.

### 1c. The active-read contract

- An active's `projectionOf` returns `Option<Projection>` instead of
  `Projection | undefined` (Surface and Remote).
- `QueryBlock.active`'s `documentOf` returns `Option<Document>`.
- Every application's actives change; the change is mechanical.

### 1d. Stored vs. decoded in composition

- One helper answers questions about a prop's stored side (`Block.stored(block,
  key)` or similar); the inspector, the starters and any future editing tool go
  through it. The inspector's `Schema.toEncoded` check (`9604e06`) moves into it.
- The two prop types get names, `StoredProps<B>` and `PropsOf<B>`, so a function
  says which side it takes.
- The composition README says: a prop that may be empty is
  `Schema.OptionFromNullOr(…)`, stored as `null` and drawn as an `Option`.

### 1e. A read that cannot be satisfied says so

- A Remote overlay (a preview) that lacks a field its read selects reads as
  `Failed`, with a named error listing the missing fields, instead of `Initial`
  forever (F11).

**Done when:** no application-facing read in builder, cms, composition, surface
or remote returns `| null` or `| undefined` for absence; the example has no
`fromNullOr`/`fromUndefinedOr` at a package boundary except for stored columns
(`publishedAt`).

## 2. The styling contract: everything drawn is a Slot

*Breaking. Findings F1, F15, F16, F17, F18, F21, F23.*

Slots plus Style is the styling contract, and it works where it is used. It
breaks wherever a package draws markup outside it, or a token's name misleads.

### 2a. A rule, in AGENTS.md

- A package never draws markup outside a Slot. A structural fact a stylist needs
  (depth, state, position) is on a Slot, as a custom property or a data
  attribute.

### 2b. The markup that breaks it today

- **The CMS slug control** (F18): add `FieldSlots.group` and `FieldSlots.affix`
  (a prefix or suffix), used by `Cms.controlRenderers()`'s slug and available to
  any kind renderer. The example's `[data-cms-slug-prefix]` selector goes.
- **Tree depth** (F21): `TreeNavigation` writes `--fk-tree-level` on each row,
  so one `calc(var(--fk-tree-level) * 1rem)` indents any depth. The example's
  per-level rules go.

### 2c. Token names say their role

- `<family>.text` (`accent.text`, `error.text`, …) becomes `<family>.onFill`: the
  text on the family's full fill, as the mixins-ui recipes already call it (F15).
- A new `<family>.ink` is colored text that is contrast-safe on the base surface,
  which is what the example needed each time it misused `.text`.
- *As built:* the key is `'on-fill'`, kebab like the theme's other keys
  (`'link-hover'`), so the variable is `--fk-accent-on-fill`. `text['on-accent']`,
  the same value, is removed. Unfilled buttons read `--fk-ink` first, the way
  headings read `--fk-heading` (F27).

### 2d. Headings in a colored band

- `Defaults.headings` uses `color: var(--fk-heading, var(--fk-text-overt))`. A
  toned container sets `--fk-heading: currentColor` with `Style.vars`. Headings
  keep their strong color by default and take a band's color inside one, and a
  Block author writes nothing (F17). The Hero's `color: inherit` goes.

### 2e. The canvas's marks

- `data-composition-selected` and `data-composition-hovered` become one
  attribute, `data-composition-mark="selected" | "hovered"`, with the selection
  winning in the Builder itself. No stylesheet can order the two rules wrong
  (F23).

### 2f. Recipes

- `Style.recipeFor`'s `variants` becomes optional (F1).
- Audit the other mixins-ui recipes for use on an `<a>`, as the button needed
  (F16, fixed in `80c8870`). *As built:* nothing else needs it; Tabs render
  `<button>`, and the rest are form controls and a dialog.

**Done when:** the example's style has no data-attribute selector into a
package's markup, no per-level tree rules, no `color: inherit` on a Block title,
and no `<family>.default` used as text color.

## 3. Remote: reads keep their window, writes say what changed

*Findings F10, F19, F22, and the Drizzle cast in F12.*

Remote keeps one normalized store and keys a list by query and input, not by
page size. That is right for a cache, and it means a read must be cut to the
window it asked for, and a write must say everything it changed.

### 3a. Windowing moves into Remote

- A read with `first: 3` returns at most three rows, with `hasNext` derived,
  whatever else loaded the connection.
- `QueryBlock.reads`' `windowed` (`263839a`) is deleted; it patched one consumer.
  Its test moves to Remote.
- Crud's "load more" keeps working: it grows its window explicitly.
- *As built:* `Data.more(model, projection)` grows a read's window by a page
  and is kept in Remote's store (`grown`, by query, input and first window), so
  a list still holds no state; retention forgets it with the connection. The
  read entry plans one query per connection and direction, for the widest
  window, and when a connection holds fewer rows than a window asks for, asks
  only for the rows after its end cursor (or before its start). `Data.next`,
  `Data.previous` and `Data.fetch`, which paged onto a connection every read
  then showed, are removed; `Remote.query` and `Remote.queryMessage` remain for
  running one page by hand. Found on the way: a wider window asked for after a
  narrower one had loaded the connection was never fetched, so a picker's
  `first: 50` after a Block's `first: 3` showed three rows.

### 3b. `Data.active(name, projectionOf)`

- Builds an active read. `Remote.make` requires the application's `owner`, so
  `Data.contract.owner ?? {}`, a quiet fallback, goes from every example.

### 3c. Writes return what they wrote

- The rule, in the Remote README: a server operation returns the full row it
  wrote. cms-drizzle's publish does (`d4989f1`).
- remote-drizzle gets a `returning.row(binding, id)` helper for application
  handlers, and a typed write service that replaces
  `(yield* DrizzleDatabase) as unknown as Writes`.
- *As built:* `drizzleWrites` (an Effect of `DrizzleDatabase`) gives
  `insert`/`update`/`delete` typed by `InferInsertModel`; `DrizzleDatabaseService`
  stays read-only so test fakes need only `select`. `returning.row` reads every
  column and each `one` relation as its ref. The rule is in the remote-drizzle
  README, where handlers are written.

**Done when:** the example's `sitePosts` (50 rows) and a PostList (3) coexist with
no code of the example's; no `?? {}` owner remains; `server.ts` has no cast.

## 4. One helper for schema words, and generics that infer

*Findings F3, F4, F5, F8, F20, and one new bug.*

### 4a. Schema words, once

- Under Effect 4, a schema with checks resolves to its last check's annotations,
  so a title given before a check is lost. `foldkit-form` is fixed (`ea4d3e2`).
- **Not fixed:** mixins-builder's `labelFor` reads
  `Schema.resolveAnnotations(schema)?.title` directly, so a Block prop with a
  title before a check loses its label in the inspector. (F26 in the findings.)
- One `Words.of(schema)` in `foldkit-metadata` (or `foldkit-entity`) resolves a
  title and a description correctly; the form, the inspector and Crud's
  displays use it, and no package calls `resolveAnnotations` for words itself.
- AGENTS.md's traps, under "Effect 4, not 3": a checked schema resolves to its
  last check's annotations.

### 4b. Generics that infer

- remote-drizzle's `query(descriptor, { entity })` infers the principal from the
  binding's `visible` rule, so a caller writes no type arguments (F3).
- `Renderer.render`'s options accept `undefined` (F4), and a Renderer that sends
  nothing accepts any application's builder, so `inertHtml` stops being a thing
  a user must know (F5).
- Find why `placements.complete` loses inference with `makeApplication`'s
  routing callbacks, and fix it or name the cause in its error (F8).

**Done when:** no package reads a title with `resolveAnnotations`; the example
has no explicit type argument on `query`, no `data === undefined ? {} : { data }`,
and no annotated routing callback.

## 5. What an application needs in its first week

*Findings F2, F6, F9, F12, F24, F25.*

### 5a. CMS import

- `cms.import({ type, values, as, at })` writes a published item (the row, its
  entry, its first revision) by the same path as a publish, without the
  handler. `seed.ts` shrinks to data, and moving from another CMS has a path (F9).

### 5b. Permissions reach the client

- The entry read carries what the signed-in principal may do, computed by the
  server's `allow`. The editor exposes `placed.may(model, 'publish')`, so an
  application disables what would be refused instead of reporting it after the
  click (F25).

### 5c. The Builder's interaction

- The selection scrolls into view in the layers and on the canvas when it
  changes (F24).
- The inspector offers a select for a number-literal prop and stores the number
  (F6). The example's `'3' | '6' | '9'` becomes `3 | 6 | 9`.

### 5d. Types that do not need casts

- A Selection's value type has a name (`Entity.Selected<typeof S>`, or `.Type`)
  (F2).
- A Crud list's `active.projectionOf` is typed as always present (F12).

**Done when:** `seed.ts` calls `cms.import`; a writer sees no Publish button they
cannot use; an inserted Block is in view; the example has no `!` and no
`as never`.

## Tracking

| Area | Findings | Breaking | Status |
| --- | --- | --- | --- |
| 1. Absence and stored vs. decoded | F4, F11, F13, F14 | yes | built (F4, F7, F10, F11, F13, F14 fixed) |
| 2. Styling contract | F1, F15–F18, F21, F23, F27 | yes | built (all fixed; F27 found and fixed on the way) |
| 3. Remote windows and writes | F10, F12, F19, F22 | yes (paging API) | built (3b with area 1; F22 moved into Remote; the Drizzle casts of F12 gone) |
| 4. Schema words and inference | F3–F5, F8, F20, F26 | no | proposed (F20 fixed in the form) |
| 5. First-week capabilities | F2, F6, F9, F12, F24, F25 | no | proposed |
