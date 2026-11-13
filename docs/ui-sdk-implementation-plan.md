# Plan: UI SDK issues and implementation review

## Goal and scope

Address the eight open issues [#551](https://github.com/doeixd/foldkit-plus/issues/551), [#552](https://github.com/doeixd/foldkit-plus/issues/552), [#553](https://github.com/doeixd/foldkit-plus/issues/553), [#554](https://github.com/doeixd/foldkit-plus/issues/554), [#555](https://github.com/doeixd/foldkit-plus/issues/555), [#556](https://github.com/doeixd/foldkit-plus/issues/556), [#557](https://github.com/doeixd/foldkit-plus/issues/557), and [#558](https://github.com/doeixd/foldkit-plus/issues/558). The [UI SDK review and comparison matrix](https://github.com/doeixd/foldkit-plus/blob/ui-sdk-core-review/docs/ui-sdk-core-review.md) supplies the broader inventory. Baseline checked: Foldkit `origin/main` at `3c601ebfb74f2497def7b5fe413e5a22fa816b2e`; UI SDK `d6996097b9f8dbe5fe98c3f04210b9daa969a06c`. Refresh issue status and main before execution; this checkout has unrelated edits and must not be reset.

Completion means each acceptance criterion in #551–#557 is met or its issue is updated with an explicit, evidence-backed changed scope; every row in #558's matrix has an inspected-source disposition, with demonstrated gaps fixed or tracked as specific linked follow-ups. The coordinator reviews integration, relevant CI and issue status; no issue is closed merely because an audit or agent finished.

Read the corresponding upstream implementation **and tests** beside the current Foldkit implementation and tests before designing each slice. Trace event ownership, transitions, lifecycle, cleanup, accessibility, security and performance. Bring across useful techniques within Foldkit's existing Model/Message/update, Slots, Behavior, Bundle and Surface boundaries. Use runnable fixtures and examples as first consumers; do not defer a useful capability merely because an application does not already use it. If an item is not built, record a concrete reason such as an upstream blocker, an unsound design, measured cost, or ownership by a separate package.

## Sequencing and dependencies

1. **Baseline and contracts.** Coordinator uses a clean worktree based on current `origin/main`, reads `AGENTS.md`, the Foldkit Plus skill and relevant references, records current issue status and checks the review against current code. Build the #551 search-field fixture and the review ledger described below. Resolve shared API boundaries before parallel implementation.
2. **Mount composition prerequisite.** Address open [#531](https://github.com/doeixd/foldkit-plus/issues/531) or implement its narrowly agreed prerequisite first: a `ChildAttribute` holding `OnMount` must not silently lose a composed mount. Confirm real runtime behavior and cleanup. This gates mount integration for #553 and #555, not independent planning or pure code. Preserve the protections from closed [#523](https://github.com/doeixd/foldkit-plus/issues/523).
3. **Interaction foundations.** Build #553 focus recovery and #554 keyboard routing in parallel only after agreeing on slot, event and lifecycle contracts and assigning disjoint files. Integrate #555 presence and focus policy after #553 and #531 are settled. Conformance work in #552 can begin in parallel against stable fixture interfaces; coordinate its providers with #554.
4. **Composition and inspection.** Finish #551's examples and inference decisions as foundations stabilize. Implement #552 obligations and #556 inspection around the same declarations; #556 consumes existing graph identities and #551's fixture. Agree the narrow graph seam with open [#190](https://github.com/doeixd/foldkit-plus/issues/190); do not wait for all of #190 if that seam is independently usable, and do not invent a competing graph. Keep the broader law/evidence work in #537/#541 out of this slice.
5. **Authorized UI discovery.** Design and implement #557 after the fixture, identity, exposure, availability and completion seams are agreed. Coordinate the necessary subset of open [#190](https://github.com/doeixd/foldkit-plus/issues/190) and [#533](https://github.com/doeixd/foldkit-plus/issues/533); distinguish truly blocked integration from work that can proceed with existing contracts. Closed #482 is existing test prior art; open #480 is not automatically a prerequisite. Security-sensitive API and independent review stay with the most capable model.
6. **Complete #558.** Run the matrix ledger in parallel with the preceding lanes. Integrate fixes in small coherent slices and reconcile overlap with #551–#557. Build useful capabilities where the evidence and architecture justify them; create scoped follow-up issues for separately sized work and record concrete blockers rather than leaving vague audit items.

## Work packages and acceptance

### A. Authoring and shared fixtures — #551

- Use the current shipped APIs to create a search field and editable/dismissible list; add a popup/selection fixture when inference needs it. Show a shipped recipe, override, attached behavior, parent placement and two independent instances. Record repetition before designing a helper.
- If needed, implement the smallest pipeable assembly that lowers to existing values, preserves anatomy/state/behavior/renderer replacement and introduces no store or second reducer. Coordinate #190 rather than adding a placement layer.
- Acceptance: runnable examples and scaffold checks; type fixtures reject foreign Messages, incompatible inputs and unknown slots at the boundary, preserving inference; compare type-check cost to the explicit form under #190's budget. Use focused browser coverage for behavior, and update docs to distinguish using, customizing, assembling and authoring.

### B. Accessibility contracts and behavior — #552 and #558

- Extend existing `packages/mixins/src/a11y.ts` and `packages/mixins-ui/src/patterns.ts` only as needed for option/listbox and checkbox obligations. Bind a provider to an obligation, support native controls and named delegation, revalidate on replacement/removal and keep declared support, structural validation and observed behavior distinct.
- Build reusable rendered scenarios for listbox, tree, dialog and tabs without a second role catalog. Use Chromium for focus, pointer, layout, keyboard, disabled states, RTL and nested dialogs; check accessible names/relationships and SSR separately. Assertions must prove a real change and new tests must be mutation-checked under the project rules.
- Acceptance: literal errors at authoring, runtime diagnostics for dynamic definitions, valid incremental adoption and measured type cost; omitted providers fail with useful slot/obligation names. No static claim that arbitrary closures prove accessibility or WCAG compliance.

### C. Focus and lifetime — #531, #553, #555

- Fix/resolve the composed Mount loss first. For #553 compare UI SDK focus recovery with `packages/primitives/src/dom/follow-tab-stop.ts` and the current behavior attachment. Design one lifecycle-scoped mechanism supporting contextual fallback and nested ownership without changing FollowTabStop's existing meaning.
- Exercise a clear button, keyed dismissible row and nested branch: removed last item, next/previous/parent/input fallback, reordering, CSS-special IDs, missing or disconnected targets, teardown and two independent widgets. Focus newly moved elsewhere must never be stolen; cleanup must release listeners.
- For #555 compose existing Presence with interaction and accessibility eligibility, focus recovery and popup/list exit. Decide exactly when the focused descendant loses eligibility and avoid double recovery. Test hide/show races, stale completions, reduced motion, SSR, nested parts and competing focus. Keep one owner for completion and Model state.
- Acceptance: real-browser focus, timing, pointer and keyboard tests; clock-based tests for generation/reduced motion; regression coverage proves composed mounts execute and clean up.

### D. Keyboard routing — #554

- Design one explicit keydown owner with named routes. Compose Escape-to-clear with ArrowDown-to-open; report conflicting Escape contributors unless precedence is explicit. Preserve protected base handlers and ChildAttribute protections; do not make generic chaining or implicit last-writer-wins the new default.
- Specify observation versus interception, dynamic predicate ordering, IME, modifiers, repeat, cancellation and propagation. Acceptance: unhandled editing keys retain native behavior; correct Messages only; diagnostics identify slot, event and contributors; browser and targeted unit/type tests cover these rules.

### E. Inspection and discovery — #556 and #557

- #556: inspect the #551 assembled search field by consuming the existing contract graph and slot/behavior/recipe/pattern metadata. Describe stable slot and attachment identities, order, providers and known application links. Keep dynamic closure dependencies explicitly unknown; separate pure inspection from optional resolution for supplied input. Never execute Mounts, Commands or updates or serialize DOM references/secrets. A generated example and a conflict diagnostic consume the same description; replacement leaves the original view unchanged.
- #557: pilot a labeled search field and save/edit form against explicit Surface/Agent capabilities, projected data, availability and existing completion contracts. Accessible labels are descriptive; duplicate labels must be ambiguous. Distinguish stable application identity from mounted occurrences, including repeated rows, off-page and remounted controls.
- Acceptance: authorization, principal filtering, redaction and unavailable capability rules apply before discovery and invocation; mounted DOM never grants authority. Browser and headless paths reach the same update and share outcome assertions for refusal, failure, overlap and correlated pending/success/failure. Headless discovery must not require DOM. Independent security review covers identity, cross-principal leakage and completion correlation.

### F. Full review matrix — #558

Create a source-linked ledger with one disposition for **each** review matrix row: state/composition; roving/grid and spatial focus; removal recovery; typeahead; item and cell-range selection/clipboard; lasso; pointer/keyboard reorder and transfer; move/resize/gestures; virtualization; bottom-following; trees/checking; text/inline editing; popup/layers; motion/presence; announcements/shortcuts; preferences/storage; mobile viewport; undo/observation; agent interfaces; accessibility; styles/recipes; and widget catalog. Record upstream and current Foldkit implementation and tests, precise semantic differences, evidence, decision, owner/issue and verification. Explicitly compare all behavior-index helpers within each family; record component-specific and value subpaths separately where relevant rather than assuming the index is exhaustive.

Start with existing `Virtual`, `MessageScroller`, `Themes`, data grid, pointer drag, overlay and recipes. Check find-in-page and virtual focus, prepend scrolling, pre-paint/SSR themes, RTL, nested overlays, drag preview/edge scrolling, checked tree propagation, IME and locale, geometry/lasso/canvas connections, and change attribution. For real gaps, implement through the current owner with an example or test as first consumer; scope independently sized features into linked issues. Update the review matrix with evidence and disposition, distinguishing verified overlap, implemented gap, explicitly justified deferral and unresolved blocker. #558 closes only when every row and linked follow-up has an accountable disposition, not when every speculative feature is silently excluded.

## Subagent execution and coordination

The coordinator owns architecture, sequencing, integration and security-sensitive choices. Delegate ordinary well-scoped implementation/investigation to an economical suitable model; mechanical measurements/docs to the cheapest suitable model; published API design, cross-package contracts, security and independent reviews to the most capable model. Actual model names depend on the available provider; do not assume Haiku/Sonnet are selectable. Parallelize only disjoint file sets, with one owner for shared exports, pattern catalogs, examples and skill references; serialize handoffs that touch them. Never run concurrent Wrangler/login operations.

Suggested waves (adapt after baseline):

| Wave | Parallel assignment | Files / output boundary | Coordinator gate |
| --- | --- | --- | --- |
| 0 | Read-only ledger; #551 fixture design; #531 diagnosis | Separate reports; no shared edits | Agree fixtures, public boundaries and real blockers. |
| 1 | #531 resolver + regression; #554 keyboard routing; #558 list/virtual/motion audit | Disjoint resolver, routing and audit files; coordinator owns shared barrels | Review #531; avoid integrating focus mounts before it. |
| 2 | #553 focus recovery; #552 obligations; #558 drag/canvas/overlay audit | Partition primitives DOM/interaction, mixins A11y, and separate audit outputs; agree fixture contract | Merge #531 first; reconcile provider metadata and focus API. |
| 3 | #555 presence integration; #551 examples; #556 inspection | Separate motion/overlay, examples, and graph inspection files; coordinator owns shared fixtures/exports | Reconcile #553 and #552 contracts; review #190 seam. |
| 4 | #557 authorized bridge; #558 remaining rows/fixes; independent review | Security-sensitive bridge by capable agent; separate audit/fix files; independent reviewer edits nothing | Verify #533 availability and completion seams; assess review findings. |

Each implementation brief must name exact owned files, others' files, contract, acceptance evidence, relevant skill/reference, applicable targeted checks and mutation spec, public API/Jev requirements, and explicit exclusions. Spell out shared-worktree precautions, explicit-path commits and the repository's temp-index/never-commit rules; do not commit another agent's edits. Agents report commit and evidence, push as instructed by project guidance, and do not wait for or run CI. Coordinator integrates in dependency order, checks CI and closes issues only after evidence is complete. If edits cannot be made disjoint, serialize or use isolated worktrees and integrate deliberately.

## Verification and completion

Choose checks by changed behavior and risk; do not run the full test suite or build automatically after each commit. Run focused unit/type checks, real browser tests for focus/layout/pointer claims, and mutation specs for new tests; expand only when the change warrants it. Compare documentation and skill snippets with source and compile them as the skill guidance requires. Review public API diffs with Jev when required, including updated README/skill references, and address results under the repository's iteration rules. Review authorization and lifecycle changes independently. Record commands, failures and CI links per slice; do not claim parity or a passed check without evidence.
