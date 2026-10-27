/**
 * A value the host hands `renderPage` with the request. Foldkit's
 * `handleRequest` calls `renderPage(request)` and nothing more, so what the
 * host holds (a Worker's bindings, a reader built from them) rides the
 * request itself: kept in a `WeakMap` keyed by it, which holds nothing past
 * the request's life and never shares one request's value with another.
 *
 * The Worker and the page bundle Vite built are separate module graphs, each
 * with its own copy of this module, so the map lives on `globalThis` under a
 * registered symbol, and a context is known by its name.
 */
import { Option } from 'effect'

const KEY = Symbol.for('foldkit-ssr/request-context')

type Values = WeakMap<Request, Map<string, unknown>>

const valuesOf = (): Values => {
  const global = globalThis as { [KEY]?: unknown }
  const held = global[KEY]
  if (held === undefined) {
    const made: Values = new WeakMap()
    global[KEY] = made
    return made
  }
  if (!(held instanceof WeakMap))
    throw new Error(`foldkit-ssr: globalThis holds something else under ${String(KEY)}`)
  return held as Values
}

/** A value of type `C` the host attaches to a request, for its `renderPage` to read. */
export interface RequestContext<C> {
  readonly name: string
  /** Keeps `value` for `request` and returns the request. A second value under this name throws. */
  readonly attach: (request: Request, value: C) => Request
  /**
   * The value the host attached to `request`; none when it attached nothing,
   * as Vite's dev server, which builds its own `Request`, or a host that
   * passed on a copy (`new Request(request)`).
   */
  readonly of: (request: Request) => Option.Option<C>
}

/**
 * A request context named `name`. The host and the page each import it from
 * one module, so both agree on `C`; two bundles of that module find each
 * other's values by the name.
 */
export const requestContext = <C>(name: string): RequestContext<C> => ({
  name,
  attach: (request, value) => {
    const values = valuesOf()
    const held = values.get(request) ?? new Map<string, unknown>()
    if (held.has(name))
      throw new Error(`foldkit-ssr: the request already carries a "${name}" context`)
    held.set(name, value)
    values.set(request, held)
    return request
  },
  of: request => {
    const held = valuesOf().get(request)
    return held !== undefined && held.has(name) ? Option.some(held.get(name) as C) : Option.none()
  },
})
