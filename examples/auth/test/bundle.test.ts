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
// +7,675 on 2026-11-21 (step 5 of the metakit unification plan: entity's judge on metakit through a
// translation layer), -507 the same day (the lean judge), +394 after step 9 (guard's conditions as one
// metakit expression).
// -2,796 on 2026-11-22, permanent: 232,966 measured (235,736 before, in one tree) after step 10. Entity's
// constructors build metakit nodes, the translation layer is deleted, `Expr`, `Query` and `Order` are
// namespaces, and metakit's reading of related rows arrives only with an `Expr.exists` (foldkit-entity
// 55,973 to 47,347 minified, metakit 19,698 to 15,218). What stays over the pre-step-5 228,500 (4,466) is
// metakit's evaluator and judge on every page that reaches entity (15.2 kB minified, `node`,
// `ops/judge`, `ops/laws`, `ops/eval`, `ops/kind` and the operation modules), accepted by the maintainer on
// 2026-11-21. Ceiling: the reading plus 300.
// +875 on 2026-11-22: CI on Linux read 233,841 after the Phase 1 gate fixes, which every page that
// evaluates carries: an operand past the safe range refused by every reader (63fac3ae0: ops/judge,
// ops/kind, ops/laws, ops/num) and a fraction beside an integer term refused (ops/integerTerm, guard's
// condition). Part of the Phase 1 cost the maintainer accepted. Ceiling: CI's reading plus 300.
// +2,359 on 2026-11-26 (CI read 236,063): metakit's core evaluator and judge grew with Sets,
// Domain.Id/Ordinal and Pipeable/Inspectable, and foldkit-remote/sync gained IVM and Effect
// integration. Ceiling: CI's reading plus ~400, rounded up.
const CEILING = 236_500

clientBudget({
  name: 'auth',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
