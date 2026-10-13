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
import { allSubsites, type Subsite } from '../catalog.js'
import type { Draw, Library, Region } from '../library.js'
import { Page, type Example } from '../main.js'
import type { RootContent } from 'mdast'

import { packageName } from '../demos.js'
import { apiPages, apiTargets, type ApiPage, type Mention } from './api.js'
import { links, type Links, type Target } from './links.js'
import { highlighter, type Highlight } from './highlight.js'
import { guidePages, GITHUB, type Anchor, type GuidePage } from './guides.js'
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

export interface ServerLibrary extends Library {
  /** Every address the build writes a page for. */
  readonly paths: ReadonlyArray<string>
}

export const makeLibrary = async (repository: string): Promise<ServerLibrary> => {
  const highlight = await highlighter()
  const guides = guidePages(repository, allSubsites)
  const packages = await extract(
    repository,
    allSubsites
      .flatMap(subsite => subsite.packages)
      .flatMap(dir => Option.toArray(packageSource(join(repository, 'packages', dir)))),
    compilerOptionsOf(repository),
  )
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

  const sidebar =
    (current: DocPage) =>
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
        return labels.flatMap(label => [
          ...(labels.length === 1 ? [] : [ih.h3([], [label])]),
          ih.ul([], ofKind.filter(page => page.group === label).map(link)),
        ])
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
      ih.header([], [ih.p([ih.Class('crumb')], [current.crumb]), ih.h1([], [current.title])]),
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

  return {
    paths: [HOME, DEMOS, ...byPath.keys()],
    pageAt: path => {
      const normal = normalize(path)
      if (normal === HOME) return Page.Home()
      if (normal === DEMOS) return Page.Demos()
      const page = byPath.get(normal)
      return page === undefined
        ? Page.Missing()
        : Page.Doc({ subsite: page.subsite.id, title: page.title, description: page.description })
    },
    sidebar: path => sidebar(pageOf(path)),
    article: path => article(pageOf(path)),
    pager: path => ih => [pager(pageOf(path), ih)],
    outline: path => outline(pageOf(path)),
    example,
  }
}
