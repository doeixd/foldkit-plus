/**
 * The order a server answers in: the page's built files, then the check that
 * the application knows where it is served, then the application's own
 * routes in the order it wrote them, then its fallback (normally the pages).
 * The host matches paths and nothing else: which addresses are pages, who is
 * asking and what may be cached are the handlers' to decide.
 */
import type { Assets } from './template.js'

/** One server answer: the shape `serveFetch`, Yielded's routes and a Worker's `fetch` share. */
export type Handler<Env> = (request: Request, env: Env) => Promise<Response>

/** The names in `Env` that may hold a string: where the origin can be configured. */
export type Variable<Env> = {
  [P in keyof Env]-?: [Env[P]] extends [string | undefined] ? P : never
}[keyof Env] &
  string

/** `Env` once the origin variable `K` is known to be set. */
export type Configured<Env, K extends PropertyKey> = Env & { readonly [P in K]: string }

export interface RoutesConfig<Env, K extends Variable<Env>> {
  /**
   * The variable naming the origin the application is served at. Unset (or
   * empty), every request but an asset's is answered `500` naming it: the
   * origin is configured, never taken from the request.
   */
  readonly origin: K
  /**
   * The page's built files, answered from the binding under the prefix `at`
   * (`/assets/`) before the origin check, so a server not yet configured still
   * serves its build. Nothing else is answered before that check.
   */
  readonly assets?: { readonly at: string; readonly binding: (env: Env) => Assets }
  /**
   * The application's routes, tried in the order written. A path ending in
   * `/` takes every path under it (`'/auth/'`); any other takes itself alone
   * (`'/remote'`).
   */
  readonly routes: Readonly<Record<string, Handler<NoInfer<Configured<Env, K>>>>>
  /** What answers a request no route took: the pages, normally. */
  readonly otherwise: Handler<NoInfer<Configured<Env, K>>>
}

const matcher = (path: string): ((pathname: string) => boolean) => {
  if (!path.startsWith('/')) throw new Error(`A route's path starts with "/": "${path}" does not`)
  return path.endsWith('/') ? pathname => pathname.startsWith(path) : pathname => pathname === path
}

/**
 * One handler over the application's routes, in the host's order. `Env` is
 * inferred from `assets.binding`'s parameter; without `assets`, name it
 * (`Host.routes<Env, 'ORIGIN'>`).
 */
export const routes = <Env, K extends Variable<Env>>(
  config: RoutesConfig<Env, K>,
): Handler<Env> => {
  const assets =
    config.assets === undefined
      ? undefined
      : { matches: matcher(config.assets.at), binding: config.assets.binding }
  const table = Object.entries(config.routes).map(([path, handle]) => ({
    matches: matcher(path),
    handle,
  }))
  return async (request, env) => {
    const { pathname } = new URL(request.url)
    if (assets !== undefined && assets.matches(pathname)) return assets.binding(env).fetch(request)
    if (!isSet(env[config.origin])) return unset(config.origin)
    // Checked just above: the one place the origin is known to be set.
    const configured = env as Configured<Env, K>
    for (const route of table) if (route.matches(pathname)) return route.handle(request, configured)
    return config.otherwise(request, configured)
  }
}

/** Whether an origin variable holds one: unset and empty are both unset. */
export const isSet = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** The answer when the origin variable `name` is unset: fixed text naming it, and nothing else. */
export const unset = (name: string): Response =>
  new Response(`Set ${name} to where this application is served.`, { status: 500 })
