/**
 * The build's half of the example: every page in `prerenderPaths`, rendered
 * into the built `index.html` by `foldkit-ssr`, with its styles in the head.
 * `prerender.ts` writes them out; `entry.ts` takes each over in the browser.
 */
import { Style } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr'

import { Model, init, plan, routing, update, view } from './main.js'
import { STYLESHEET_ATTRIBUTE, stylesheet } from './style.js'

export const prerenderPaths = ['/', '/about'] as const

/** Where the pages are parsed as if served from: a routing `init` reads a full URL. */
const ORIGIN = 'https://example.com'

/**
 * The build a page belongs to: the address of the entry script the template
 * loads, which `entry.ts` reads of itself as `import.meta.url`. A page from
 * another build is refused before the browser adopts it.
 */
export const buildIdOf = (template: string): string => {
  const entry = template.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]
  if (entry === undefined) throw new Error('index.html loads no module script')
  return new URL(entry, ORIGIN).pathname
}

/**
 * The foundations and the classes the page draws, so the first paint is
 * styled before any script runs. The browser's Styles find these classes
 * present and add none of them again.
 */
const head = (rendered: { readonly html: string }): string =>
  `<style ${STYLESHEET_ATTRIBUTE}>${stylesheet}</style><style>${Style.usedIn(rendered.html)}</style>`

/** Every page in `prerenderPaths`, in order, rendered into `template`. */
export const generatePages = (template: string) =>
  SSR.generate({ Model, init, update, view, container: null, routing }, plan, {
    buildId: buildIdOf(template),
    template,
    origin: ORIGIN,
    paths: prerenderPaths,
    head,
  })
