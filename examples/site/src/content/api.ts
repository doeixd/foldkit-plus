/**
 * API pages from the extracted data: one page per entry point, listing its
 * exports by kind, and one per export, with its declaration, what its doc
 * comment says, and its members. Doc comments are Markdown and are drawn as
 * the guides are.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Option } from 'effect'

import type { Subsite } from '../catalog.js'
import type { ApiBundle, ApiExport, ApiMember, ApiModule, ApiPackage } from '../api/model.js'
import type { Region } from '../library.js'
import { GITHUB, parse, slugger, summarize, type Anchor } from './guides.js'
import { textOf } from './text.js'
import type { Highlight } from './highlight.js'
import type { Target } from './links.js'
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
  readonly codeLink: (code: string) => Option.Option<string>
}

/** A guide page that names an export, listed on the export's page. */
export interface Mention {
  readonly path: string
  readonly title: string
  readonly crumb: string
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
      codeLink: drawing.codeLink,
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
      codeBlock(ih, drawing.highlight, { code: entry.signature, lang: 'ts', copy: false }),
      ...prose(ih, drawing, entry.summary),
      ...paramsOf(ih, drawing, entry.params),
      ...tagsOf(ih, drawing, entry.tags),
    ],
  )

const shapeOf = (fields: ApiBundle['model']): string =>
  fields.length === 0
    ? '{}'
    : `{ ${fields.map(field => `${field.name}: ${field.type}`).join(', ')} }`

const variantText = (variant: ApiBundle['messages'][number]): string =>
  variant.fields.length === 0 ? variant.name : `${variant.name} ${shapeOf(variant.fields)}`

/** What placing a Bundle involves: its args, the slice it keeps, what it handles and hands back. */
const bundleTable = (ih: Ih, bundle: ApiBundle): Html => {
  const row = (label: string, cells: ReadonlyArray<string>) =>
    ih.tr(
      [],
      [
        ih.th([ih.Attribute('scope', 'row')], [label]),
        ih.td(
          [],
          cells.flatMap((cell, index) => [...(index === 0 ? [] : [', ']), ih.code([], [cell])]),
        ),
      ],
    )
  return ih.div(
    [ih.Class('table index bundle')],
    [
      ih.table(
        [],
        [
          ih.tbody(
            [],
            [
              row('Args', bundle.args.length === 0 ? ['none'] : [shapeOf(bundle.args)]),
              row('Model', [shapeOf(bundle.model)]),
              row('Messages', bundle.messages.map(variantText)),
              ...(bundle.out.length === 0 ? [] : [row('OutMessages', bundle.out.map(variantText))]),
            ],
          ),
        ],
      ),
    ],
  )
}

const exportBody =
  (
    drawing: Drawing,
    entry: ApiExport,
    ids: ReadonlyArray<string>,
    mentions: ReadonlyArray<Mention>,
  ) =>
  (ih: Ih): Region => [
    ih.p([], [ih.span([ih.Class('kind')], [entry.kind]), ' · ', sourceLink(ih, entry.source)]),
    ...Option.match(entry.bundle, {
      onNone: () => [
        codeBlock(ih, drawing.highlight, { code: entry.signature, lang: 'ts', copy: false }),
      ],
      // A Bundle's type spells every parameter of `Bundle`; what placing it
      // involves comes first, and the type is there for whoever needs it.
      onSome: bundle => [
        bundleTable(ih, bundle),
        ih.details(
          [ih.Class('full-type')],
          [
            ih.summary([], ['Its full type']),
            codeBlock(ih, drawing.highlight, { code: entry.signature, lang: 'ts', copy: false }),
          ],
        ),
      ],
    }),
    ...Option.match(entry.typeSignature, {
      onNone: () => [],
      onSome: signature => [
        ih.h4([], ['Its type']),
        codeBlock(ih, drawing.highlight, { code: signature, lang: 'ts', copy: false }),
      ],
    }),
    ...prose(ih, drawing, entry.summary),
    ...paramsOf(ih, drawing, entry.params),
    ...tagsOf(ih, drawing, entry.tags),
    // Before the members: a guide is where it is shown at work.
    ...(mentions.length === 0
      ? []
      : [
          ih.h2([ih.Id('in-the-guides')], ['In the guides']),
          ih.ul(
            [ih.Class('mentions')],
            mentions.map(mention =>
              ih.li(
                [],
                [ih.a([ih.Href(mention.path)], [mention.title]), ih.small([], [mention.crumb])],
              ),
            ),
          ),
        ]),
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
            // An index: a name and its summary, which stays a table on a phone.
            ih.div(
              [ih.Class('table index')],
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

/** An entry point's page: `foldkit-remote/port` is `/remote/api/remote-port`. */
const modulePath = (subsite: Subsite, module: ApiModule) =>
  `/${subsite.id}/api/${moduleSegment(module.specifier)}`

const exportPath = (subsite: Subsite, module: ApiModule, entry: ApiExport) =>
  `${modulePath(subsite, module)}/${entry.slug}`

/** Each member's anchor on its export's page, unique on the page. */
const memberIdsOf = (entry: ApiExport): ReadonlyArray<string> => {
  const ids = slugger()
  return entry.members.map(each => ids(each.name.replaceAll('.', '-')))
}

/**
 * The entry point that documents each export. A declaration two entry points
 * export (a root that re-exports its subpaths) gets one page, under the entry
 * point whose folder holds it, so a name has one place to link to.
 */
interface Home {
  readonly module: ApiModule
  readonly entry: ApiExport
}

const homesOf = (source: ApiPackage) => {
  const keyOf = (entry: ApiExport) =>
    `${entry.source.file}:${entry.source.line}:${entry.kind}:${entry.name}`
  const nearness = (module: ApiModule, entry: ApiExport) => {
    const folder = module.file.slice(0, module.file.lastIndexOf('/') + 1)
    return entry.source.file.startsWith(folder) ? folder.length : -1
  }
  const homes = new Map<string, Home>()
  for (const module of source.modules)
    for (const entry of module.exports) {
      const held = homes.get(keyOf(entry))
      if (held === undefined || nearness(module, entry) > nearness(held.module, entry))
        homes.set(keyOf(entry), { module, entry })
    }
  // Each entry point's slugs are its own, so the page is named by the home's entry.
  return (module: ApiModule, entry: ApiExport): Home => homes.get(keyOf(entry)) ?? { module, entry }
}

/** Whether an export is declared in the package that exports it, rather than re-exported. */
const declaredIn = (source: ApiPackage, entry: ApiExport) =>
  entry.source.file.startsWith(`packages/${source.dir}/`)

/** What a code span in prose may name in a subsite's API, for `links.ts`. */
export const apiTargets = (
  subsite: Subsite,
  packages: ReadonlyArray<ApiPackage>,
): ReadonlyArray<Target> =>
  packages.flatMap(source => {
    const homeOf = homesOf(source)
    return source.modules.flatMap(module => [
      // A package's own name leads to its guides (`library.ts`); a subpath to its page here.
      ...(module.specifier === source.name
        ? []
        : [
            {
              name: module.specifier,
              path: modulePath(subsite, module),
              subsite: subsite.id,
              declared: true,
              namespace: false,
            },
          ]),
      ...module.exports.flatMap(entry => {
        if (homeOf(module, entry).module !== module) return []
        const path = exportPath(subsite, module, entry)
        const declared = declaredIn(source, entry)
        const ids = memberIdsOf(entry)
        return [
          {
            name: entry.name,
            path,
            subsite: subsite.id,
            declared,
            namespace: entry.kind === 'namespace',
          },
          ...entry.members.map((each, index) => ({
            name: `${entry.name}.${each.name}`,
            path: `${path}#${ids[index] ?? ''}`,
            subsite: subsite.id,
            declared,
            namespace: false,
          })),
        ]
      }),
    ])
  })

export interface ApiPagesOf {
  readonly subsite: Subsite
  readonly packages: ReadonlyArray<ApiPackage>
  readonly highlight: Highlight
  /** Where a link written in a source file leads. */
  readonly linksFrom: (file: string) => (url: string) => string
  /** Where a code span on the page at `from` leads. */
  readonly linkOf: (code: string, from: string) => Option.Option<string>
  /** The guide pages that name the export at a path. */
  readonly mentionsOf: (path: string) => ReadonlyArray<Mention>
}

/** Every API page of a subsite: its packages' entry points, each followed by its exports. */
export const apiPages = ({
  subsite,
  packages,
  highlight,
  linksFrom,
  linkOf,
  mentionsOf,
}: ApiPagesOf): ReadonlyArray<ApiPage> =>
  packages.flatMap(source => {
    const homeOf = homesOf(source)
    return source.modules.flatMap(module => {
      const base = modulePath(subsite, module)
      const pathOf = (entry: ApiExport) => {
        const home = homeOf(module, entry)
        return exportPath(subsite, home.module, home.entry)
      }
      const drawing = (file: string, path: string): Drawing => ({
        highlight,
        href: linksFrom(file),
        codeLink: code => linkOf(code, path),
      })
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
        body: moduleBody(drawing(module.file, base), module, pathOf),
      }
      return [
        modulePage,
        ...module.exports.flatMap((entry): ReadonlyArray<ApiPage> => {
          if (homeOf(module, entry).module !== module) return []
          const path = pathOf(entry)
          const memberIds = memberIdsOf(entry)
          const mentions = mentionsOf(path)
          return [
            {
              path,
              subsite,
              group: source.name,
              label: entry.name,
              title: entry.name,
              description: firstLine(entry.summary),
              anchors: [
                ...(mentions.length === 0
                  ? []
                  : [{ depth: 2, text: 'In the guides', id: 'in-the-guides' }]),
                ...entry.members.map((each, index) => ({
                  depth: 3,
                  text: each.name,
                  id: memberIds[index] ?? '',
                })),
              ],
              file: entry.source.file,
              listed: false,
              module: base,
              crumb: `${subsite.title} / ${module.specifier}`,
              body: exportBody(drawing(entry.source.file, path), entry, memberIds, mentions),
            },
          ]
        }),
      ]
    })
  })
