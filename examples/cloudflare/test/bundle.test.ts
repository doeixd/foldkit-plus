// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 213.3 kB (213,305 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. 218.5 kB measured on 2026-11-13, against 216.4 kB
// at the same example before the declared-write work: this page registers Mutations, so
// it carries the write capability, and the write's `becomes` enumeration
// (`foldkit-entity` enumerate, footprint, refine: 4.0 kB minified, 2.1 kB brotli) and
// `Data.can` (canOf: 1.1 kB minified) are that capability's own. Read-only pages carry
// none of it (domains-plus is back at its 194.5 kB budget). The ceiling is 218.5 kB
// plus about 2%.
// +1,000 on 2026-11-18: 223,088 measured, 88 over. The page draws Input, Textarea and Select, and the
// Input recipe gained the grouped start and end sides and the ghost and underline variants
// (`recipes/field.ts`), with `adornments` beside `input`; no module the page does not draw is in its
// first chunk. Ceiling raised to the reading plus about 0.4%, rounded up.
// +500 on 2026-11-19: 224,160 measured, 160 over, after `Expr.add`/`sub`/`implies`, `decrement`,
// row-reading `when` and `Mutation.update`'s `input` (#600) in `foldkit-entity` and `foldkit-remote`.
// +8,265 on 2026-11-21 (step 5 of the metakit unification plan: entity's judge on metakit through a
// translation layer), -606 the same day (the lean judge), +374 after step 9 (guard's conditions as one
// metakit expression).
// -2,694 on 2026-11-22, permanent: 229,539 measured (232,300 before, in one tree) after step 10. Entity's
// constructors build metakit nodes, the translation layer is deleted, `Expr`, `Query` and `Order` are
// namespaces, and metakit's reading of related rows arrives only with an `Expr.exists` (foldkit-entity
// 79,708 to 72,698 minified, metakit 20,533 to 15,758). What stays over the pre-step-5 224,500 (5,039) is
// metakit's evaluator and judge on every page that reaches entity (15.8 kB minified, `node`,
// `ops/judge`, `ops/laws`, `ops/eval`, `ops/kind` and the operation modules), accepted by the maintainer on
// 2026-11-21. Ceiling: the reading plus 300.
// +414 on 2026-11-22 (Phase 5 item 10 of the unification plan): 229,953 measured (229,810 before).
// One rule replays a pending write over a newer value (`foldkit-remote/replay.js`, which replaces
// `keeping.js`, and metakit's `ops/ways.js` rows for `set` and `add`): about 710 bytes minified,
// on every page with writes. Ceiling: the reading plus 300.
const CEILING = 230_253

clientBudget({
  name: 'cloudflare',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  determinism: true,
})
