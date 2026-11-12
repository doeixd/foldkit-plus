/**
 * The page's built `index.html`, read from the assets the Worker serves, and
 * the build id it carries. A Worker bundles the page's server code beside its
 * routes, but its template is the browser build's output, so the two are
 * paired by the id the build writes into the template (`buildTag`) and the
 * Worker reads back here: a Worker deployed beside another build's page fails
 * loudly rather than render a page the browser's script will not adopt.
 */
import { isolate } from './isolate.js'

/** An assets binding: a Worker's `ASSETS`, or anything that answers a request for a built file. */
export interface Assets {
  readonly fetch: (request: Request | string) => Promise<Response>
}

/** The built template and the build it belongs to. */
export interface Template {
  readonly html: string
  readonly buildId: string
}

/** The `<meta>` name the build id is written under. */
export const BUILD_META = 'foldkit-build'

/**
 * The tag that writes `buildId` into `index.html`: return it from a Vite
 * plugin's `transformIndexHtml`, with the same id given to `foldkit({ buildId })`.
 */
export const buildTag = (buildId: string) => ({
  tag: 'meta',
  attrs: { name: BUILD_META, content: buildId },
  injectTo: 'head' as const,
})

const buildIdPattern = new RegExp(`<meta name="${BUILD_META}" content="([^"]+)"`)

/**
 * The template at `path` (`/index.html`) in the assets `binding` reads from
 * `env`, read once per binding (`isolate`). Rejects, and so is read again on
 * the next call, when the assets hold no such file or it carries no build id.
 */
export const template = <Env>(
  binding: (env: Env) => Assets,
  options: { readonly path?: string } = {},
): ((env: Env) => Promise<Template>) => {
  const path = options.path ?? '/index.html'
  return isolate(binding, async env => {
    const response = await binding(env).fetch(`https://assets.invalid${path}`)
    if (!response.ok)
      throw new Error(`The assets hold no ${path} (${response.status}): build the page first`)
    const html = await response.text()
    const buildId = buildIdPattern.exec(html)?.[1]
    if (buildId === undefined)
      throw new Error(`${path} carries no build id: write one with buildTag in its Vite build`)
    return { html, buildId }
  })
}
