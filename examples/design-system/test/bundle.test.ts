// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 184.2 kB (184,173 bytes) measured on 2026-11-12, after `style.ts` moved to
// `foldkit-mixins/vite`'s `modules` and the page stopped loading the style
// compiler (220.7 kB before); the ceiling is that plus about 2%, rounded up to
// the next 500 bytes.
// 191.0 kB on 2026-11-14, after the UI SDK work: the page draws most of the
// catalog, which gained the Dialog's focus fallback and inert exit, the form
// options on Input and its siblings, NumberField's locale parsing, the toast's
// focus and live regions, Command's key routes and the tree's typeahead. The
// ceiling is that plus about 1%.
// 195.3 kB (195,275 bytes) on 2026-11-14, after merging main: +4.3 kB over the reading above. The
// page draws most of the catalog, and the merged tree's widgets carry main's `Keys` routes,
// `FocusRecovery` and `Presence` behaviors beside this branch's kept widget work (SearchField,
// the larger WindowList, Resizable, Sidebar); not bisected between the two. The ceiling is that
// plus about 1%.
// 199.9 kB (199,9xx bytes) on 2026-11-15, after the theme studio: +3.5 kB over the reading above for
// the Segmented radio groups, six Sliders, the tweak/theme Messages and Commands, the generated
// theme data and the token table. The compiler-side `Themes` runtime cannot be imported in this
// client (`modules` refuses it), and the studio now uses the compiler-free `theme/runtime` and `theme/knob-data`.
// The ceiling is that plus about 1%.
// 201.8 kB on 2026-11-15, after the catalog additions: +1.9 kB for the Segmented plan picker, a
// SearchField, a TagsInput and the notification filter (the rebuilt `foldkit-mixins` dist also moved
// with other work in the tree; not bisected). The ceiling is that plus about 1%.
// 205.9 kB after adopting `foldkit-mixins/theme/runtime` and `theme/knob-data`: `knob-data` keeps the
// knob tables and the style code under them (about 4 kB); a generated table is proposed.
const CEILING = 208_000

clientBudget({
  name: 'design-system',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
})
