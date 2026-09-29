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
import { SSR } from 'foldkit-ssr'
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

/** The build the pages belong to: the `FOLDKIT_BUILD_ID` deployment `vite build` saw. */
const deploymentId = (): string => {
  const buildId = process.env.FOLDKIT_BUILD_ID
  if (buildId === undefined || buildId === '') {
    throw new Error(
      'set FOLDKIT_BUILD_ID to the deployment this build belongs to, the same value `vite build` saw',
    )
  }
  return buildId
}

/** The page's own styles, so its first paint is styled before any script runs. */
const stylesOf = (html: string): string => `<style>${Style.usedIn(html)}</style>`

const urlAt = (path: string): Url => ({
  protocol: 'https:',
  host: new URL(ORIGIN).host,
  port: Option.none(),
  pathname: path,
  search: Option.none(),
  hash: Option.none(),
})

/** Every published page and post of the seed, rendered into `template`. */
export const generateSite = async (template: string): Promise<ReadonlyArray<Generated>> => {
  const backend = openServer(() => new Date(), memorySqlite())
  await backend.seed()
  const send: Send = (chair, body) => answer(backend, chair, JSON.parse(body))
  const remote = Remote.clientLayer(remoteClient(send, 'visitor'))
  const buildId = deploymentId()

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
  const paths = [
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

  const generated: Array<Generated> = []
  for (const { path, modified } of paths) {
    const prepared = await Effect.runPromise(
      Site.Data.satisfy(Site.initial(urlAt(path)).model, Site.actives).pipe(Effect.provide(remote)),
    )
    const config = siteConfig({
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
    const [page] = await Effect.runPromise(
      SSR.generate(config, plan, {
        buildId,
        template,
        origin: ORIGIN,
        paths: [path],
        head: rendered => stylesOf(rendered.html),
      }),
    )
    // `/site/blog` as `site/blog.html`: a static host serves it at the address without a slash.
    generated.push({ path, file: `${path.slice(1)}.html`, html: page.html, modified })
  }
  return generated
}
