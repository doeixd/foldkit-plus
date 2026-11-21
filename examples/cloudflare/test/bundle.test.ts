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
// +8,265 on 2026-11-21, TEMPORARY: 232,465 measured. Step 5 of the metakit unification plan
// put entity's judge on metakit through a translation layer (`lower.ts`, `lowerEnv.ts`,
// `lowerOperator.ts`), so the page carries metakit's node, partial evaluation and operation modules
// (22.5 kB minified) and the layer on top of them, against the old `evaluate.js` it replaced. Step 10
// deletes the layer; forecast after it, estimated from minified size at this page's brotli ratio: 230,500 to 231,800.
// -606 on 2026-11-21, still TEMPORARY: 231,859 measured. The page judges with metakit's lean judge
// (103e5f790): no partial evaluation, property table or reads walker, and `Node.key` left it.
// Step 10 of the unification plan must bring this back to 224,500. Owed: docs/design/metakit-unification-LEDGER.md.
const CEILING = 232_159

clientBudget({
  name: 'cloudflare',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  determinism: true,
})
