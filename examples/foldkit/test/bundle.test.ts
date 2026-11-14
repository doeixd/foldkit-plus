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
  // api-cache +209 bytes for the law graph's facts (#537), measured by building the page with and without them in one tree on 2026-11-14: each declared write's `facts`.
  // api-cache +996 bytes for row revisions and read-after tokens on Remote's wire (#544), measured by building the page with and without them in one tree on 2026-11-14.
  ['api-cache', 202_000], // 194,578 bytes
  ['auth', 151_000], // 148,015 bytes
  ['counter', 116_000], // 113,631 bytes
  ['domains', 191_000], // 187,092 bytes
  ['form', 147_000], // 143,904 bytes
  ['job-application', 187_500], // 183,490 bytes
  ['kanban', 137_500], // 134,653 bytes
  ['pixel-art', 155_500], // 152,276 bytes
  ['query-sync', 140_000], // 137,018 bytes
  ['route-transitions', 117_500], // 114,792 bytes
  ['routing', 135_500], // 132,800 bytes
  ['shopping-cart', 122_500], // 119,812 bytes
  ['snake', 117_500], // 114,955 bytes
  ['ssg', 125_500], // 122,802 bytes
  ['ssr', 130_500], // 127,784 bytes
  ['todo', 131_000], // 128,027 bytes
  ['ui-showcase', 200_000], // 195,930 bytes
  ['weather', 126_500], // 123,962 bytes
  ['websocket-chat', 128_500], // 125,779 bytes
]

// Each build runs in a process of its own: these configs import `foldkit-ssr/vite`.
for (const [port, ceiling] of CEILINGS)
  clientBudget({
    name: `foldkit/${port}`,
    dir: resolve(import.meta.dirname, '..', port),
    ceiling,
    childProcess: true,
  })
