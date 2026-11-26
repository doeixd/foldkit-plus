// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 241.9 kB (241,860 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// +500 on 2026-11-14 (#533): `Data.capability` and `Data.available` on the write
// capability; without them the page fit the old ceiling, with them it read 247,233.
// +500 on 2026-11-14 (#560 review): the crud editor reads each member an
// invariant reads in a Selection of its own; the page read 247,439 against
// 247,174 from the same tree with the editor before it (CI read 247,530; crud's
// index.js grew 685 bytes minified).
// +1291 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14: the wire's schemas, the token in each coalesced read, the floors and revisions in the store and reducer. Ceiling raised by that, rounded up.
// +250 on 2026-11-14 (#560 Remote review): the page reads live, and its live stream now names a
// row's revision only for the fields written at it (the store keeps which, the capture carries
// them) and at most 256 revisions; measured 249,168 before and 249,375 after in one tree.
// +211 bytes for `policies` on `Data.wiring` (#236), measured in one tree on 2026-11-14 with
// and without it (249,481 and 249,692): every subscriptions call goes through one function
// taking each key's policy, and the wiring checks the keys it is given. Ceiling raised by that,
// rounded up.
// +700 on 2026-11-15: 249,983 against a ceiling of 249,800. The page on origin/main could not be
// measured here, so the growth is not attributed to one change; the branch's component growth
// (input, toggle, field, radioGroup, dialog) is what the other pages' measurements showed.
// +350 on 2026-11-17 (250,819, against a ceiling of 250,500; the lazy chunk is not counted): the causes measured in chirp, whose page
// holds the same code, each commit built in its own tree: `recipe.add` on every recipe and the
// default look's theme text (+145 there) and #593's `runtimeJson`, Remote's Model schema (+447).
// Nothing from mixins-ui's bundles, choice, configure, calendar, combobox or fileUpload modules is in
// the page; `foldkit-bundle` was already. Ceiling raised to the reading, rounded up.
// +150 on 2026-11-18 (250,896): themed text selection (90ab7073e), the `selection` tokens and the
// rule reading them; with `defaults.ts`, `theme/oklch.ts` and the three recipes that read the
// tokens swapped back in one tree the page passes its old ceiling. Ceiling: the reading, rounded up.
// +150 on 2026-11-19: CI read 251,002. A recipe's `.style` method (cf7645a00) adds 47 minified bytes
// to every page that uses `Style`, measured by its author with the method taken out of one tree;
// the rest of the 106 over the last reading is `Mutation.update/insert/delete` (684308739), which
// this page's Remote carries. Ceiling: the reading, rounded up.
// +850 on 2026-11-19: 251,780 measured after `Expr.add`/`sub`/`implies`, `Entity.transition`,
// `decrement`, row-reading `when` and `Mutation.update`'s `input` (#600) in `foldkit-entity` / `foldkit-remote`.
// +300 on 2026-11-21: CI read 252,242. What this page's Remote gained since v0.43.0 and runs: a read
// answered under a pending write is read again when the late answer disagrees (6782b2e93, +109 here,
// measured by its author), the store's key bookkeeping and the read-entry plan reuse (30d7a5fe0), and
// reads naming their store's field. The opt-in parts (aggregates, the declared-writes skip, declared
// forms, sync transitions) were moved to subpaths first and are not in the page.
// +8,108 on 2026-11-21 (step 5 of the metakit unification plan: entity's judge on metakit through a
// translation layer), -532 the same day (the lean judge), +370 after step 9 (guard's conditions as one
// metakit expression).
// -2,338 on 2026-11-22, permanent: 257,608 measured (260,376 before, in one tree) after step 10. Entity's
// constructors build metakit nodes, the translation layer is deleted, `Expr`, `Query` and `Order` are
// namespaces, and metakit's reading of related rows arrives only with an `Expr.exists` (foldkit-entity
// 83,509 to 76,566 minified, metakit 20,857 to 16,074). What stays over the pre-step-5 252,300 (5,308) is
// metakit's evaluator and judge on every page that reaches entity (16.1 kB minified, `node`,
// `ops/judge`, `ops/laws`, `ops/eval`, `ops/kind` and the operation modules), accepted by the maintainer on
// 2026-11-21. Ceiling: the reading plus 300.
// +1,152 on 2026-11-22: CI on Linux read 258,760 after the Phase 1 gate fixes (an operand past the safe
// range refused by every reader, 63fac3ae0; ops/integerTerm and guard's condition), part of the
// accepted Phase 1 cost. Ceiling: CI's reading plus 300.
// +306 on 2026-11-22 (Phase 5 item 10 of the unification plan): 259,066 measured (258,511 before).
// One rule replays a pending write over a newer value (`foldkit-remote/replay.js`, which replaces
// `keeping.js`, and metakit's `ops/ways.js` rows for `set` and `add`): about 710 bytes minified,
// on every page with writes. Ceiling: the reading plus 300.
// +3,034 on 2026-11-26 (CI read 261,974): metakit's core evaluator and judge grew with Sets,
// Domain.Id/Ordinal and Pipeable/Inspectable, and foldkit-remote gained IVM fixes and Effect
// Clock/Random integration. Ceiling: CI's reading plus ~400, rounded up.
const CEILING = 262_400

clientBudget({
  name: 'reference',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
