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
import { ORIGIN } from './domain.js'
import { answer } from './endpoint.js'
import { openServer } from './server.js'
import { siteConfig } from './siteConfig.js'
import * as Site from './siteApp.js'
import { plan } from './sitePlan.js'
import { BLOG_LEDE } from './siteView.js'
import { memorySqlite } from './sqlite-node.js'
import { remoteClient, type Send } from './transport.js'

/** What the site says of itself where a page says nothing of its own. */
export const SITE_DESCRIPTION =
  'A blog, its studio and its server, built with Foldkit Plus: posts that explain how the demo is made.'

/** The preview image every page offers a link preview. */
export const IMAGE = `${ORIGIN}/og.jpg`

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

/** The build a page belongs to: the entry script the template loads, which `client.ts` reads of itself. */
export const buildIdOf = (template: string): string => {
  const entry = template.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]
  if (entry === undefined) throw new Error('index.html loads no module script')
  return new URL(entry, ORIGIN).pathname
}

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

/** A description a search result can show: the first sentences, within 160 characters. */
export const summary = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= 160) return flat
  const cut = flat.slice(0, 157)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

/** What a page says of itself: a post its excerpt, a page its Hero's lead or first Text. */
const describe = (model: Site.Model) => {
  const post = Option.flatMap(Site.postRead(model), read => Site.firstOf(read.read(model)))
  if (Option.isSome(post))
    return {
      title: post.value.title,
      description: post.value.excerpt,
      published: Option.fromNullOr(post.value.publishedAt),
    }
  if (model.route._tag === 'Blog')
    return { title: 'The blog', description: BLOG_LEDE, published: Option.none<string>() }
  const said = Option.flatMap(Site.pageDocument(model), document =>
    Option.fromUndefinedOr(
      Object.values(document.nodes)
        .map(node => node.props['lead'] ?? node.props['body'])
        .find((text): text is string => typeof text === 'string' && text !== ''),
    ),
  )
  const title = Option.getOrElse(
    Option.map(
      Option.flatMap(Site.pageRead(model), read => Site.firstOf(read.read(model))),
      page => page.title,
    ),
    () => 'Journal',
  )
  return {
    title,
    description: Option.getOrElse(said, () => SITE_DESCRIPTION),
    published: Option.none<string>(),
  }
}

/** The head a page adds: its description, its link preview, a post's article facts, and its styles. */
const headFor = (model: Site.Model, html: string): string => {
  const { title, description, published } = describe(model)
  const url = `${ORIGIN}${Site.pathOf(model.route)}`
  const said = escape(summary(description))
  const article = Option.isSome(published)
  const tags = [
    `<meta name="description" content="${said}" />`,
    `<meta property="og:site_name" content="Journal" />`,
    `<meta property="og:type" content="${article ? 'article' : 'website'}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${said}" />`,
    `<meta property="og:image" content="${IMAGE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...Option.match(published, {
      onNone: () => [],
      onSome: at => [
        `<meta property="article:published_time" content="${escape(at)}" />`,
        // What a search engine reads of a post, as it would a published article.
        `<script type="application/ld+json">${SSR.serializeJsonScript({
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: title,
          description: summary(description),
          datePublished: at,
          url,
          image: IMAGE,
        })}</script>`,
      ],
    }),
    // The page's own styles, so its first paint is styled before any script runs.
    `<style>${Style.usedIn(html)}</style>`,
  ]
  return tags.join('\n    ')
}

/**
 * The Model with everything the page reads: each active read prefetched in
 * turn, each over the Model the one before left. The route's read comes first
 * in `actives`, so the page's Blocks are asked for once its document is read.
 */
const prepare = (model: Site.Model) =>
  Effect.gen(function* () {
    let current = model
    for (const active of Object.values(Site.actives)) {
      const projection = active.projectionOf(current)
      if (Option.isSome(projection)) current = yield* Site.Data.prefetch(current, projection.value)
    }
    return current
  })

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
  const buildId = buildIdOf(template)

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
      prepare(Site.initial(urlAt(path)).model).pipe(Effect.provide(remote)),
    )
    const config = siteConfig({
      // The prepared Model through the assembly's own `initial`, as `init` must return it.
      init: () =>
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
        head: rendered => headFor(prepared, rendered.html),
      }),
    )
    // `/site/blog` as `site/blog.html`: a static host serves it at the address without a slash.
    generated.push({ path, file: `${path.slice(1)}.html`, html: page.html, modified })
  }
  return generated
}

/** The sitemap of what was generated. */
export const sitemapOf = (pages: ReadonlyArray<Generated>): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map(
      page =>
        `  <url><loc>${ORIGIN}${page.path}</loc><lastmod>${page.modified.slice(0, 10)}</lastmod></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n')

export const robots = `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`
