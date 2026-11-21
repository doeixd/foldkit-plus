// @vitest-environment node
/**
 * The client's size budget: the brotli JavaScript the page loads at start, from
 * a build against the packages' `dist` as an installed application gets it
 * (`scripts/bundle-report.mjs`, which prints the table by package).
 */
import { resolve } from 'node:path'
import { clientBudget } from '../../../scripts/bundle-budget.mjs'

// Brotli bytes. Never raise it without saying here what the growth bought.
// 283.9 kB (283,892 bytes) measured on 2026-11-11; the ceiling is that plus about 2%,
// rounded up to the next 500 bytes. Raised to 293,000 on 2026-11-14: the navigation primitives'
// `keydown` is now a `Keys` route, which brings the router (its named-key table, overlap check
// and answer) into a page that places one; measured 289,727 before and 291,338 after (#554).
// Raised to 293,400 on 2026-11-14 for a live stream naming the revisions it holds (A-WP9): the page
// keeps Remote's live capability and live entry whether it reads live or not, and measured 292,749
// without it and 293,110 with it in one tree (`LiveRequirement.revisions` on the wire, the held
// revisions worked out, the field passed on by the RPC client); +361, rounded up.
// -1,640 on 2026-11-14 (293,105 to 291,465 in fresh builds of 8cca4a535 and the change): Crud.list's
// `live` takes Remote's `liveQuery` from the caller, so Crud no longer keeps liveEvents, liveReads
// and live (5.8 kB minified, `absent` below); the live entry and its state stay, which every
// `Data.subscriptions` entry carries. Ceiling lowered by that, rounded up.
// +89 bytes for `policies` on `Data.wiring` (#236), measured in one tree on 2026-11-14 with and
// without it (292,065 and 292,154): every subscriptions call goes through one function taking
// each key's policy, and the wiring checks the keys it is given. Ceiling raised by that, rounded
// up; the page was over it already from other growth (292,065), which this does not cover.
// +750 on 2026-11-15 (#560 review): measured 292,599, over by 699. U-WP13's edge scrolling, which
// the builder's drags never use, is now loaded only when a Mount asks for it: 292,903 without the
// review's UI fixes and 292,599 with them in one tree (-304; the scroller's 1,443 minified bytes
// leave, Vite's preload helper for the dynamic import comes in). The rest is the A3, F2 and C2
// fixes and the wave's other growth the investigation attributed. Ceiling raised to the reading,
// rounded up.
// +293 on 2026-11-14, after merging main: measured 292,943 (main's reading 292,599). The page draws
// the builder's widgets, which carry this branch's kept widget work beside main's primitives; not
// bisected. Ceiling raised to the reading, rounded up.
// +100 on 2026-11-15, the widget round on this branch: measured 293,074 against 292,830 for main
// (ab3421ba6) in fresh builds of both, +244. By module (minified): recipes/design.js +165
// (`filledHover`, a filled field's hover fill, for Input, Select and Listbox), recipes/select.js
// +67 (its filled look's invalid edge), recipes/button.js +42 (a pressed primary Button's fill),
// foldkit-builder and foldkit-mixins-builder +50 between them; the other 40-odd moved modules are
// within +-14 each and sum to about -80. It was 293,068 before `filledHover` moved from
// recipes/field.js to design.js; it is the same page. Ceiling raised to the reading, rounded up.
// +100 on 2026-11-15 for the studio's focus Commands (focus.ts): measured 293,138 against 293,074
// before it, +64 (a Command per open and close of an editor, in both sections). Ceiling raised to
// the reading, rounded up.
// +25,300 on 2026-11-15 for Markdown bodies: the site and the studio's preview read a post's
// Markdown into a rich-text document (`markdownBody.ts`) and draw it with the standard rendering,
// which brings the Markdown parser (micromark, mdast, GFM) and the rich-text renderer into the
// page: measured 317,844 against 293,138 before. It replaces the 60-line hand parser, which
// drew only paragraphs, headings, lists and code. Ceiling raised to the reading, rounded up.
// Lowered to 164,000 on 2026-11-15 (163.2 kB measured): the entry now holds only what both
// applications share (the runtime, Remote, Entity and the start-up), since the studio and the
// public site are chunks of their own, loaded by the address (`client.ts`). What each screen loads
// first is held by `routes.test.ts`, which adds the chunk: studio 366.6 kB, site 322.2 kB.
// +500 on 2026-11-19: CI read 164,044 (+44 over 164,000) after `Expr.add`/`sub`/`implies`,
// `Entity.transition`, `decrement`, row-reading `when` and `Mutation.update`'s `input` (#600).
// +7,711 on 2026-11-21, TEMPORARY: 171,911 measured. Step 5 of the metakit unification plan
// put entity's judge on metakit through a translation layer (`lower.ts`, `lowerEnv.ts`,
// `lowerOperator.ts`), so the page carries metakit's node, partial evaluation and operation modules
// (22.5 kB minified) and the layer on top of them, against the old `evaluate.js` it replaced. Step 10
// deletes the layer; forecast after it, estimated from minified size at this page's brotli ratio: 170,000 to 171,300.
// -331 on 2026-11-21, still TEMPORARY: 171,580 measured. The page judges with metakit's lean judge
// (103e5f790): no partial evaluation, property table or reads walker, and `Node.key` left it.
// Step 10 of the unification plan must bring this back to 164,500. Owed: docs/design/metakit-unification-LEDGER.md.
const CEILING = 171_880

clientBudget({
  name: 'cms',
  dir: resolve(import.meta.dirname, '..'),
  ceiling: CEILING,
  childProcess: true,
  // Its lists read nothing live, so none of Remote's live reads may come with Crud.
  absent: ['foldkit-remote/live', 'foldkit-remote/liveReads', 'foldkit-remote/liveEvents'],
})
