/**
 * The server's library: every doc page of every subsite, read from the
 * repository at build time, and the regions the view draws them in. The
 * browser never loads this module.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Option } from 'effect'

import { compilerOptionsOf, extract, packageSource } from '../api/extract.js'
import type { ApiPackage } from '../api/model.js'
import { allSubsites, type Subsite } from '../catalog.js'
import { README, topicsFor } from '../gallery/related.js'
import { exampleFile } from '../gallery/showcase.js'
import { showcaseOf, showcases } from '../gallery/showcases.js'
import { listed as listedPrimitives } from '../gallery/primitiveExamples.js'
import { examples as primitiveExamples } from '../snippets/primitives.js'
import {
  COMPONENTS,
  CREATE,
  PRIMITIVES_GALLERY,
  type Draw,
  type Library,
  type Region,
} from '../library.js'
import { Page, type Example } from '../page.js'
import type { RootContent } from 'mdast'

import { makeBlog } from '../blog/library.js'
import { packageName } from '../demos.js'
import { apiPages, apiTargets, type ApiPage, type Mention } from './api.js'
import { links, type Links, type Target } from './links.js'
import { highlighter, type Highlight } from './highlight.js'
import { guidePages, GITHUB, headingOf, slugger, type Anchor, type GuidePage } from './guides.js'
import { blocks, codeBlock } from './render.js'

type Ih = HtmlBuilder<never>

/** A page of a subsite, whatever drew it. */
interface DocPage {
  readonly path: string
  readonly subsite: Subsite
  /** The sidebar group it is listed under, and its words there. */
  readonly group: string
  readonly label: string
  readonly title: string
  /** The page's own heading, where it differs from the title: a package's name without its family's prefix. */
  readonly heading?: string
  readonly description: string
  readonly anchors: ReadonlyArray<Anchor>
  /** The file to edit it in, from the repository root. */
  readonly file: string
  readonly kind: 'guide' | 'api'
  /** Whether the sidebar lists it; an export's page is reached from its entry point's. */
  readonly listed: boolean
  /** The listed page the sidebar marks while this one is open. */
  readonly module: string
  /** Where it sits, over its title. */
  readonly crumb: string
  readonly body: (ih: Ih) => Region
}

const fromGuide = (highlight: Highlight, linkOf: Links['linkOf'], page: GuidePage): DocPage => ({
  ...headingOf(page),
  path: page.path,
  subsite: page.subsite,
  group: page.source.label,
  label: page.label,
  title: page.title,
  description: page.description,
  anchors: page.anchors,
  file: page.source.file,
  kind: 'guide',
  listed: true,
  module: page.path,
  crumb: `${page.subsite.title} / ${page.source.label}`,
  body: ih =>
    blocks(
      ih,
      { highlight, href: page.href, idOf: page.idOf, codeLink: code => linkOf(code, page.path) },
      page.nodes,
    ),
})

/**
 * The code spans a guide page links, as `render.ts` draws them: not inside a
 * link or a heading, where a span stays text.
 */
const codeSpansIn = (nodes: ReadonlyArray<RootContent>): ReadonlyArray<string> =>
  nodes.flatMap(node => {
    if (node.type === 'inlineCode') return [node.value]
    if (node.type === 'link' || node.type === 'heading' || !('children' in node)) return []
    return codeSpansIn(node.children)
  })

const fromApi = (page: ApiPage): DocPage => ({ ...page, kind: 'api' })

/** The site's own pages beside the doc pages. */
const HOME = '/'
const DEMOS = '/demos'

/** An address as the library keys it: no trailing slash, except the root's. */
export const normalize = (path: string): string =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path

const SNIPPETS: Readonly<Record<Example | 'app' | 'remote', string>> = {
  app: 'app.ts',
  view: 'view.ts',
  agent: 'agent.ts',
  sync: 'sync.ts',
  mirror: 'mirror.ts',
  remote: 'remote.ts',
}

/**
 * The code between `// #region <name>` and `// #endregion` in `source`, by
 * name. A region left open, or a name used twice, fails the build.
 */
export const regionsOf = (source: string): ReadonlyMap<string, string> => {
  const regions = new Map<string, string>()
  let open: { readonly name: string; readonly lines: Array<string> } | undefined
  for (const line of source.split('\n')) {
    const start = /^\/\/ #region (\S+)$/.exec(line)
    if (start !== null) {
      if (open !== undefined) throw new Error(`region ${start[1]} opens inside ${open.name}`)
      if (regions.has(start[1]!)) throw new Error(`two regions are named ${start[1]}`)
      open = { name: start[1]!, lines: [] }
    } else if (line === '// #endregion') {
      if (open === undefined) throw new Error('a region ends that never opened')
      regions.set(open.name, open.lines.join('\n').trim())
      open = undefined
    } else open?.lines.push(line)
  }
  if (open !== undefined) throw new Error(`region ${open.name} never ends`)
  return regions
}

export interface ServerLibrary extends Library {
  /** Every address the build writes a page for. */
  readonly paths: ReadonlyArray<string>
  /** When a page was last changed, for the addresses that say (the blog's), for the sitemap. */
  readonly modified: ReadonlyMap<string, string>
  /** The blog's Atom feed under the site's origin. */
  readonly feed: (origin: string) => string
}

/** Extracts the public API of every package listed across the site's subsites. */
export const extractSitePackages = (repository: string): Promise<ReadonlyArray<ApiPackage>> =>
  extract(
    repository,
    allSubsites
      .flatMap(subsite => subsite.packages)
      .flatMap(dir => Option.toArray(packageSource(join(repository, 'packages', dir)))),
    compilerOptionsOf(repository),
  )

export const makeLibrary = async (
  repository: string,
  extracted?: ReadonlyArray<ApiPackage>,
): Promise<ServerLibrary> => {
  const highlight = await highlighter()
  const guides = guidePages(repository, allSubsites)
  const packages =
    extracted ??
    (process.env['FOLDKIT_SITE_NO_API'] === '1' ? [] : await extractSitePackages(repository))
  const packagesOf = (subsite: Subsite) =>
    packages.filter(source => subsite.packages.includes(source.dir))
  // A package's name leads to the first page of its README's guides.
  const packageTargets = guides.pages.flatMap((page, index): ReadonlyArray<Target> => {
    const readme = /^packages\/([^/]+)\/README\.md$/.exec(page.source.file)
    const first = guides.pages[index - 1]?.source !== page.source
    return readme === null || !first
      ? []
      : [
          {
            name: packageName(readme[1]!),
            path: page.path,
            subsite: page.subsite.id,
            declared: true,
            namespace: false,
          },
        ]
  })
  const subsiteOf = new Map<string, string>()
  const { linkOf } = links(
    [
      ...packageTargets,
      ...allSubsites.flatMap(subsite => apiTargets(subsite, packagesOf(subsite))),
    ],
    path => subsiteOf.get(path) ?? '',
  )
  for (const page of guides.pages) subsiteOf.set(page.path, page.subsite.id)
  // Which guide pages name each API page, for the "In the guides" list there.
  const mentions = new Map<string, Array<Mention>>()
  for (const page of guides.pages)
    for (const code of new Set(codeSpansIn(page.nodes))) {
      const target = linkOf(code, page.path)
      if (Option.isNone(target)) continue
      const path = target.value.split('#')[0]!
      const named = mentions.get(path) ?? []
      if (!named.some(mention => mention.path === page.path))
        named.push({
          path: page.path,
          title: page.title,
          crumb: `${page.subsite.title} / ${page.source.label}`,
        })
      mentions.set(path, named)
    }
  const docs = allSubsites.flatMap(subsite => [
    ...guides.pages
      .filter(page => page.subsite === subsite)
      .map(page => fromGuide(highlight, linkOf, page)),
    ...apiPages({
      subsite,
      packages: packagesOf(subsite),
      highlight,
      linksFrom: guides.linksFrom,
      linkOf,
      mentionsOf: path => mentions.get(path) ?? [],
    }).map(fromApi),
  ])
  for (const page of docs) subsiteOf.set(page.path, page.subsite.id)
  const byPath = new Map<string, DocPage>()
  for (const page of docs) {
    if (byPath.has(page.path)) throw new Error(`two doc pages claim ${page.path}`)
    byPath.set(page.path, page)
  }
  const inSubsite = new Map<Subsite, ReadonlyArray<DocPage>>(
    allSubsites.map(subsite => [subsite, docs.filter(page => page.subsite === subsite)]),
  )
  const pageOf = (path: string): DocPage => {
    const page = byPath.get(normalize(path))
    if (page === undefined) throw new Error(`no doc page at ${path}`)
    return page
  }

  /**
   * The subsite's guides and API. The phone menu folds each package's pages
   * under its name (`fold`), the current page's group open.
   */
  const sidebarOf =
    (current: DocPage, fold: boolean) =>
    (ih: Ih): Region => {
      const pages = inSubsite.get(current.subsite) ?? []
      const marked = (page: DocPage) => {
        if (page === current) return [ih.AriaCurrent('page')]
        return page.path === current.module ? [ih.AriaCurrent('location')] : []
      }
      const link = (page: DocPage) =>
        ih.li([], [ih.a([ih.Href(page.path), ...marked(page)], [page.label])])
      const groups = (kind: DocPage['kind']) => {
        const ofKind = pages.filter(page => page.kind === kind && page.listed)
        const labels = [...new Set(ofKind.map(page => page.group))]
        return labels.flatMap(label => {
          const inGroup = ofKind.filter(page => page.group === label)
          const list = ih.ul([], inGroup.map(link))
          if (labels.length === 1) return [list]
          if (!fold) return [ih.h3([], [label]), list]
          return [
            ih.details(
              inGroup.some(page => page === current || page.path === current.module)
                ? [ih.Attribute('open', '')]
                : [],
              [ih.summary([], [label]), list],
            ),
          ]
        })
      }
      const hasApi = pages.some(page => page.kind === 'api')
      return [
        ih.p(
          [ih.Class('subsite')],
          [ih.a([ih.Href(`/${current.subsite.id}`)], [current.subsite.title])],
        ),
        ih.section([], [ih.h2([], ['Guides']), ...groups('guide')]),
        ...(hasApi ? [ih.section([], [ih.h2([], ['API']), ...groups('api')])] : []),
      ]
    }

  /** The listed pages around this one; an export's page leads back to its entry point. */
  const pager = (current: DocPage, ih: Ih): Html => {
    const pages = (inSubsite.get(current.subsite) ?? []).filter(page => page.listed)
    const at = pages.indexOf(current)
    const previous = current.listed ? pages[at - 1] : byPath.get(current.module)
    const next = current.listed ? pages[at + 1] : undefined
    return ih.nav(
      [ih.Class('pager'), ih.AriaLabel('Pages')],
      [
        ...(previous === undefined
          ? []
          : [
              ih.a(
                [ih.Href(previous.path), ih.Class('previous')],
                [ih.small([], ['Previous']), previous.label],
              ),
            ]),
        ...(next === undefined
          ? []
          : [ih.a([ih.Href(next.path), ih.Class('next')], [ih.small([], ['Next']), next.label])]),
      ],
    )
  }

  const article =
    (current: DocPage) =>
    (ih: Ih): Region => [
      ih.header(
        [],
        [ih.p([ih.Class('crumb')], [current.crumb]), ih.h1([], [current.heading ?? current.title])],
      ),
      ...current.body(ih),
    ]

  const outline =
    (current: DocPage) =>
    (ih: Ih): Region => [
      ...(current.anchors.length === 0
        ? []
        : [
            ih.h2([], ['On this page']),
            ih.ul(
              [],
              current.anchors.map(anchor =>
                ih.li(
                  [ih.Class(`depth-${anchor.depth}`)],
                  [ih.a([ih.Href(`#${anchor.id}`)], [anchor.text])],
                ),
              ),
            ),
          ]),
      ih.p([], [ih.a([ih.Href(`${GITHUB}/blob/main/${current.file}`)], ['Edit on GitHub ↗'])]),
    ]

  const example = (name: Example | 'app' | 'remote'): Draw => {
    const source = readFileSync(
      join(repository, 'examples/site/src/snippets', SNIPPETS[name]),
      'utf8',
    )
    return ih => [codeBlock(ih, highlight, { code: source.trimEnd(), lang: 'ts', copy: true })]
  }

  const usages = regionsOf(
    readFileSync(join(repository, 'examples/site/src/snippets/components.ts'), 'utf8'),
  )
  const componentPaths = showcases.map(showcase => `${COMPONENTS}/${showcase.slug}`)
  const usage = (slug: string): Draw => {
    const code = usages.get(slug)
    if (code === undefined) throw new Error(`src/snippets/components.ts has no region ${slug}`)
    return ih => [codeBlock(ih, highlight, { code, lang: 'ts', copy: true })]
  }
  // An example module is shown whole, imports and state included: it is the file a reader copies.
  const modules = new Map<string, string>()
  const module = (slug: string, name: string): Draw => {
    const file = exampleFile(slug, name)
    const code = modules.get(file) ?? readFileSync(join(repository, file), 'utf8').trimEnd()
    modules.set(file, code)
    return ih => [codeBlock(ih, highlight, { code, lang: 'ts', copy: true })]
  }
  // Every showcase's code read now, so a missing region or module fails the build, not one page.
  for (const showcase of showcases) {
    if (showcase.examples.length === 0) usage(showcase.slug)
    else
      for (const example of showcase.examples)
        if (example.code === 'module') module(showcase.slug, example.name)
        else usage(`${showcase.slug}-${example.name}`)
  }

  const primitiveRegions = regionsOf(
    readFileSync(join(repository, 'examples/site/src/snippets/primitives.ts'), 'utf8'),
  )
  const primitive = (id: string): Draw => {
    const code = primitiveRegions.get(id)
    if (code === undefined) throw new Error(`src/snippets/primitives.ts has no region ${id}`)
    return ih => [codeBlock(ih, highlight, { code, lang: 'ts', copy: true })]
  }
  // Every example's region read now, so a missing one fails the build, not one page.
  for (const example of primitiveExamples) primitive(example.id)
  // A primitive's example module is shown whole, as a component's is.
  const primitiveModule = (file: string): Draw => {
    const code = modules.get(file) ?? readFileSync(join(repository, file), 'utf8').trimEnd()
    modules.set(file, code)
    return ih => [codeBlock(ih, highlight, { code, lang: 'ts', copy: true })]
  }
  for (const { file } of listedPrimitives) primitiveModule(file)

  // The README's own resolver: a heading it no longer has leads to the README's first page, not nowhere.
  const readmeLink = guides.linksFrom(README)
  const related =
    (slug: string): Draw =>
    ih => [
      ih.ul(
        [],
        topicsFor(slug).map(topic =>
          ih.li(
            [],
            [
              ih.a([ih.Href(readmeLink(`#${slugger()(topic.heading)}`))], [topic.label]),
              ...` ${topic.about}`
                .split('`')
                .map((part, at) => (at % 2 === 1 ? ih.code([], [part]) : part)),
            ],
          ),
        ),
      ),
    ]

  const blog = makeBlog(repository, highlight, { href: guides.linksFrom, codeLink: linkOf })

  return {
    paths: [
      HOME,
      DEMOS,
      COMPONENTS,
      ...componentPaths,
      CREATE,
      PRIMITIVES_GALLERY,
      ...blog.paths,
      ...byPath.keys(),
    ],
    modified: blog.modified,
    feed: blog.feed,
    blog: blog.region,
    blogPosts: blog.posts,
    pageAt: path => {
      const normal = normalize(path)
      const post = blog.pageAt(normal)
      if (Option.isSome(post)) return post.value
      if (normal === HOME) return Page.Home()
      if (normal === DEMOS) return Page.Demos()
      if (normal === COMPONENTS) return Page.Components()
      if (normal === CREATE) return Page.Create()
      if (normal === PRIMITIVES_GALLERY) return Page.Primitives()
      if (normal.startsWith(`${COMPONENTS}/`)) {
        const slug = normal.slice(COMPONENTS.length + 1)
        return Option.isSome(showcaseOf(slug)) ? Page.Component({ slug }) : Page.Missing()
      }
      const page = byPath.get(normal)
      return page === undefined
        ? Page.Missing()
        : Page.Doc({ subsite: page.subsite.id, title: page.title, description: page.description })
    },
    sidebar: path => sidebarOf(pageOf(path), false),
    menuSidebar: path => sidebarOf(pageOf(path), true),
    article: path => article(pageOf(path)),
    pager: path => ih => [pager(pageOf(path), ih)],
    outline: path => outline(pageOf(path)),
    example,
    usage,
    module,
    primitive,
    primitiveModule,
    related,
  }
}
