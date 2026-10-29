/**
 * One share of the generated site, as a worker of `prerender.test.ts` renders
 * it: every `count`th page from `index`, through the build's own
 * `generateStaticSite`. Each page is read back with parse5, the parser jsdom
 * builds its documents with, for what the link check needs of it; the pages
 * the tests read whole are returned as they were written.
 */
import { Effect } from 'effect'
import { generateStaticSite } from 'foldkit-ssr/vite'
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { site } from '../src/site.js'

/**
 * What the link check needs of a page: the ids it carries and where it links,
 * and every `aria-labelledby` naming an id the page lacks, which leaves its
 * element without a name.
 */
export interface Links {
  readonly ids: ReadonlySet<string>
  readonly hrefs: ReadonlyArray<string>
  readonly unnamed: ReadonlyArray<string>
}

export interface Share {
  /** Every page of the site, in the order the shares are dealt from. */
  readonly paths: ReadonlyArray<string>
  readonly links: ReadonlyArray<readonly [path: string, links: Links]>
  /** The pages asked for whole, as their HTML. */
  readonly read: ReadonlyArray<readonly [path: string, html: string]>
  readonly sitemap: string
}

type Node = DefaultTreeAdapterTypes.ChildNode

const attribute = (node: Node, name: string): string | undefined =>
  'attrs' in node ? node.attrs.find(attr => attr.name === name)?.value : undefined

/**
 * A page's links, as `querySelectorAll` would find them: a template's content
 * is a fragment of its own in parse5 as in the DOM, so the walk leaves it out.
 */
const linksOf = (html: string): Links => {
  const ids = new Set<string>()
  const hrefs: Array<string> = []
  const named: Array<{ readonly tag: string; readonly labelledBy: string }> = []
  const walk = (nodes: ReadonlyArray<Node>, inClosedDialog: boolean): void => {
    for (const node of nodes) {
      if (!('tagName' in node)) continue
      // A closed dialog is out of the accessibility tree, and draws its title only once open.
      const closed =
        inClosedDialog || (node.tagName === 'dialog' && attribute(node, 'open') === undefined)
      const id = attribute(node, 'id')
      if (id !== undefined) ids.add(id)
      if (node.tagName === 'a') hrefs.push(attribute(node, 'href') ?? '')
      const labelledBy = attribute(node, 'aria-labelledby')
      if (labelledBy !== undefined && !closed)
        named.push({ tag: node.tagName.toLowerCase(), labelledBy })
      walk(node.childNodes, closed)
    }
  }
  walk(parse(html).childNodes, false)
  const unnamed = named.flatMap(({ tag, labelledBy }) =>
    labelledBy
      .split(/\s+/)
      .filter(id => !ids.has(id))
      .map(id => `${tag} -> #${id}`),
  )
  return { ids, hrefs, unnamed }
}

export const share = async (options: {
  readonly index: number
  readonly count: number
  readonly read: ReadonlyArray<string>
}): Promise<Share> => {
  const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')
  const specs = typeof site.paths === 'function' ? await site.paths() : site.paths
  const paths = specs.map(spec => (typeof spec === 'string' ? spec : spec.path))
  const built = await Effect.runPromise(
    generateStaticSite({
      ...site,
      paths: specs.filter((_, at) => at % options.count === options.index),
      buildId: 'test-build',
      template,
    }),
  )
  return {
    paths,
    links: built.pages.map(page => [page.path, linksOf(page.html)] as const),
    read: built.pages
      .filter(page => options.read.includes(page.path))
      .map(page => [page.path, page.html] as const),
    sitemap: built.sitemap ?? '',
  }
}
