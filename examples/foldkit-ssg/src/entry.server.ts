/**
 * The build's half of the example: every page in `prerenderPaths`, rendered
 * into the built `index.html` by `foldkit-ssr`, with its styles in the head.
 * `prerender.ts` writes them out; `entry.ts` takes each over in the browser.
 */
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'

import { Model, init, plan, routing, update, view } from './main.js'
import { stylesheet } from './style.js'

export const prerenderPaths = ['/', '/about'] as const

/** Where the pages are parsed as if served from: a routing `init` reads a full URL. */
const ORIGIN = 'https://example.com'

/**
 * The build a page belongs to: the address of the entry script the template
 * loads, which `entry.ts` reads of itself as `import.meta.url`. A page from
 * another build is refused before the browser adopts it. A file path built
 * with `path.join` carries the platform's separators, which `new URL` keeps
 * as backslashes on Windows while the browser reads forward slashes, and a
 * drive letter parses as a scheme that drops the drive; a drive path is read
 * as a `file:` URL like the browser reads of itself, so the two readings
 * agree on either platform.
 */
export const buildIdOf = (template: string): string => {
  const entry = template.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]
  if (entry === undefined) throw new Error('index.html loads no module script')
  const normalized = entry.replaceAll('\\', '/')
  return new URL(/^[A-Za-z]:\//.test(normalized) ? `file:///${normalized}` : normalized, ORIGIN)
    .pathname
}

/**
 * The foundations and the classes the page draws, so the first paint is
 * styled before any script runs. The browser's Styles find these classes
 * present and add none of them again.
 */
const head = (rendered: { readonly html: string }): string =>
  `<style>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`

/** Every page in `prerenderPaths`, in order, rendered into `template`. */
export const generatePages = (template: string) =>
  SSR.generate({ Model, init, update, view, container: null, routing }, plan, {
    buildId: buildIdOf(template),
    template,
    origin: ORIGIN,
    paths: prerenderPaths,
    head,
  })
