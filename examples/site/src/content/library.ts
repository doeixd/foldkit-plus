/**
 * The server's library: every doc page of every subsite, read from the
 * repository at build time, and the regions the view draws them in. The
 * browser never loads this module.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { allSubsites, type Subsite } from '../catalog.js'
import type { Draw, Library, Region } from '../library.js'
import { Page, type Example } from '../main.js'
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
  readonly body: (ih: Ih) => Region
}

const fromGuide = (highlight: Highlight, page: GuidePage): DocPage => ({
  path: page.path,
  subsite: page.subsite,
  group: page.source.label,
  label: page.label,
  title: page.title,
  description: page.description,
  anchors: page.anchors,
  file: page.source.file,
  kind: 'guide',
  body: ih => blocks(ih, { highlight, href: page.href, idOf: page.idOf }, page.nodes),
})

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
  const docs = guidePages(repository, allSubsites).map(page => fromGuide(highlight, page))
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
      const link = (page: DocPage) =>
        ih.li(
          [],
          [
            ih.a(
              [ih.Href(page.path), ...(page === current ? [ih.AriaCurrent('page')] : [])],
              [page.label],
            ),
          ],
        )
      const groups = (kind: DocPage['kind']) => {
        const ofKind = pages.filter(page => page.kind === kind)
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

  const pager = (current: DocPage, ih: Ih): Html => {
    const pages = inSubsite.get(current.subsite) ?? []
    const at = pages.indexOf(current)
    const previous = pages[at - 1]
    const next = pages[at + 1]
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
        [
          ih.p([ih.Class('crumb')], [`${current.subsite.title} / ${current.group}`]),
          ih.h1([], [current.title]),
        ],
      ),
      ...current.body(ih),
      pager(current, ih),
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
    return ih => [codeBlock(ih, highlight, source.trimEnd(), 'ts')]
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
    outline: path => outline(pageOf(path)),
    example,
  }
}
