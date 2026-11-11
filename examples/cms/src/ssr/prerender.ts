/**
 * The public site rendered at build time: each published page and post as the
 * HTML a static host serves at its address, with its text, its metadata and
 * its styles in the page, so a reader, a crawler and a link preview see it
 * before any script runs. The browser takes a page over (`client.ts`) without
 * reading any of it again.
 *
 * It renders from the seed every visitor's sandbox starts from, on the same
 * server the sandbox runs, through the site's own config (`siteConfig.ts`).
 */
import { Effect, Option } from 'effect'
import { Entity } from 'foldkit-entity'
import { Style } from 'foldkit-mixins'
import {
  Remote,
  RemotePolicy,
  type Page as RemotePage,
  type RemoteClient,
  type RemoteData,
} from 'foldkit-remote'
import { Site as Sites } from 'foldkit-site'
import type { Projection } from 'foldkit-surface'
import { generateStaticSite } from 'foldkit-ssr/vite'
import type { Url } from 'foldkit/url'
import { ORIGIN, Post, RecentPosts } from '../content/domain.js'
import { Page, PublishedPages } from '../content/pageDomain.js'
import { answer } from '../server/endpoint.js'
import { openServer } from '../server/server.js'
import { siteConfig } from '../content/siteConfig.js'
import * as Site from '../apps/siteApp.js'
import { plan } from './sitePlan.js'
import { memorySqlite } from '../server/sqlite-node.js'
import { remoteClient, type Send } from '../server/transport.js'

/** One generated page: the file to write, under the build's output, and its HTML. */
export interface Generated {
  readonly path: string
  readonly file: string
  readonly html: string
  /** When what it shows last changed, for the sitemap. */
  readonly modified: string
}

/**
 * The template a page is rendered into: the built `index.html` with an empty
 * `#root` where the application is drawn, and, in place of the studio's
 * `noindex`, the canonical link and `og:url` a render fills in (Foldkit writes
 * them into tags the template has, and adds none).
 */
export const siteTemplate = (built: string): string => {
  const starting = /<div id="app">[\s\S]*?<\/div>/
  const robots = /\s*<meta name="robots" content="noindex" \/>/
  if (!starting.test(built) || !robots.test(built))
    throw new Error('index.html has no #app or no robots meta to replace')
  return built
    .replace(starting, '<div id="root"></div>')
    .replace(
      robots,
      ['', '<link rel="canonical" href="" />', '<meta property="og:url" content="" />'].join(
        '\n    ',
      ),
    )
}

/** The address the 404 page is drawn from: a page the site does not have. */
const MISSING_PATH = '/site/not-found'

const stripped = (html: string, pattern: RegExp, replacement = ''): string => {
  const result = html.replace(pattern, replacement)
  if (result === html) throw new Error(`the 404 page no longer has ${pattern}`)
  return result
}

/**
 * The site's missing page, made static: `html` is a page rendered at
 * `MISSING_PATH`, with what ties it to that address taken out. The host serves
 * it at every unknown address, so it carries no takeover envelope, no
 * canonical or `og:url`, and no script: a booting client would read the real
 * address and, off `/site`, draw the studio over it. It says it is not found
 * and is not indexed.
 */
const notFoundPage = (html: string): string =>
  [
    (h: string) => stripped(h, /\s+data-foldkit-plus-resume='[^']*'/),
    (h: string) => stripped(h, /\s+data-foldkit-app="[^"]*"/),
    (h: string) => stripped(h, /\s+data-foldkit-build="[^"]*"/),
    (h: string) => stripped(h, /\s*<link rel="canonical"[^>]*>/),
    (h: string) => stripped(h, /\s*<meta property="og:url"[^>]*>/),
    (h: string) => stripped(h, /\s*<script\b[^>]*><\/script>/g),
    (h: string) =>
      stripped(
        h,
        /<title>[^<]*<\/title>/,
        '<title>Not found · Journal</title>\n    <meta name="robots" content="noindex" />',
      ),
  ]
    .reduce((page, step) => step(page), html)
    // The build preloads the sandbox's code and its wasm; the built shell has them, the source's does not.
    .replace(/\s*<link rel="(?:module)?preload"[^>]*>/g, '')

/** The site's 404 page: the missing-page view in the site's own template and chrome. */
export const renderNotFound = async (
  site: Awaited<ReturnType<typeof prepareSite>>,
  template: string,
): Promise<string> => {
  const { pages } = await Effect.runPromise(
    generateStaticSite({
      config: path => site.configFor(path),
      plan,
      origin: ORIGIN,
      paths: [{ path: MISSING_PATH }],
      template,
      head: rendered => stylesOf(rendered.html),
      files: 'flat',
    }),
  )
  const [page] = pages
  if (page === undefined) throw new Error('the 404 page was not rendered')
  return notFoundPage(page.html)
}

/** The page's own styles, so its first paint is styled before any script runs. */
export const stylesOf = (html: string): string => `<style>${Style.usedIn(html)}</style>`

export const urlAt = (path: string): Url => ({
  protocol: 'https:',
  host: new URL(ORIGIN).host,
  port: Option.none(),
  pathname: path,
  search: Option.none(),
  hash: Option.none(),
})

/** Every published page and post of the seed, rendered into `template`. */
export const generateSite = async (
  template: string,
  now: Date = new Date(),
): Promise<ReadonlyArray<Generated>> => {
  const site = await prepareSite(now)
  const { pages } = await Effect.runPromise(
    generateStaticSite({
      config: path => site.configFor(path),
      plan,
      origin: ORIGIN,
      paths: site.paths,
      template,
      head: rendered => stylesOf(rendered.html),
      files: 'flat',
    }),
  )
  return pages.map(({ path, file, html, modified }) => ({
    path,
    file,
    html,
    modified: modified ?? '',
  }))
}

/**
 * The seeded site, ready to list and render: one backend, one transport, one
 * clock for the whole build. Tests pass a fixed clock; the production build
 * passes one instant. Either way the seed, the server writes, and the read
 * stamps share it, so two renders of the same inputs cannot differ by time.
 */
export const prepareSite = async (now: Date = new Date()) => {
  const backend = openServer(() => now, memorySqlite())
  await backend.seed()
  const send: Send = (chair, body) => answer(backend, chair, JSON.parse(body))
  const remote = Remote.clientLayer(remoteClient(send, 'visitor'))
  return {
    /** Every published page and post: its path and its sitemap date. */
    paths: () => Effect.runPromise(listSite(now).pipe(Effect.provide(remote))),
    /** The site's config for one path, its Model prepared. */
    configFor: async (path: string) => {
      const prepared = await Effect.runPromise(
        Site.Data.satisfy(Site.initial(urlAt(path)).model, Site.actives, {
          now: () => now.getTime(),
        }).pipe(Effect.provide(remote)),
      )
      return siteConfig({
        // The prepared Model through the assembly's own `initial`, as `initial` must return it.
        initial: () =>
          Site.placements.initial({
            remote: prepared.remote,
            route: prepared.route,
            reader: prepared.reader,
          }),
        resources: remote,
        container: null,
      })
    },
  }
}

const PostListed = Entity.select(Post, { slug: true, publishedAt: true })
const PageListed = Entity.select(Page, { slug: true })

/** Every row a list read holds, refusing one longer than a read takes, which would lose pages. */
const everyRow = <A>(
  model: Site.Model,
  projection: Projection<Site.Model, RemoteData<RemotePage<A>>>,
  now: Date,
) =>
  Site.Data.prefetch(model, projection, {
    policy: RemotePolicy.networkOnly,
    now: () => now.getTime(),
  }).pipe(
    Effect.flatMap(read => {
      const listed = projection.read(read)
      if (listed._tag !== 'Ready')
        return Effect.die(new Error(`the site could not be listed: ${listed._tag}`))
      if (listed.value.hasNext)
        return Effect.die(new Error('the site lists more than one read takes'))
      return Effect.succeed(listed.value.items)
    }),
  )

/**
 * Every published page and post, read as a visitor reads them, through the
 * site's own tree (`Site.targets`): its path, and when it last changed for the
 * sitemap. A post changed when it was published; anything else shows the
 * newest post (the home page and the blog list them), so it changed then.
 */
export const listSite = (
  now: Date,
): Effect.Effect<
  ReadonlyArray<{ readonly path: string; readonly modified: string }>,
  never,
  RemoteClient
> => {
  const start = Site.initial(urlAt('/site')).model
  const posts = everyRow(
    start,
    Site.Data.query(RecentPosts, {}, { select: PostListed, first: 500 }),
    now,
  )
  const pages = everyRow(
    start,
    Site.Data.query(PublishedPages, {}, { select: PageListed, first: 500 }),
    now,
  )
  return Effect.gen(function* () {
    const published = yield* posts
    const newest =
      published
        .flatMap(post => (post.publishedAt === null ? [] : [post.publishedAt]))
        .sort()
        .at(-1) ?? ''
    const listed = yield* Sites.targets(Site.SiteMap, [
      Sites.paths(
        Site.PostNode,
        Effect.succeed(
          published.map(post => ({
            params: { slug: post.slug },
            ...(post.publishedAt === null ? {} : { modified: post.publishedAt }),
          })),
        ),
      ),
      Sites.paths(
        Site.PageNode,
        Effect.map(pages, rows =>
          // The home page's address is the site's own, listed by its node.
          rows.filter(page => page.slug !== 'home').map(page => ({ params: { slug: page.slug } })),
        ),
      ),
    ])
    return listed.map(({ url, modified }) => ({ path: url, modified: modified ?? newest }))
  }).pipe(Effect.orDie)
}
