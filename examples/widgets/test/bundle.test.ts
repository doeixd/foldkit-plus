// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 166.0 kB (166,001 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. Raised to 171,000 on 2026-11-14: the navigation primitives'
// `keydown` is now a `Keys` route, which brings the router (its named-key table, overlap check
// and answer) into a page that places one; measured 168,200 before and 169,750 after (#554).
// +300 on 2026-11-15 (#560 review): 170,790 without the review's UI fixes and 171,269 with them in
// one tree, +479: the focus return's way back split from its trail and checked for a frame's
// realm, editable text and a summary taking focus, and a portaled panel's region read from the
// sheets through a probe (the popups carry it). Ceiling raised to the reading, rounded up.
// 174.8 kB (174,824 bytes) on 2026-11-14, after merging main: this branch's kept widget work
// reaches the page (the SearchField widget and its section, WindowList's larger follower,
// Resizable, Sidebar), +3,524 over main's 171,300; the ceiling is that plus about 2%.
// Lowered to 148,000 on 2026-11-15: the page now loads every section but the toolbar and the window
// list when it nears the window (`src/lazy.ts`), so the start chunk holds those two and the shared
// runtime: 144.8 kB (144,8xx bytes), against 187.0 kB when the sections added for newer widgets
// were still in it (178,833 on CI before them). The sections' own chunks (125.6 kB) are not counted.
// +6,500 on 2026-11-16: measured 154,065 with `output.strictExecutionOrder` (vite.config.ts),
// against a page that loaded less and drew nothing: the chunks imported each other, and one
// ran before the helper it called was defined. The growth is Rolldown's per-module wrappers.
// +500 on 2026-11-17: 154,517 measured. The toolbar, which the start chunk holds, now fills a pressed
// tool with the accent (`Recipes.Button.extend` and the accent tokens, in `toolbar/view.ts`), and its
// tools' ghost variant and the buttons' hover fill (`style.ts`) add rules to the sheet.
// +1,000 on 2026-11-18: 155,277 measured, +760 over the last reading. The start chunk's mixins-ui
// modules are the toolbar's, the window list's and the Button recipe's (`recipes/button.ts` and
// `button.ts` gained the states, press and adornment options of the button work, +0.3 kB), and
// `style.ts` of mixins gained `recipe.add` on every recipe. No module the start chunk does not draw
// is in it: the sections' own chunks (file upload included, `lazy.ts`) are lazy and not counted.
// +7,500 on 2026-11-26 (CI read 162,989): foldkit-bundle placement machine-lifting and mixins-ui
// widget/surface updates across the toolbar and window-list start chunks. Ceiling: CI's reading
// plus ~500, rounded up.
// +273 bytes over the last ceiling: MetaKit's W1 correctness fixes (2026-11-28: the checker's drop log, the NUL and NaN screens, throw-free refusal text, the literal domain check, the safe-range SQL guard).
const CEILING = 163_800

clientBudget({
  name: 'widgets',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
