# Demos: one look, the shipped components, the current API

The plan to bring every browser demo onto the project's own components and
theme, and onto the features released through 0.34.0. Checked against `main`
at `bf6a8a94` on 2026-10-26.

**Status (2026-10-26):**

- **Phase 0 is done**, and its findings are below.
- **Its two bugs are fixed:** `widgets`' dark borders and `richtext-playground`'s
  sideways scroll at 390px, which now has an e2e test.
- **Phase 1 is done.** `AppShell` and the `width.page` token are built, with their
  tests; `demoStyle` exists (`foldkit-example-site/demo-style`); and
  `design-system` draws its sections in a `Sidebar` inside `AppShell`.
- **Phase 2 is in progress.** `auth` is done: `AppShell`, `Card`, `Input`,
  `PasswordInput`, `Button`, `Badge` and `Alert` on `demoStyle`, with its
  foundations served in the page, and its e2e and mutation specs green.
  `entity` and `widgets` are next.
- **Phases 3 to 6 are not started.**

## Why

The demos are what a visitor sees first, and the published ones
(`examples/site/src/demos.ts`) are linked from the site and the root README. They
were built one at a time, each when its package was new, so they now disagree with
each other and with the packages they advertise:

- **Three demos draw with their own CSS** instead of the token pipeline:
  `examples/cloudflare/src/page.css` (128 lines), `examples/entity/src/styles.css`
  (62) and `examples/todo-app/src/styles.css` (14), and `examples/pages/index.html`
  carries 85 lines of `<style>`. A theme knob (density, radius, motion, dark)
  reaches none of it.
- **Most demos draw raw elements, not `foldkit-mixins-ui`.** Counting `h.button`,
  `h.input`, `h.select`, `h.textarea`, `h.table` and `h.dialog` in `src`, against
  calls to a mixins-ui component (`Button.view`, `Dialog.view`, …):

  | Demo | Raw elements | mixins-ui calls | Theme installed |
  | --- | --- | --- | --- |
  | `auth` | 4 | 0 | no |
  | `cloudflare` | 3 | 0 | no (own CSS) |
  | `entity` | 2 | 0 | no (own CSS) |
  | `pages` | 8 | 0 | no (`<style>` in the page) |
  | `registry` | 3 | 0 | partly (22 inline `h.Style`) |
  | `richtext-playground` | 19 | 0 | yes |
  | `todo-app` | 9 | 0 | yes |
  | `sync` | 0 | 0 | no view of its own |
  | `cms` | 12 | 7 | yes |
  | `design-system` | 20 | 34 | yes |
  | `site` | 67 | 156 | yes |

  `widgets` is left out on purpose: it composes widgets from primitives to show
  how, and should stay that way.
- **The newest features are shown in one place each, or nowhere.** Field recipes
  (`FieldRecipes.*`) appear only in `cms` and `fields`; `Crud.screen`
  and `AskedForMore` only in `entity`; `foldkit-media/browser`'s
  `upload` in no demo at all; `UiForm.renderers` only in the `foldkit/` ports;
  operators (`Expr.operator`, `Text.startsWith`) only in `registry`; `Entity.invariant`
  and declared writes only in the transcript-only `writes`; and `Themes.make`
  (switching named themes) in none.

The demos should read as one product: the same theme, the same components, the
same empty, loading, error and offline states, and each showing the newest way to
do what it does.

## What this plan does not change

- **What each demo proves.** Every demo keeps its `proves` sentence and its
  `tryThis` steps in `demos.ts`; this plan changes how they look and which API they
  use, not their story. A step that changes is changed in `demos.ts` in the same
  commit.
- **The transcript examples** (`bundle`, `remote`, `sync`'s trace, `mixins`, `tree`,
  `drawer`, `todo`, `react`, `kitchen-sink`, `writes`, `fields`' trace). They have no
  UI to improve; Phase 5 only checks their APIs are current.
- **`widgets`' construction from primitives**, and **the guide pill**
  (`examples/site/src/guide.ts`), whose look is deliberately its own so it reads the
  same over every demo.

## Rules every phase keeps

These come from `AGENTS.md`'s styling section and its traps; each has cost time here.

- **A builtin first.** Before writing markup, a style or a helper, look for the
  mixins-ui component, the `Layout` piece or the `AppStyle` option that does it,
  and use it as it ships. Adjust a recipe with `.extend`, never by forking it. A
  gap a demo finds is filled in the package, for every application, not in the
  demo.
- Values come from tokens through `Theme.ref`; no colour, size or duration is
  copied into a demo. A demo's look is a `Theme.make` of its own, installed with
  `Theme.root` in its sheet's `theme` layer.
- Markup goes through Slots. A demo that needs a fact styled (state, depth) puts it
  on a Slot.
- Each Slot gets an element of its own: two Slots' attributes on one element keep
  only one class.
- A layout claim is checked in a browser at desktop width and at a phone's width
  (390px), with a screenshot kept in the PR. A demo with a server is checked
  against its built, deployed shape, not only the dev server: a `Document` view
  owns the whole body.
- Every interaction a phase changes keeps or gains its e2e test
  (`examples/*/e2e`), and focus claims are browser tests.

## Phase 0: audit

Before changing anything, see what a visitor sees.

- Run each browser demo (`auth`, `cloudflare`, `cms`, `data-grid`,
  `design-system`, `entity`, `pages`, `registry`, `richtext-playground`, `site`,
  `todo-app`, `widgets`) and screenshot it at 1280px and 390px, light and dark, in
  its empty, loading, error, filled and offline states where it has them.
- Record each finding in this document, under the demo, as *what is wrong* and
  *which component or token fixes it*. Typical findings to look for: an
  unstyled control, a missing empty or error state, a spinner where a skeleton
  belongs, no visible focus ring, text that overflows at 390px, a dialog not
  centred, a status shown only in colour.
- Settle `AppShell`'s Slots and options (Phase 1) from what the audit shows the demos have in
  common.

Exit: a table of findings per demo, each pointing at a fix in a later phase.

### Findings (2026-10-26)

Taken from each demo's dev server with Playwright: 1280×800 and 390×844, light
and dark, first screen only, with a check for page errors and for scrolling
sideways. `cloudflare` (which runs under Wrangler) and the interactive states
(empty, error, offline, a dialog open) are still to do.

| Demo | Now | Fix, and its phase |
| --- | --- | --- |
| `auth` | No styling at all: browser-default serif text, unlabelled inputs run together on one line, links in default blue, nothing in dark. | `demoStyle`, `AppShell`, the sign-in through `UiForm` with `PasswordInput`, the person as `Avatar` (2). |
| `entity` | A plain table: ids drawn as grey buttons, the sortable header as a button, "Published" as bare yes/no, an unstyled search box. Dark works. | `AppShell`; `Table` recipe; `Badge` for published; `Input` with a search icon; ids as row links (2). |
| `todo-app` | Clean in both schemes and widths. The Add button reads as disabled, with white text on a pale accent. Each row carries a "normal" badge that says nothing. No sync or offline state is shown, though replication is what it demonstrates. | A primary `Button` recipe; drop or vary the priority badge; status `Badge` in the `AppShell` status slot (2). |
| `pages` | Fine but sparse: a side list and an empty state. It needs its sync server (`pnpm run server`) beside `dev`, or the socket fails silently with no state shown. | `AppShell` with `nav`; an offline/connecting `Badge` and `Alert` when the socket is down (2). |
| `registry` | Polished. At 390px the status legend wraps unevenly and the toolbar stacks. | `AppShell` status slot for the legend; `Layout.cluster` for the toolbar (2). |
| `richtext-playground` | Polished at 1280px. **At 390px the page scrolls sideways**: the document column is cut off on the right (`Shape the n…`). | Fix the editor column's minimum width at narrow widths, with a browser test asserting no sideways scroll (2, then 4). |
| `cms` | Polished; it already has a sidebar, avatars and badges. At 390px the guide pill covers the last row. | `AppShell` (its frame is the model for it); bottom padding equal to the pill's height in the main region (2). |
| `data-grid` | Clean. At 390px only two columns show, which is the grid scrolling inside itself, as it should. | `AppShell`; nothing else (2). |
| `design-system` | Clean in both schemes. At 390px the section links wrap onto three lines. | Draw the sections with `AppShell`'s `nav` (1, its first use). |
| `widgets` | **In dark, the section separators and the line under the subtitle are bright white**: those borders are not drawn from the theme. | Read the border from `Theme.ref` (a token, not a literal); `demoStyle` (2). |
| `site` | Polished, dark-first. The dev server never goes network-idle (a live connection stays open), and its first load can paint unstyled while Vite compiles. | Check the deployed build, not dev (6). |

What the findings change in the plan:

- `auth`, `entity` and `widgets` need the most work, so they move to the front of
  Phase 2.
- `richtext-playground`'s sideways scroll and `widgets`' dark borders are bugs,
  fixed before any restyle.
- `cms`'s frame (a sidebar of sections, the signed-in people at its foot, a header
  that turns into a top bar at 390px) is the reference for `AppShell`'s layouts.

## Phase 1: `AppShell`, a reusable frame, and one theme for the demos

A demo should not hand-write its frame, and neither should an application: the
frame is a `foldkit-mixins-ui` component, so every Foldkit Plus application can
use it. Everything else the demos need is already shipped, and this phase builds
nothing that a builtin covers.

**What already exists, and is used as it is:**

| Need | Builtin |
| --- | --- |
| The sheet, the layers, the reset, the tokens | `AppStyle.make` (`foldkit-mixins/app`) |
| Named themes chosen by the Model (light, dark, compact) | `AppStyle.make({ themes: Themes.make(…) })` |
| Page layout (header over a side column and a main column) | `Layout.sidebar`, `Layout.stack`, `Layout.cluster`, `Layout.center` |
| The side navigation | `Sidebar`, `Nav` |
| The theme switch in the header | `Segmented` |
| A status (online, offline, syncing, pending) | `Badge`, with its word |
| Nothing to show, first load, a failure | `Empty`, `Skeleton`, `Alert`; for a read, mixins-crud's `Loading`, `Empty` and `Failure` |
| A confirmation, an undo | `Toast` |
| Who is signed in | `Avatar`, `Menu` |

**What is new: `AppShell` in `foldkit-mixins-ui`.** It is a component like the
others, with Slots, a recipe and an accessibility contract.

- **Slots:** `root`, `skip` (a skip link to the main region), `header`, `brand`,
  `actions`, `nav`, `main`, `status` and `footer`. Each is a Slot of its own on an
  element of its own, so a stylist reaches every part.
- **View:** `AppShell.view({ title, brand?, actions?, nav?, status?, footer? },
  main, h)`.
  - Without `nav` it is a single column. With `nav` it draws `Layout.sidebar`,
    and the side column collapses into a `Sheet` below the breakpoint the theme
    names.
  - `actions` and `status` take other components (`Segmented`, `Badge`, `Avatar`)
    rather than strings, so the shell owns placement and nothing else.
- **Landmarks:** `header` is the banner, `nav` the navigation, and `main` the main
  region, with an id the skip link targets. There is one of each per page.
- **What it owns:** it holds no state. The collapsed side column is a `Sheet`'s,
  and the Model's open flag is the application's. It sends no Message of its own.
  It is drawn inert on a server, and its markup parses back to itself.
- **Recipe:** `Recipes.AppShell({ width: 'full' | 'contained', density })`, placed
  in `components`. Its values come from tokens.
- **Contract:** `Patterns.AppShell`, one landmark each, and a `catalog` entry,
  validated by the existing gate test.
- **Tests:**
  - unit tests of the markup;
  - a browser test of the layout at 1280px and 390px, asserting geometry rather
    than visibility;
  - a browser test that the skip link moves focus to `main`;
  - an SSR round-trip test;
  - a mutation spec.
- **Docs:** a row in mixins-ui's README component table and in the skill's
  `references/mixins.md`, and a CHANGELOG entry.

**The demos' theme** stays demo-specific and lives in `examples/site` beside
`demos.ts` and `guide.ts`. `demoStyle` is one `AppStyle.make({ themes })` call
with a light, a dark and a compact theme, and each demo takes its `t`, `slots` and
`stylesheet` from it. It is the first demo use of `Themes.make`.

Exit:

- `AppShell` is released in `foldkit-mixins-ui`, with its tests.
- `demoStyle` exists.
- `design-system`, the components' own gallery, draws an `AppShell` page.

## Phase 2: move the demos onto `AppShell` and the components

One demo per commit, in this order (most visited first, most hand-written CSS
first):

1. **`todo-app`.** Replace its 9 raw controls with `Input`, `Checkbox`, `Button`
   and `ButtonGroup`, and delete `styles.css`. Show offline and pending edits with the
   shared status `Badge`, and "cleared" with an undo `Toast`.
2. **`entity`.** Delete `styles.css`. Draw the screen through `AppShell`, and the
   editor and the delete question through `EditorView` and `ConfirmView`, which it
   already uses, styled by the theme rather than CSS.
3. **`cloudflare`.** Delete `page.css`. The same shell, with the Worker and
   Durable Object status as `Badge`s.
4. **`pages`.** Move the `<style>` block out of `index.html` into Slot styles, and
   draw the page list in a `Sidebar` and the presence of the other editor as an
   `Avatar` group.
5. **`registry`.** Replace its 22 inline `h.Style`s with Slot styles. Draw the two
   devices as `Card`s with the status `Badge`, and the conflict notice as an
   `Alert`.
6. **`auth`.** Draw the sign-in as a form through `UiForm.renderers`, with
   `PasswordInput`. Draw the signed-in person as an `Avatar`, and sign-out as a
   `Menu`.
7. **`richtext-playground`.** Replace its 19 raw controls in the toolbar and
   settings with `ButtonGroup`, `Segmented`, `Select` and `Switch`.
8. **`cms`** and **`data-grid`.** These are already on the theme, so they only
   move onto `AppShell` and the shared states where the audit found a gap.

For each demo the commit:

- deletes the demo's own CSS;
- leaves no raw control where a component exists;
- has every state from the audit drawn by a shared component;
- passes the e2e tests, updated where a selector changed;
- has screenshots at both widths in the PR.

Exit: no `*.css` file and no `<style>` block left in a demo. Each demo's raw-control
count, from the table above, falls to what has no component (a `canvas`, a bare
`form`). Each `tryThis` step still works as written.

## Phase 3: show the newest features where they belong

Each feature goes into the demo whose story it already serves, not into a
showcase of its own:

- **Field recipes and `UiForm.renderers`** in `entity`'s editor, so a date, an
  amount and a slug are drawn by the recipes, not as text fields. `cms` already
  uses them.
- **`FieldRecipes.image` with `upload`** in `cms` (a post's cover image) or
  `cloudflare`, which has `foldkit-media/cloudflare`: the first demo of an upload,
  with progress and a submit that waits for it.
- **`Crud.screen` and `AskedForMore`** in `cloudflare`'s editor as well as
  `entity`'s, with a relation picker long enough to page.
- **`Entity.invariant` and a declared write's refusal** in `entity` or `registry`,
  so a visitor sees a refusal land beside its field (a price under zero, a stock
  count past what the warehouse holds).
- **Operators**: a defined operator (`Expr.operator`) in `registry`'s search or
  sort beside its `Text.startsWith`, with a law the demo states.
- **`Themes.make`** through `demoStyle` and `AppShell`'s theme switch (Phase 1).

For each feature the commit:

- adds a `tryThis` step to `demos.ts` that names it, with that step covered by the
  demo's e2e test;
- updates the demo's README if the walkthrough changes.

## Phase 4: accessibility and states pass

Run over every demo after Phases 2 and 3:

- A keyboard path through each `tryThis` step, as a browser test: every action
  reachable, focus visible and returned after a dialog closes.
- `prefers-reduced-motion` and the `motion: '0'` knob still every transition.
- Colour is never the only signal: each status carries a word.
- At 390px nothing scrolls sideways and no control is smaller than the touch
  target the theme sets.

Exit: an accessibility browser test per demo, and the Phase 0 findings table
closed.

## Phase 5: the transcript examples and Foldkit's ports

- **Transcript examples:** check each against the current API (names moved in
  0.34.0: a Drizzle order term's `key`, `Query.unsupported`'s result, `Dependencies`'
  `operators`). Their tests already pin the transcripts, so this is a read and a fix
  where the README's prose lags the code.
- **`examples/foldkit/`:** the 19 ports stay close to upstream by design. Only move
  a port onto mixins-ui where its README already says a Plus package owns the
  view, and leave the rest.

## Phase 6: publish

- Redeploy each published demo (`demos.ts`'s `url`s), and check the deployed build
  at 390px, where layout faults show.
- Refresh the site's demo cards and the root README's generated list
  (`test/demos.test.ts` keeps them equal to `demos.ts`).
- Add a CHANGELOG entry under Unreleased for any package change the work needed.
  A demo-only change needs none.

## Open questions

- **Whether `widgets` wears `demoStyle`.** It can take the shared theme and
  `AppShell` without giving up building its widgets from primitives.
- **Deploy access.** Phase 6 needs whoever deploys the Pages projects; this plan
  only prepares the builds.
