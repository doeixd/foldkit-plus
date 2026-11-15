// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 243.6 kB (243,616 bytes) measured on 2026-11-11; 249.5 kB (249,539) the same
// day with column filters (#144): about 4 kB of it the grid's, which any grid
// pays whether a column filters or not (see examples/data-grid's budget), and
// the rest the page's filter input and price bounds. The ceiling is the
// measure plus about 2%, rounded up to the next 500 bytes.
// 2026-11-14, U-WP1 (#551, #556, #531): foldkit-mixins' resolver.js grew 814
// bytes minified (both contributors named in every ownership diagnostic, and a
// child attribute's Mount composed through its own boundary) and behavior.js
// 406 (each Behavior's attachment metadata, which describe reads), measured by
// minifying the two sources before and after. The page then measured 255,014.
// 2026-11-14, the editor reads each member an invariant reads in a Selection
// of its own (#560 review): foldkit-crud's index.js grew 685 bytes minified,
// and the page measured 255,583 against 255,497 from the same tree with the
// editor before it, in fresh builds of each.
// +619 bytes for the law graph (#537), measured by building the page with and without it in one tree on 2026-11-14: the page calls `Module.manifest`, whose findings are
// `Module.validate`'s and reach the graph's three rules. Ceiling raised by that, rounded up. When the graph took over deriving each contract's
// laws from their declarations (#537 review), the page, which reaches that path, measured +175 bytes in one tree (Sync's facts left it,
// `lawFactsOf` and the derivation came in); the ceiling was not raised for it.
// +1191 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14: the wire's schemas, the token in each coalesced read, the floors and revisions in the store and reducer. Ceiling raised by that, rounded up.
// -2,389 bytes: the law graph left `Module` for `Graph` (#537 review), and the page, which calls
// only `Module.manifest`, keeps none of it (`absent` below): 259,242 before and 256,853 after,
// measured in one tree on 2026-11-14. The +619 raised for the graph is taken back; the rest of
// the drop paid for growth the ceiling was never raised for (U-WP1, the editor's Selections above).
// +276 bytes for a live stream naming the revisions it holds (A-WP9), measured by building the page with and without it
// in one tree on 2026-11-14 (256,853 and 257,129): `LiveRequirement.revisions` on the wire, the held revisions the live
// capability works out and the live entry asks for, and the field passed on by the RPC client. Ceiling raised by that, rounded up.
// +199 bytes for `policies` on `Data.wiring` (#236), measured in one tree on 2026-11-14 with
// and without it (257,263 and 257,462): every subscriptions call goes through one function
// taking each key's policy, and the wiring checks the keys it is given. Ceiling raised by that,
// rounded up.
// 257,640 bytes on CI on 2026-11-15, 40 over, after the UI SDK work: the page draws Input,
// Alert and Card, which gained the form options (`name`, `required`, `readOnly`, `attributes`),
// the live description, `recoveryPart` and Card's `headingLevel`. Not measured module by
// module; the ceiling is that reading plus about 200 bytes.
const CEILING = 257_850

clientBudget({
  name: 'registry',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  // The page reads `Module`, never `Graph`: none of the law graph's modules may come with it.
  absent: [
    'foldkit-surface/graph',
    'foldkit-entity/laws',
    'foldkit-entity/lawIds',
    'foldkit-metadata/evidence',
  ],
})
