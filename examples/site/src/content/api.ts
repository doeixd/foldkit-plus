/**
 * API pages from the extracted data: one page per entry point, listing its
 * exports by kind, and one per export, with its declaration, what its doc
 * comment says, and its members. Doc comments are Markdown and are drawn as
 * the guides are.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Option } from 'effect'

import type { Subsite } from '../catalog.js'
import type { ApiExport, ApiMember, ApiModule, ApiPackage } from '../api/model.js'
import type { Region } from '../library.js'
import { GITHUB, parse, slugger, summarize, textOf, type Anchor } from './guides.js'
import type { Highlight } from './highlight.js'
import { blocks, codeBlock } from './render.js'

type Ih = HtmlBuilder<never>

export interface ApiPage {
  readonly path: string
  readonly subsite: Subsite
  /** The package, which names the sidebar's group. */
  readonly group: string
  readonly label: string
  readonly title: string
  readonly description: string
  readonly anchors: ReadonlyArray<Anchor>
  /** The file it was read from, from the repository root. */
  readonly file: string
  /** Listed in the sidebar: an entry point is, an export is reached from its entry point's page. */
  readonly listed: boolean
  /** The entry point page an export page belongs to; itself for an entry point. */
  readonly module: string
  readonly crumb: string
  readonly body: (ih: Ih) => Region
}

const kinds: ReadonlyArray<{ readonly kind: ApiExport['kind']; readonly heading: string }> = [
  { kind: 'namespace', heading: 'Namespaces' },
  { kind: 'function', heading: 'Functions' },
  { kind: 'const', heading: 'Values' },
  { kind: 'class', heading: 'Classes' },
  { kind: 'interface', heading: 'Interfaces' },
  { kind: 'type', heading: 'Types' },
  { kind: 'enum', heading: 'Enums' },
]

/** An entry point's path segment: `foldkit-remote/port` is `remote-port`. */
const moduleSegment = (specifier: string): string =>
  specifier.replace(/^foldkit-/, '').replaceAll('/', '-')

const sourceLink = (ih: Ih, source: ApiExport['source']): Html =>
  ih.a(
    [ih.Class('source'), ih.Href(`${GITHUB}/blob/main/${source.file}#L${source.line}`)],
    [`${source.file}:${source.line}`],
  )

/** The first sentence or so of a doc comment, as plain text. */
const firstLine = (markdown: string): string => {
  const paragraph = parse(markdown).children.find(node => node.type === 'paragraph')
  return paragraph === undefined ? '' : summarize(textOf(paragraph))
}

interface Drawing {
  readonly highlight: Highlight
  readonly href: (url: string) => string
}

/** A doc comment drawn as Markdown, its headings kept out of the page's outline. */
const prose = (ih: Ih, drawing: Drawing, markdown: string): Region => {
  if (markdown.trim() === '') return []
  const ids = slugger()
  return blocks(
    ih,
    {
      highlight: drawing.highlight,
      href: drawing.href,
      idOf: heading => `doc-${ids(textOf(heading))}`,
    },
    parse(markdown).children,
  )
}

const tagsOf = (ih: Ih, drawing: Drawing, tags: ApiExport['tags']): Region =>
  tags.flatMap(tag =>
    tag.name === 'example'
      ? [ih.h4([], ['Example']), ...prose(ih, drawing, tag.text)]
      : [
          ih.div(
            [ih.Class('tagged')],
            [ih.span([ih.Class('tag')], [`@${tag.name}`]), ...prose(ih, drawing, tag.text)],
          ),
        ],
  )

const paramsOf = (ih: Ih, drawing: Drawing, params: ApiExport['params']): Region =>
  params.length === 0
    ? []
    : [
        ih.h4([], ['Parameters']),
        ih.ul(
          [ih.Class('params')],
          params.map(param =>
            ih.li([], [ih.code([], [param.name]), ' ', ...prose(ih, drawing, param.summary)]),
          ),
        ),
      ]

const member = (ih: Ih, drawing: Drawing, owner: string, entry: ApiMember, id: string): Html =>
  ih.section(
    [ih.Class('entry')],
    [
      ih.h3(
        [ih.Id(id)],
        [
          ih.code([], [`${owner}.${entry.name}`]),
          ih.a([ih.Href(`#${id}`), ih.AriaHidden(true), ih.Class('anchor')], ['#']),
        ],
      ),
      ih.p([], [ih.span([ih.Class('kind')], [entry.kind]), ' · ', sourceLink(ih, entry.source)]),
      codeBlock(ih, drawing.highlight, entry.signature, 'ts'),
      ...prose(ih, drawing, entry.summary),
      ...paramsOf(ih, drawing, entry.params),
      ...tagsOf(ih, drawing, entry.tags),
    ],
  )

const exportBody =
  (drawing: Drawing, entry: ApiExport, ids: ReadonlyArray<string>) =>
  (ih: Ih): Region => [
    ih.p([], [ih.span([ih.Class('kind')], [entry.kind]), ' · ', sourceLink(ih, entry.source)]),
    codeBlock(ih, drawing.highlight, entry.signature, 'ts'),
    ...Option.match(entry.typeSignature, {
      onNone: () => [],
      onSome: signature => [
        ih.h4([], ['Its type']),
        codeBlock(ih, drawing.highlight, signature, 'ts'),
      ],
    }),
    ...prose(ih, drawing, entry.summary),
    ...paramsOf(ih, drawing, entry.params),
    ...tagsOf(ih, drawing, entry.tags),
    ...(entry.members.length === 0
      ? []
      : [
          ih.h2([ih.Id('members')], ['Members']),
          ...entry.members.map((each, index) =>
            member(ih, drawing, entry.name, each, ids[index] ?? ''),
          ),
        ]),
  ]

const moduleBody =
  (drawing: Drawing, module: ApiModule, pathOf: (entry: ApiExport) => string) =>
  (ih: Ih): Region => [
    ...prose(ih, drawing, module.summary),
    ...kinds.flatMap(({ kind, heading }) => {
      const ofKind = module.exports.filter(entry => entry.kind === kind)
      return ofKind.length === 0
        ? []
        : [
            ih.h2([ih.Id(kind)], [heading]),
            ih.div(
              [ih.Class('table')],
              [
                ih.table(
                  [],
                  [
                    ih.tbody(
                      [],
                      ofKind.map(entry =>
                        ih.tr(
                          [],
                          [
                            ih.td(
                              [],
                              [ih.a([ih.Href(pathOf(entry))], [ih.code([], [entry.name])])],
                            ),
                            ih.td([], [firstLine(entry.summary)]),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ]
    }),
  ]

/** Every API page of a subsite: its packages' entry points, each followed by its exports. */
export const apiPages = (
  subsite: Subsite,
  packages: ReadonlyArray<ApiPackage>,
  highlight: Highlight,
  linksFrom: (file: string) => (url: string) => string,
): ReadonlyArray<ApiPage> =>
  packages.flatMap(source =>
    source.modules.flatMap(module => {
      const base = `/${subsite.id}/api/${moduleSegment(module.specifier)}`
      const pathOf = (entry: ApiExport) => `${base}/${entry.slug}`
      const modulePage: ApiPage = {
        path: base,
        subsite,
        group: source.name,
        label: module.specifier,
        title: module.specifier,
        description: firstLine(module.summary),
        anchors: kinds
          .filter(({ kind }) => module.exports.some(entry => entry.kind === kind))
          .map(({ kind, heading }) => ({ depth: 2, text: heading, id: kind })),
        file: module.file,
        listed: true,
        module: base,
        crumb: `${subsite.title} / API`,
        body: moduleBody({ highlight, href: linksFrom(module.file) }, module, pathOf),
      }
      return [
        modulePage,
        ...module.exports.map((entry): ApiPage => {
          const ids = slugger()
          const memberIds = entry.members.map(each => ids(each.name.replaceAll('.', '-')))
          return {
            path: pathOf(entry),
            subsite,
            group: source.name,
            label: entry.name,
            title: entry.name,
            description: firstLine(entry.summary),
            anchors: entry.members.map((each, index) => ({
              depth: 3,
              text: each.name,
              id: memberIds[index] ?? '',
            })),
            file: entry.source.file,
            listed: false,
            module: base,
            crumb: `${subsite.title} / ${module.specifier}`,
            body: exportBody({ highlight, href: linksFrom(entry.source.file) }, entry, memberIds),
          }
        }),
      ]
    }),
  )
