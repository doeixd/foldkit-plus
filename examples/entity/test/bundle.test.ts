// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 213.4 kB (213,380 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes.
// +500 on 2026-11-14 (#533): `Data.capability` and `Data.available` on the write
// capability, 273 bytes measured with and without them (218,816 against 218,543).
// +500 on 2026-11-14 (#542): a form judging invariants over the row it edits
// (`form.over`, the edit-time judgement) and the Crud editor that sets it, 383
// bytes measured with and without them (218,816 against 218,433).
// +500 on 2026-11-14 (#560 review): CI read 219,013 with the review's fixes
// (the editor's judged reads, the Keys and bound-slot changes); locally the page
// read 218,827, and 218,838 with the editor before its judged reads, so no single
// module of crud's is the growth: brotli over the whole page moved it.
// +918 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14: the wire's schemas, the token in each coalesced read, the floors and revisions in the store and reducer. Ceiling raised by that, rounded up.
// -370 bytes: the law graph's facts left the page for `Module.graph`'s own path (#537 review): measured with and without the move in one tree on 2026-11-14,
// the page fell by that, and the ceiling with it.
// -1,519 on 2026-11-14 (220,522 to 219,003 in fresh builds of 8cca4a535 and the change): Crud.list's
// `live` takes Remote's `liveQuery` from the caller, so Crud no longer keeps liveEvents, liveReads
// and live (5.8 kB minified, `absent` below). Ceiling lowered by that, rounded up.
// +200 on 2026-11-15 (219,003 to 219,197 in fresh builds of b7b4ccd35 and 5586fbe37, nothing
// else in the tree differing): this page uses neither feature, and both sit in modules it
// loads whole. 299 minified bytes in `foldkit-remote/remote.js` (the policies on
// `Data.wiring`, #236) and 219 in `foldkit-surface/index.js` (a Derived as an entry of
// `Projection.struct`). Shortening the one error message each carries moved brotli up, not down.
// +500 on 2026-11-15 (219,197 on origin/main 1bbd87d15, 219,461 here, each from its own `dist`):
// the page draws input, toggle and field, whose modules grew by 0.5, 0.15 and 0.13 kB minified
// on this branch; the dumps differ by nothing else of size.
// +150 on 2026-11-17 (219,989, against a ceiling of 219,850; 219,461 on origin/main 1bbd87d15 on 2026-11-15): the causes measured in chirp, whose page
// holds the same code, each commit built in its own tree: `recipe.add` on every recipe and the
// default look's theme text (+145 there) and #593's `runtimeJson`, Remote's Model schema (+447).
// Nothing from mixins-ui's bundles, choice, configure, calendar, combobox or fileUpload modules is in
// the page; `foldkit-bundle` was already. Ceiling raised to the reading, rounded up.
// +1,000 on 2026-11-18: 220,137 measured, 137 over. The page draws Input, Textarea and Select, and the
// Input recipe gained the grouped start and end sides and the ghost and underline variants
// (`recipes/field.ts`), with `adornments` (0.4 kB minified) beside `input`. The first chunk holds no
// module the page does not draw: `toggleRow` (0.1 kB) is the Checkbox contract's layout Slots, read
// through `CheckboxSlots`. Ceiling raised to the reading plus about 0.4%, rounded up.
// +1,000 on 2026-11-19: CI read 221,307 (+307 over 221,000) after `Expr.add`/`sub`/`implies`,
// `Entity.transition`, `decrement`, row-reading `when` and `Mutation.update`'s `input` (#600).
// +7,710 on 2026-11-21 (step 5 of the metakit unification plan: entity's judge on metakit through a
// translation layer), -534 the same day (the lean judge).
// -2,069 on 2026-11-22, permanent: 226,807 measured (229,294 before, in one tree) after step 10. Entity's
// constructors build metakit nodes, the translation layer is deleted, `Expr`, `Query` and `Order` are
// namespaces, and metakit's reading of related rows arrives only with an `Expr.exists` (foldkit-entity
// 82,319 to 76,123 minified, metakit 20,534 to 15,892). What stays over the pre-step-5 222,000 (4,807) is
// metakit's evaluator and judge on every page that reaches entity (15.9 kB minified, `node`,
// `ops/judge`, `ops/laws`, `ops/eval`, `ops/kind` and the operation modules), accepted by the maintainer on
// 2026-11-21. Ceiling: the reading plus 300.
const CEILING = 227_107

clientBudget({
  name: 'entity',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  // Its lists read nothing live, so none of Remote's live reads may come with Crud.
  absent: ['foldkit-remote/live', 'foldkit-remote/liveReads', 'foldkit-remote/liveEvents'],
})
