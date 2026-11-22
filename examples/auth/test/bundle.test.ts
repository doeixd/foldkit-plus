// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 223.2 kB (223,245 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. It was 222.9 kB before the password field
// was drawn with `PasswordInput.view` (its Caps Lock hint and requirements), and
// 224.1 kB while PasswordInput imported the Meter for a `strength` this page never draws.
// 226.2 kB (226,226 bytes) measured on 2026-11-15 with the account page (#438),
// whose bodies are a `Bundle.lazy` chunk: 223.5 kB before it, 225.7 kB with the
// page eager. Left to rolldown's own grouping it was 231.3 kB: it groups the boot
// graph by which dynamic chunks import each module, the bodies' imports differ
// from Yielded's client's, and the one shared chunk became three. `vite.config.ts`
// puts every module two chunks share in one `boot` chunk, so the lazy page costs
// its own 0.5 kB of declaration and placement, and `boot.test.ts` holds the loader
// out of it.
// +500 on 2026-11-15: origin/main (1bbd87d15) read 226,448, this branch 226,767. Not attributed
// to one module: the dumps of both builds differed by under 100 bytes in every package the
// page's first chunk reads, so it is the chunks' brotli moving with the component growth
// (input, toggle, field) of the other pages.
// +1,000 on 2026-11-18: 227,397 measured, after the text-field and choice-control work. The Input
// recipe (`recipes/field.ts`) gained the grouped start and end sides and the ghost and underline
// variants, and the Textarea the same frame; the page draws both. Its chunks hold no module it does
// not draw (none of mixins-ui's bundles, choice, configure, calendar, combobox or fileUpload); `press` (0.5 kB
// minified) comes with the Button and Card it draws. Ceiling raised to the reading plus about
// 0.3%, rounded up.
// +500 on 2026-11-19: CI read 228,029 (+29 over 228,000) after recipe `.style` (0.42.0) and
// `Expr.add`/`sub`/`implies`, `Entity.transition`, `decrement` and `Mutation.update`'s `input` (#600).
// +7,675 on 2026-11-21, TEMPORARY: 235,875 measured. Step 5 of the metakit unification plan
// put entity's judge on metakit through a translation layer (`lower.ts`, `lowerEnv.ts`,
// `lowerOperator.ts`), so the page carries metakit's node, partial evaluation and operation modules
// (22.5 kB minified) and the layer on top of them, against the old `evaluate.js` it replaced. Step 10
// deletes the layer; forecast after it, estimated from minified size at this page's brotli ratio: 234,000 to 235,200.
// -507 on 2026-11-21, still TEMPORARY: 235,368 measured. The page judges with metakit's lean judge
// (103e5f790): no partial evaluation, property table or reads walker, and `Node.key` left it.
// Step 10 of the unification plan must bring this back to 228,500. Owed: docs/design/metakit-unification-LEDGER.md.
// +394 on 2026-11-21, still TEMPORARY: 235,762 measured after step 9 (guard's conditions judged as one
// metakit expression; `Condition` is one exported object, so its server code reaches the page). Owed by
// step 10 with the rest; the target stays 228,500.
const CEILING = 236_062

clientBudget({
  name: 'auth',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
