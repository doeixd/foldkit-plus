// @vitest-environment node
/**
 * The size budget of each Foldkit port's client: the brotli JavaScript the page
 * loads at start, from a build against the packages' `dist` as an installed
 * application gets it (`scripts/bundle-report.mjs`, which prints the table by
 * package). One table, since the ports share their build.
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes, measured on 2026-11-11 (the reading is the comment); each ceiling is that
// plus about 2%, rounded up to the next 500 bytes. Never raise one without saying here what
// the growth bought.
const CEILINGS: ReadonlyArray<readonly [port: string, ceiling: number]> = [
  // 199,529 bytes on 2026-11-14: the page registers Mutations, so the declared-write work
  // reaches it (`foldkit-entity` enumerate 2.8 kB minified, write 0.8, refine 0.6, footprint
  // 0.6, invariant 0.5; `foldkit-remote` remote 0.4); ceiling that plus about 0.5%.
  // api-cache: +209 bytes were raised for the law graph's facts (#537), which then left the page for `Module.graph`'s path; measured with and without the move in one tree on 2026-11-14 the page
  // declares no write and moved +43 bytes (70 fewer minified), so the ceiling stays.
  // api-cache +996 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14.
  // api-cache +1,464, job-application +1,697, ui-showcase +1,836, pixel-art +134 on 2026-11-15 against
  // origin/main (1bbd87d15), built from each tree's own `dist` (201,775 to 203,239; 186,134 to 187,831;
  // 199,495 to 201,331; 155,637 to 155,771). Tabs' key routes load `behaviors/keys.js`, 3,884 minified
  // bytes (about 1.4 kB brotli) on every page that draws Tabs, `id-selector.js` 101 and `tabs.js` 116;
  // the other growth is the components' own: radioGroup 0.6 kB, input 0.45, textarea 0.4, dialog 0.6,
  // toggle 0.15, field 0.13 minified. Pages without them moved less than 150 bytes. Ceilings are the
  // reading plus about 0.5%, rounded up to 500; the theme's storage streams are named exports, so
  // no page carries them.
  // api-cache +681 and auth +389 on 2026-11-17 against the last green main (203,723 and 150,619),
  // each commit built in its own tree: +367 and +389 from `style.ts` (+454 minified: `recipe.add` is a
  // member of every recipe) and the shadows' and tints' knob data; api-cache +314 more from #593's
  // `runtimeJson` (Remote's Model schema, 1.7 kB minified). No module was added to either page.
  ['api-cache', 204_500], // 204,404 bytes
  // 2026-11-18: auth, form, routing, shopping-cart, weather and websocket-chat each grew past their
  // ceiling: 151,886, 147,400, 135,620, 122,513, 126,693 and 129,129. The six draw Input, Textarea
  // or Field, and the Input recipe (`recipes/field.ts`) gained the grouped start and end sides and
  // the ghost and underline variants, with `adornments`, `input` and `textarea` beside it; counter and
  // the pages without a text field moved by under 20 bytes. Their first chunks hold no mixins-ui module
  // the pages do not draw (none of bundles, choice, configure, calendar, combobox, fileUpload or
  // rowContent). Each ceiling is the reading plus about 0.5%, rounded up to 500.
  ['auth', 152_500], // 151,886 bytes
  // counter was 115,953 on origin/main (1bbd87d15), 47 under its ceiling; 115,981 here.
  // counter +193 and kanban +171 on 2026-11-18 from themed text selection (90ab7073e), measured in
  // one tree with `defaults.ts` and `theme/oklch.ts` swapped back (115,942 and 137,346): the
  // `selection` tokens and the `:where(*)::selection` rule reading them. Ceilings: the reading, rounded up.
  // counter +151 on 2026-11-19 (116,286): recipe `.style` method (0.42.0) in `foldkit-mixins`.
  ['counter', 116_500], // 116,286 bytes
  ['domains', 191_000], // 187,092 bytes
  // form +65 over 148,000 on 2026-11-19 (148,065, down from 153,234 once `expr.ts` stopped
  // pulling `jsonSchema.ts` via `Law`): `Expr.add`/`sub`/`implies`, `in:` and `Entity.transition` (#600).
  ['form', 148_500], // 148,065 bytes
  ['job-application', 188_500], // 187,831 bytes
  ['kanban', 137_600], // 137,517 bytes
  // pixel-art +200 on 2026-11-15 (#560 review): 155,275 without the review's focus fixes and 155,637
  // with them in one tree, +362 (its dialogs' FocusReturn: the way back split from the trail, a
  // frame's own trail held weakly, the realm check); ceiling raised to the reading, rounded up.
  ['pixel-art', 156_000], // 155,771 bytes
  ['query-sync', 140_000], // 137,018 bytes
  ['route-transitions', 117_500], // 114,792 bytes
  ['routing', 136_500], // 135,620 bytes
  ['shopping-cart', 123_500], // 122,513 bytes
  ['snake', 117_500], // 114,955 bytes
  ['ssg', 125_500], // 122,802 bytes
  ['ssr', 130_500], // 127,784 bytes
  ['todo', 131_000], // 128,027 bytes
  ['ui-showcase', 202_000], // 201,331 bytes
  ['weather', 127_500], // 126,693 bytes
  ['websocket-chat', 130_000], // 129,129 bytes
]

// Each build runs in a process of its own: these configs import `foldkit-ssr/vite`.
for (const [port, ceiling] of CEILINGS)
  clientBudget({
    name: `foldkit/${port}`,
    dir: resolve(import.meta.dirname, '..', port),
    ceiling,
    childProcess: true,
  })
