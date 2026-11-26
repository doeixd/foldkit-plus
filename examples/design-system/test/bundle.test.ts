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
// 149.8 kB (149,848 bytes) on 2026-11-15, after the catalog moved into islands (`src/islands.ts`,
// `src/sections/*.ts`): the page loads the theme studio, its specimen and the static sections, and
// each other section's code, 91.8 kB brotli in 25 lazy chunks, arrives as it nears the window. It was
// 205.9 kB with everything at start. The ceiling is that plus about 1%; `absent` pins the modules that
// only an island uses, so one imported from the start code again fails here.
// +900 on 2026-11-26 (CI read 151,959): foldkit-bundle's placement machine-lifting symbol path and
// foldkit-surface diagnostics updates. Ceiling: CI's reading plus ~400, rounded up.
const CEILING = 152_400

clientBudget({
  name: 'design-system',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  absent: [
    'combobox',
    'datePicker',
    'calendar',
    'listbox',
    'menu',
    'tagsInput',
    'searchField',
    'patterns',
    'table',
    'toast',
    'tabs',
    'fileDrop',
    'radioGroup',
  ].map(name => `foldkit-mixins-ui/${name}`),
})
