# What the examples must show after 0.12

> **Status:** plan, not built (2026-10-01). Each item names the example code
> that hand-rolls or omits it and the package that owns the pattern. Work
> the waves in order; a newcomer reading the demo is the acceptance test.

0.12 shipped a wave of package APIs (Badge, Loading/Empty/Failure, entry
views, Touch/Icons, Button variants, Segmented, `Input.view`/`field`,
`FormView.fields`, submit gating, `keepScroll`, `Link.child`, `ImportItem`,
`Data.satisfy`/`meta`, socket views, `Mirror.bootstrap`/`routing`,
`assembly.runtime`, correlate-by-call, the SSR track). Four auditors swept
the studio, the site plus routing/SSG/SSR examples, the form/chat/todo
examples, and every new API's adoption across the repo. The pattern
throughout: the packages are ahead of their showcases — mechanisms with no
production user, hand-rolls beside shipped recipes, and a few places where
the demo misinforms. The example is the acceptance test: each item below
deletes a hand-roll, closes a gap, or states why it stays.

Prior art: [cms-example-FINDINGS.md](./cms-example-FINDINGS.md) /
[cms-example-PLAN.md](./cms-example-PLAN.md) ran findings → plan → adoption;
[cms-demo-PLAN.md](./cms-demo-PLAN.md) is the second round. This doc is the
third: the showcase reading of the 0.12 tree.

## 0. Correctness first: the demo must not lie

Work these before anything else; each is a place the demo misinforms.
**Built** (with tests): site failure/loading/empty via `Loading`/`Empty`/
`Failure` in the three renderer blocks; preview-while-loading; the unified
missing-post treatment with the right back-link and `Not found` title;
the `historyCard` `onRetry` (package) wired in both editors; the worklist
retry (`RetriedList`); chat offline sends kept as a draft with a footer
notice; Publish gated on `canSubmit`; the pages list's retry, through
`RowListView`. Wave 0 is complete.

- **Site failure drawn as loading.** `examples/cms/src/content/site.ts`
  `PostList` (`:925-935`) and `FeaturedPost` (`:937-956`) map every
  non-Ready state, including `Failed`, to busy `waiting()`; `LatestPages`
  (`:968-979`) is a bare `h.p` with no role. Adopt `Loading`/`Empty`/
  `Failure` in the three renderer blocks, as `siteView.ts:55-59` already
  does — which also engages the shipped `Loading.shown` anti-flash CSS.
- **Preview while loading.** `examples/cms/src/views/view.ts:129-140`
  renders "nothing to preview yet" for `Initial`/`Loading` reads, so a
  still-loading post reads as an empty draft. Show the `Loading` branch.
- **Missing-post inconsistency.** `examples/cms/src/views/siteView.ts:37-53`
  renders missing three ways by tag (bare text, `Empty.view`, tab fallback
  `'The blog'`), with the wrong way back for a post (`/site` instead of
  `/site/blog`). One missing-post treatment, correct back-link, correct
  title. No 404 page is prerendered; add one or record why not.
- **Retry everywhere.** Studio lists, editor loads, and history
  (`packages/cms/src/views.ts:127-130`) all dead-end on failure although
  `ListInput.onRetry` exists. Wire retry through the lists and the editor;
  history needs an `onRetry` affordance in the companion first (package
  prerequisite below).
- **Chat offline sends.** `examples/foldkit-websocket-chat/src/main.ts:148-161`
  keeps the draft and tells nothing when the socket is shut. Queue or give
  feedback, and record the policy in a comment (a reader will copy it).
- **Publish versus the form.** Both editor bars gate Publish on
  `may('publish')` + state only
  (`examples/cms/src/views/view.ts:189-196`,
  `pagesView.ts:118-128`); the form's `canSubmit`/`isValid` is never read,
  so validation first meets the author as `Incomplete` after the click.
  Gate or annotate the button from the form; the submit stays the enforcer.

## 1. Adopt the 0.12 contracts

Each lands with its test in the same change, as the 0.12 slices did.

- **SSG adopts `staticSite`.**
  `examples/foldkit-ssg/src/prerender.ts:41-54` re-implemented the core loop
  (guard, layout, writes) and shipped neither sitemap nor robots — and it is
  the only `directory`-layout user, which is tests-only everywhere else.
  **Built:** the example now describes its site in `src/site.ts` and lets
  `staticSite` render it from the client build's `closeBundle`; the hand-roll
  and its `tsx` step are gone, `vite build` alone writes the pages, and the
  sitemap and `robots.txt` land beside them (build-verified).
- **`assembly.runtime` in one real assembly.** Zero app adopters; the
  contract is proven only by its own tests.
  `examples/foldkit-websocket-chat` already has `onMessage` + wiring.
  **Built:** the example boots through `assembly.runtime` (`runtimeConfig`),
  so `init`/Subscriptions/Managed Resources come from the assembly and are
  checked; `entry.ts` and the runtime test share it.
- **Todo agent learns completion.** `examples/todo/src/agent.ts:30-60`,
  the onboarding path, teaches fire-and-forget; `todo-app` next door
  models intent→fact with `correlate` and `requestId`. **Blocked on a
  tooling quirk:** the port (a `CreateTodo` Command + a `SubmittedTodo`
  fact carrying `requestId`) hits `TS2742` — `completion.success:
  Message.SubmittedTodo` makes `AppAgent`'s inferred type reference
  `foldkit/dist/schema/index.js`, unnameable in that example's declaration
  emit (`todo-app` is exempt for a reason not yet found). Annotating widens
  the Message universe and breaks host `dispatch` typing, so it is not a
  cast-away. The README's false completion claim was corrected meanwhile.
- **`Input.view` / `Textarea.view` get their first app callers.**
  `examples/foldkit-websocket-chat/src/main.ts` (`Input.view`
  composer) and
  `examples/foldkit-job-application/src/step/coverLetter/coverLetter.ts`
  (`Textarea.view`). **Built** — both drop the upstream `@foldkit/ui` view
  and the `toView` wrapper. `Input.field` correctly stays out (no
  `FieldValidation.Field` in either place).
- **Small gaps, one batch:** `keepScroll` options in prod
  (`examples/cms/src/apps/studioApp.ts:249`, e.g. a per-app key) — **built**
  (a per-app key, `studioApp.ts` and `siteConfig.ts`);
  `stateBadge(None)` rendered instead of guarded away
  (`examples/cms/src/views/pagesView.ts:73`,
  `shell.ts:141`) — **resolved the other way**: `shell.ts` deliberately omits
  the badge while an entry is being read ("an entry still being read is not
  New"), and the rows pass `Option.some`, so nothing renders `None` here;
  `Data.meta(...).stale/.loading` read, not just
  `.updatedAt` (`examples/foldkit-api-cache/src/main.ts:207`) — **built**
  (the detail footnote says "Refreshing…"/"May be out of date") ;
  `Mirror.bootstrap` meeting `Mirror.routing` in one app
  (`examples/foldkit-query-sync`); `correlate` in kitchen-sink's agent;
  a `FormView.submodel(…, { canSubmit: () => true })` adopter.
- **Staleness gate stays designed, not bolted on.** No plan sets
  `version`, no hydrate passes `fresh` — because nobody has defined what
  the data version *is* (a Remote cursor? a revision?). Define it first;
  the demo follows.

## 2. UX polish

Only after wave 0; polish on top of a lie is paint.

- **Form errors need a focus story.**
  `examples/foldkit-form` reveals errors with no focus move and no summary.
  A browser-tested focus move (`userEvent`, not jsdom dispatch — synthetic
  events move no focus, per the repo's own traps). **Built**: a refused submit
  focuses the first key the form says is missing (`FocusField`, a Command like
  `@foldkit/ui`'s own), covered in `test/focus.browser.test.ts`.
- **Job-app `blockedNotice` should link.**
  `examples/foldkit-job-application/src/view/review.ts:179-184` names
  steps as text with no jump-to-step. Confirm first that unguarded `Next`
  (`src/update.ts:162-164`) is deliberate validate-at-submit, not an
  oversight; then link, don't gate. **Built**: `Next` is deliberate (recorded
  at the arm and in the README), and each step the notice names selects that
  step's tab, so the jump is the navigation the page already has.
- **Site chrome.** No skip link anywhere in scope; no focus management on
  route change; the stretched-card link (`site.ts:623-630`) has no focus
  story; the header/footer clusters are unproven at 320px (screenshot,
  don't guess).
- **Studio smalls.** Pages visitor screen missing the `Go to the site`
  link posts has (`pagesView.ts:185-194` vs `view.ts:354-357`) — **built**
  (wave 0); the schedule input needs its own slot plus an invalid-date hint
  plus clear-on-scheduled (`view.ts:292-312`) — **partly built** (own slot,
  hint); `aria-busy` on the refreshing pages list — **built** (the pages
  list adopts `RowListView`); touch-target width for tabs and toolbar
  buttons.
- **Waitlist duplication.** `textOverride`/`textareaOverride`
  (`examples/foldkit-form/src/main.ts:213-265`) repeat one `draw` —
  parameterize by kind. Settle `isFormValid` vs `isValid` to one spelling
  with the reason recorded. **Built**: the shared `foldkit-mixins-form/ui`
  field override draws both kinds from one place, and the gate is
  `form.value` spelled `everyKeyIsValid`, with why it is neither `isValid`
  nor `canSubmit` recorded beside it.

## 3. Hygiene and docs

Batch these; none changes behavior.

- Dead code, all verified by grep: the `@foldkit/ui` dep in
  `examples/foldkit-form` (comment-only mention), the `clock`/`history`/
  `check` icons (`examples/cms/src/views/icons.ts:35,37,39`), two unused
  `control` imports (`formStyles.ts:9`, `builderStyle.ts:10`), the
  schedule label on a container slot (`view.ts:292`). **Built** (the label
  now has its own `fieldLabel` slot, so it no longer carries `muted`'s
  loading style).
- Six stale READMEs: `packages/bundle` (`Link.child`,
  `assembly.runtime`), `packages/ssr` (the whole static half:
  `staticSite`, `generateStaticSite`, `fileFor`),
  `packages/mixins` (`foundations`), `packages/mixins-ui`
  (`Input.field`/`Textarea.field`), `examples/bundle`, `examples/todo-app`
  (the `correlate`/`requestId` pattern). **Four built** (bundle, ssr,
  mixins, mixins-ui); the two example READMEs were checked and already
  cover it (`todo-app` states the intent→fact/completion pattern;
  `examples/bundle` still matches its `placements.runtime` app).
- One-line doc fix, verified against source: `FieldsOptions.attrs`
  claims per-key overrides ignore attrs
  (`packages/mixins-form/src/index.ts:577-583`), but the code hands them
  over (`:946`, `:977`) and the waitlist relies on it. The doc is wrong,
  not the code.
- Teaching comments worth adding: `statusText` terminal overrides,
  `listing` re-ask rationale, `follow`/`begun` deferral, `Narrowing`
  ownership, `scheduleAt` raw-text discipline, editor-body vs sidebar
  widths, the CMS `hydrate` refusal invariant (the SSG's
  `main.ts:110-114` states it best — copy that sentence).

## Package prerequisites

Each is its own slice, before the wave-1 item that needs it.

- **`historyCard` retry + announced states** (`packages/cms/src/views`):
  an optional `onRetry` with `retry` words, and the Failed/Loading states
  drawn through `role=status`/`alert` views instead of a plain `<p>`.
  **Built**, and wired in both editors to `ReloadAsked`.
- **A list-row ListView variant** (`packages/mixins-crud`): the `status`/
  `retry`/`words`/`aria-busy` contract over `ul`/`li`, so the pages list
  can adopt it without changing its markup contract. **Built** as
  `RowListView` (shared state contract with `ListView`), and the pages
  list adopts it — retry included, its `list`/`listButton` recipes moved to
  `PagesListStyle` over `RowListSlots`.
- **Field views over `InputSlots`** (`packages/mixins-ui`): label,
  description and `aria-invalid` through the slots, so the studio's search
  and schedule inputs can rewire off raw `h.input`.

## Explicitly deferred

- `Link.child` in the routing example: its People page is a Bundle, and
  `placed.update`/`viewIn` already pair — adopting would be a downgrade.
- Promoting the cover letter to a `Form` for a max-length rule, chat
  autoscroll, theme/i18n builds: no real need behind any of them.
- An SSE consumer: none exists, and forcing one invents demand.
- `stateBadge` attribute unification: a markup-contract decision first.
- The `fresh`/`version` demo: needs the data-version definition above.

## Sequence

1. Wave 0 (correctness) plus the `attrs` doc fix; the `historyCard`
   prerequisite rides with the retry item.
2. Wave 1 (adoptions) in listed order; SSG first, since it also covers the
   `directory` layout and the toy problem in one move.
3. Wave 2 (polish) plus the remaining package prerequisites as their own
   slices; hygiene and docs alongside throughout.

Acceptance per item: the named hand-roll deleted or the named gap closed,
with the area's tests — the same rule every 0.12 slice kept.
