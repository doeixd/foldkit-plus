/**
 * The blog's posts, read from `docs/blog/` at build time: front matter checked
 * (`frontMatter.ts`), the file's name held to its date, the Markdown parsed once.
 * Nothing here reaches the browser.
 */
import { Option } from 'effect'
import type { Heading, RootContent } from 'mdast'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseMarkdown, slugger } from '../content/guides.js'
import { textOf } from '../content/text.js'
import { parse as parseFrontMatter } from './frontMatter.js'
import { DEFAULT_CARD } from './meta.js'
import { imageSize, type Size } from './imageSize.js'

/** Where posts live, from the repository's root. */
export const POSTS_DIRECTORY = 'docs/blog'

/** The site's public folder, from the repository's root: what `image` paths are under. */
export const PUBLIC = 'examples/site/public'

export interface Post {
  /** The address's last segment: the file's name after its date, dots as hyphens. */
  readonly slug: string
  readonly path: string
  /** The file, from the repository's root. */
  readonly file: string
  readonly title: string
  readonly description: string
  readonly date: string
  readonly updated: Option.Option<string>
  /** `updated`, or `date` for a post never changed: what feeds and meta call the modification. */
  readonly modified: string
  readonly author: string
  readonly tags: ReadonlyArray<string>
  /** The social card as the site serves it, with its pixels read from the file. */
  readonly image: { readonly path: string } & Size
  /** The body, the post's own leading `# title` left out: the page's `h1` is the title. */
  readonly nodes: ReadonlyArray<RootContent>
  /** The `##` headings, for the table of contents. */
  readonly sections: ReadonlyArray<{ readonly id: string; readonly text: string }>
  /** A heading's id, as GitHub would give it in the source file. */
  readonly idOf: (heading: Heading) => string
  readonly minutes: number
}

const FILE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9.-]*)\.md$/

/** Words read in a minute; a line of code is read in four seconds. */
const WORDS_PER_MINUTE = 230
const SECONDS_PER_CODE_LINE = 4

/** Whole minutes to read `nodes`, at least one. */
export const minutesToRead = (nodes: ReadonlyArray<RootContent>): number => {
  let words = 0
  let seconds = 0
  const walk = (node: RootContent): void => {
    if (node.type === 'code') seconds += node.value.split('\n').length * SECONDS_PER_CODE_LINE
    else if (node.type === 'html') return
    else if ('children' in node) node.children.forEach(walk)
    else if (node.type === 'text' || node.type === 'inlineCode')
      words += node.value.split(/\s+/).filter(word => word !== '').length
  }
  nodes.forEach(walk)
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE + seconds / 60))
}

const imageOf = (repository: string, file: string, path: string): Post['image'] => {
  const disk = join(repository, PUBLIC, path)
  if (!existsSync(disk)) throw new Error(`${file}: image ${path} is not in ${PUBLIC}`)
  return { path, ...imageSize(file, readFileSync(disk)) }
}

const readPost = (repository: string, name: string): Post => {
  const file = `${POSTS_DIRECTORY}/${name}`
  const [, day, rest] = FILE.exec(name) ?? []
  if (day === undefined || rest === undefined)
    throw new Error(`${file}: a post's file is named <yyyy-mm-dd>-<slug>.md, in lowercase`)
  const { data, body } = parseFrontMatter(file, readFileSync(join(repository, file), 'utf8'))
  if (data.date !== day)
    throw new Error(`${file}: the file is dated ${day} but its front matter says ${data.date}`)
  const root = parseMarkdown(body)
  const first = root.children.find(node => node.type !== 'html')
  const leading = first?.type === 'heading' && first.depth === 1 ? first : undefined
  if (leading !== undefined && textOf(leading) !== data.title)
    throw new Error(
      `${file}: the post's own heading "${textOf(leading)}" is not its title "${data.title}"`,
    )
  const slug = rest.replaceAll('.', '-')
  const idFor = slugger()
  const ids = new Map<Heading, string>()
  for (const node of root.children) if (node.type === 'heading') ids.set(node, idFor(textOf(node)))
  const nodes = root.children.filter(node => node !== leading)
  return {
    slug,
    path: `/blog/${slug}`,
    file,
    title: data.title,
    description: data.description,
    date: data.date,
    updated: Option.fromNullishOr(data.updated),
    modified: data.updated ?? data.date,
    author: data.author,
    tags: data.tags,
    image: imageOf(repository, file, data.image ?? DEFAULT_CARD.path),
    nodes,
    sections: nodes.flatMap(node =>
      node.type === 'heading' && node.depth === 2
        ? [{ id: ids.get(node) ?? '', text: textOf(node) }]
        : [],
    ),
    idOf: heading => ids.get(heading) ?? '',
    minutes: minutesToRead(nodes),
  }
}

/** Every post, newest first. A slug two files claim, or a name that is no post's, fails the build. */
export const loadPosts = (repository: string): ReadonlyArray<Post> => {
  const directory = join(repository, POSTS_DIRECTORY)
  const posts = readdirSync(directory)
    .filter(name => name.endsWith('.md'))
    .map(name => readPost(repository, name))
  const claimed = new Map<string, string>()
  for (const post of posts) {
    const other = claimed.get(post.slug)
    if (other !== undefined) throw new Error(`${post.file} and ${other} are both at ${post.path}`)
    claimed.set(post.slug, post.file)
  }
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug))
}
