/**
 * Guide pages cut from the repository's Markdown, at build time only: each
 * source file is parsed once, split at its second-level headings, and every
 * link in it is pointed at the page that now holds its target. Nothing here
 * reaches the browser; the view draws these pages inside static regions.
 */
import type { Heading as MdHeading, Root, RootContent } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

import type { Source, Subsite } from '../catalog.js'

/** A heading the page's "On this page" list names. */
export interface Anchor {
  readonly depth: number
  readonly text: string
  readonly id: string
}

export interface GuidePage {
  readonly path: string
  readonly subsite: Subsite
  readonly source: Source
  /** The sidebar's words for it. */
  readonly label: string
  /** The page's own heading. */
  readonly title: string
  readonly description: string
  readonly nodes: ReadonlyArray<RootContent>
  readonly anchors: ReadonlyArray<Anchor>
  /** Each heading's id, as GitHub would give it in the source file. */
  readonly idOf: (heading: MdHeading) => string
  /** A link's target as the site serves it. */
  readonly href: (url: string) => string
}

export const GITHUB = 'https://github.com/doeixd/foldkit-plus'

/** Below this many characters of source, a section joins the page before it. */
const SHORT_SECTION = 700

/** The text of a node, as a reader sees it. */
export const textOf = (node: RootContent | Root): string => {
  if ('value' in node && typeof node.value === 'string') return node.value
  if ('children' in node) return node.children.map(child => textOf(child)).join('')
  return ''
}

/** GitHub's heading ids: lowercase, punctuation dropped, spaces as hyphens, repeats numbered. */
export const slugger = () => {
  const seen = new Map<string, number>()
  return (text: string): string => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\- _]/gu, '')
      .replace(/ /g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

const parse = (markdown: string): Root =>
  fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })

const headingsIn = (nodes: ReadonlyArray<RootContent>): ReadonlyArray<MdHeading> =>
  nodes.flatMap(node => (node.type === 'heading' ? [node] : []))

const lengthOf = (nodes: ReadonlyArray<RootContent>): number => {
  const first = nodes[0]?.position?.start.offset ?? 0
  const last = nodes.at(-1)?.position?.end.offset ?? first
  return last - first
}

interface Section {
  readonly heading: MdHeading | undefined
  readonly nodes: ReadonlyArray<RootContent>
}

/** The file's level-one heading dropped, the rest cut before each level-two heading, short ones joined. */
const sectionsOf = (root: Root): ReadonlyArray<Section> => {
  const sections: Array<{ heading: MdHeading | undefined; nodes: Array<RootContent> }> = [
    { heading: undefined, nodes: [] },
  ]
  for (const node of root.children) {
    if (node.type === 'heading' && node.depth === 1) continue
    if (node.type === 'html' && node.value.startsWith('<!--')) continue
    if (node.type === 'heading' && node.depth === 2) sections.push({ heading: node, nodes: [node] })
    else sections.at(-1)!.nodes.push(node)
  }
  return sections.reduce<Array<{ heading: MdHeading | undefined; nodes: Array<RootContent> }>>(
    (pages, section) => {
      const previous = pages.at(-1)
      if (previous !== undefined && lengthOf(section.nodes) < SHORT_SECTION)
        previous.nodes.push(...section.nodes)
      else pages.push({ heading: section.heading, nodes: [...section.nodes] })
      return pages
    },
    [],
  )
}

interface Cut {
  readonly subsite: Subsite
  readonly source: Source
  readonly title: string
  readonly sections: ReadonlyArray<Section & { readonly path: string; readonly slug: string }>
  readonly ids: ReadonlyMap<MdHeading, string>
}

const cut = (repository: string, subsite: Subsite, source: Source, index: number): Cut => {
  const root = parse(readFileSync(join(repository, source.file), 'utf8'))
  const slug = slugger()
  const ids = new Map(
    headingsIn(root.children).map(heading => [heading, slug(textOf(heading))] as const),
  )
  const first = root.children.find(
    (node): node is MdHeading => node.type === 'heading' && node.depth === 1,
  )
  const base = index === 0 ? `/${subsite.id}` : `/${subsite.id}/guides/${source.id}`
  return {
    subsite,
    source,
    title: first === undefined ? source.label : textOf(first),
    ids,
    sections: sectionsOf(root).map((section, at) => {
      const id = section.heading === undefined ? '' : (ids.get(section.heading) ?? '')
      return {
        ...section,
        slug: id,
        path: at === 0 ? base : index === 0 ? `/${subsite.id}/guides/${id}` : `${base}/${id}`,
      }
    }),
  }
}

/** Where a repository path is served: a page of the site, or GitHub. */
const resolver = (repository: string, cuts: ReadonlyArray<Cut>) => {
  // Each heading's address: the page it is on and its id there, or the page
  // alone for the heading a page starts at, which is the page's title.
  const pageOf = new Map<string, Map<string, string>>()
  const startOf = new Map<string, string>()
  for (const each of cuts) {
    startOf.set(each.source.file, each.sections[0]!.path)
    const anchors = new Map<string, string>()
    for (const section of each.sections)
      for (const heading of headingsIn(section.nodes)) {
        const id = each.ids.get(heading) ?? ''
        anchors.set(id, heading === section.heading ? section.path : `${section.path}#${id}`)
      }
    pageOf.set(each.source.file, anchors)
  }
  const github = (path: string, anchor: string): string => {
    const local = join(repository, path)
    const kind = existsSync(local) && statSync(local).isDirectory() ? 'tree' : 'blob'
    return `${GITHUB}/${kind}/main/${path}${anchor === '' ? '' : `#${anchor}`}`
  }
  const onSite = (file: string, anchor: string): string | undefined => {
    const start = startOf.get(file)
    if (start === undefined) return undefined
    if (anchor === '') return start
    return pageOf.get(file)?.get(anchor) ?? start
  }
  return (file: string) =>
    (url: string): string => {
      const repositoryLink = url.match(
        /^https:\/\/github\.com\/doeixd\/foldkit-plus\/blob\/main\/([^#]*)#?(.*)$/,
      )
      if (repositoryLink !== null) return onSite(repositoryLink[1]!, repositoryLink[2]!) ?? url
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
      const [path = '', anchor = ''] = url.split('#')
      const target = path === '' ? file : posix.normalize(posix.join(posix.dirname(file), path))
      return onSite(target, anchor) ?? github(target.replace(/\/$/, ''), anchor)
    }
}

/** Every guide page of every subsite, in reading order. */
export const guidePages = (
  repository: string,
  subsites: ReadonlyArray<Subsite>,
): ReadonlyArray<GuidePage> => {
  const cuts = subsites.flatMap(subsite =>
    subsite.sources.map((source, index) => cut(repository, subsite, source, index)),
  )
  const resolve = resolver(repository, cuts)
  return cuts.flatMap(each => {
    const href = resolve(each.source.file)
    const idOf = (heading: MdHeading) => each.ids.get(heading) ?? ''
    return each.sections.map((section, at): GuidePage => {
      const nodes = section.heading === undefined ? section.nodes : section.nodes.slice(1)
      const heading = section.heading === undefined ? each.title : textOf(section.heading)
      const paragraph = nodes.find(node => node.type === 'paragraph')
      return {
        path: section.path,
        subsite: each.subsite,
        source: each.source,
        label: at === 0 ? 'Overview' : heading,
        title: heading,
        description: paragraph === undefined ? '' : summarize(textOf(paragraph)),
        nodes,
        anchors: headingsIn(nodes)
          .filter(node => node.depth <= 3)
          .map(node => ({ depth: node.depth, text: textOf(node), id: idOf(node) })),
        idOf,
        href,
      }
    })
  })
}

/** A description for search results: the first sentence or so, at most 160 characters. */
const summarize = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= 160 ? flat : `${flat.slice(0, 157).replace(/\s+\S*$/, '')}…`
}
