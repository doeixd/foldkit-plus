/**
 * The second half of `pnpm build`, after Vite: each page in `prerenderPaths`
 * written into the build's output where a static host serves it
 * (`/about` as `about/index.html`).
 */
import { Effect } from 'effect'
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { Model, init, plan, prerenderPaths, routing, update, view } from './main.js'
import { stylesheet } from './style.js'

/**
 * The deployment the pages belong to: the same `FOLDKIT_BUILD_ID` the
 * `foldkit` Vite plugin compiled into the client bundle, so the browser
 * adopts the pages instead of refusing them. A build id must never be a
 * secret, and two deployments must never share one; a commit or release tag
 * does.
 */
const buildId = process.env.FOLDKIT_BUILD_ID
if (buildId === undefined || buildId === '') {
  throw new Error(
    'set FOLDKIT_BUILD_ID to the deployment this build belongs to, the same value `vite build` saw',
  )
}

/** Where the pages are parsed as if served from: a routing `init` reads a full URL. */
const ORIGIN = 'https://example.com'

/**
 * The foundations and the classes the page draws, so the first paint is
 * styled before any script runs. The browser's Styles find these classes
 * present and add none of them again.
 */
const head = (rendered: { readonly html: string }): string =>
  `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`

const out = process.argv[2] ?? 'dist'
const pages = await Effect.runPromise(
  SSR.generate({ Model, init, update, view, container: null, routing }, plan, {
    buildId,
    template: await readFile(join(out, 'index.html'), 'utf8'),
    origin: ORIGIN,
    paths: prerenderPaths,
    head,
  }),
)
for (const page of pages) {
  const file = join(out, page.file)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, page.html)
}
console.log(`prerendered ${pages.map(page => page.path).join(', ')} into ${out}`)
