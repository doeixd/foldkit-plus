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
import { Style } from 'foldkit-mixins'
import { Remote } from 'foldkit-remote'
import { generateStaticSite } from 'foldkit-ssr/vite'
import type { Url } from 'foldkit/url'
import { ORIGIN } from '../content/domain.js'
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
  // The build's clock, fixed for the render: Remote's reads stamp when they
  // happened, so a live clock here makes two builds of the same seed differ.
  const backend = openServer(() => now, memorySqlite())
  await backend.seed()
  const send: Send = (chair, body) => answer(backend, chair, JSON.parse(body))
  const remote = Remote.clientLayer(remoteClient(send, 'visitor'))

  const { pages } = await Effect.runPromise(
    generateStaticSite({
      config: async path => {
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
      plan,
      origin: ORIGIN,
      paths: listSitePaths(backend),
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

/** Every published page and post of the seed: its path and its sitemap date. */
export const listSitePaths = (backend: {
  readonly rows: (query: string) => ReadonlyArray<Record<string, unknown>>
}): ReadonlyArray<{ readonly path: string; readonly modified: string }> => {
  const posts = backend.rows(
    'select slug, published_at from posts where published_at is not null order by published_at',
  )
  const pages = backend.rows('select slug from pages where published_at is not null')
  const text = (row: Readonly<Record<string, unknown>>, key: string) => String(row[key])
  const newest =
    posts
      .map(row => text(row, 'published_at'))
      .sort()
      .at(-1) ?? ''
  return [
    ...pages.map(row => ({
      path: text(row, 'slug') === 'home' ? '/site' : `/site/${text(row, 'slug')}`,
      modified: newest,
    })),
    { path: '/site/blog', modified: newest },
    ...posts.map(row => ({
      path: `/site/blog/${text(row, 'slug')}`,
      modified: text(row, 'published_at'),
    })),
  ]
}
