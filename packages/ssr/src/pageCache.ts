/**
 * What `SSR.entry` needs to keep a rendered page (#428): a request that
 * records which of its headers the render read, and a page as a store keeps
 * it. A page is kept only when every header the render read was absent, so
 * it was drawn from the URL alone and serves every request that also lacks
 * them; the names it read are its `Vary`.
 */
import { Effect, Option, Schema } from 'effect'
import type { RenderedApplication } from 'foldkit/experimental/server'
import { watchedOf } from './requestContext.js'

/** What a render read of its request's headers: names, or every one. */
export interface HeadersRead {
  readonly names: Set<string>
  all: boolean
}

/**
 * `request` as the render sees it, every header it reads recorded in `read`.
 * A lookup by name records that name; enumerating the headers records all.
 * Everything else is the request's own, so its getters keep their receiver.
 * A request context read of it (`SSR.requestContext`) is the host's request's,
 * and records all: what a host attaches may say who is asking.
 */
export const tracked = (request: Request, read: HeadersRead): Request => {
  const headers = new Proxy(request.headers, {
    get: (target, property) => {
      const value: unknown = Reflect.get(target, property, target)
      if (typeof value !== 'function') return value
      if (property === 'get' || property === 'has') {
        return (name: string) => {
          read.names.add(name.toLowerCase())
          return value.call(target, name)
        }
      }
      read.all = true
      return value.bind(target)
    },
  })
  const watched = new Proxy(request, {
    get: (target, property) => {
      if (property === 'headers') return headers
      // `clone` would hand out a request this one cannot see into.
      if (property === 'clone') read.all = true
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  watchedOf().set(watched, {
    original: request,
    readContext: () => {
      read.all = true
    },
  })
  return watched
}

/** Whether a page drawn from `read` serves `request`: it carries none of the headers read. */
export const fits = (request: Request, vary: ReadonlyArray<string>): boolean =>
  vary.every(name => !request.headers.has(name))

/** A kept page: what the host draws, its status and headers, and the headers it must lack. */
export const KeptPage = Schema.Struct({
  application: Schema.Struct({
    html: Schema.String,
    title: Schema.String,
    lang: Schema.optionalKey(Schema.String),
    dir: Schema.optionalKey(Schema.Literals(['ltr', 'rtl', 'auto'])),
    canonical: Schema.optionalKey(Schema.String),
    ogUrl: Schema.optionalKey(Schema.String),
  }),
  status: Schema.optionalKey(Schema.Number),
  headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  vary: Schema.Array(Schema.String),
})
export type KeptPage = typeof KeptPage.Type

export const decodeKept = Schema.decodeUnknownOption(Schema.fromJsonString(KeptPage))

const DAY_MS = 86_400_000

/**
 * A page with each time stamped on it as `T`: a run of 13 digits within a
 * day of `now`, as milliseconds since the epoch read now are (a read's
 * `updatedAt` in the resumed Model). A page drawn a moment later is stamped
 * later, and is still the same page.
 */
const unstamped = (text: string, now: number): string =>
  text.replace(/\b\d{13}\b/g, digits => (Math.abs(Number(digits) - now) < DAY_MS ? 'T' : digits))

/** Whether two renders drew the same page: what the host draws, and its status. */
export const samePage = (
  a: { readonly application: RenderedApplication; readonly status?: number | undefined },
  b: { readonly application: RenderedApplication; readonly status?: number | undefined },
  now: number,
): boolean =>
  unstamped(JSON.stringify([a.application, a.status ?? 200]), now) ===
  unstamped(JSON.stringify([b.application, b.status ?? 200]), now)

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')

/**
 * Where a page is kept: by its build and its full URL, under the request's
 * origin, since the Workers Cache API keys by URL. A deploy's pages never
 * meet another build's.
 */
export const pageKey = (buildId: string, url: string): Effect.Effect<string> =>
  Effect.promise(() =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${buildId}\n${url}`)),
  ).pipe(Effect.map(digest => `${new URL(url).origin}/__foldkit/cache/page/${hex(digest)}`))

/** The value a `Rendered` result's `headers` gives, none when absent. */
export const headerOf = (headers: HeadersInit | undefined, name: string): Option.Option<string> =>
  Option.fromNullishOr(headers === undefined ? null : new Headers(headers).get(name))

/** The pages `SSR.entry` serves from its cache, by the object it serves. */
export const keptApplications = new WeakSet<RenderedApplication>()

/** The most documents `keptDocuments` holds: each is a whole page's markup. */
const KEPT_DOCUMENTS = 32

/**
 * `render`, remembering the document it drew for each kept page (one
 * `SSR.entry` serves from its `cache`), by the page and the assets: the
 * host draws a page into its document on every request, which parses the
 * page again (`injectIntoTemplate`), so a kept page would cost that much
 * every time it is served. Any other page is drawn as `render` draws it.
 */
export const keptDocuments = <Assets>(
  render: (application: RenderedApplication, assets: Assets) => string,
) => {
  const drawn = new Map<string, string>()
  return (application: RenderedApplication, assets: Assets): string => {
    if (!keptApplications.has(application)) return render(application, assets)
    const key = JSON.stringify([application, assets])
    const held = drawn.get(key)
    if (held !== undefined) return held
    const document = render(application, assets)
    drawn.set(key, document)
    for (const oldest of drawn.keys()) {
      if (drawn.size <= KEPT_DOCUMENTS) break
      drawn.delete(oldest)
    }
    return document
  }
}
