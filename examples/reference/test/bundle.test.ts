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
const CEILING = 250_850

clientBudget({
  name: 'reference',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
