/**
 * The blog rendered as the build renders it, over a library of the blog alone:
 * the guides take over a minute to read, and a post's page needs none of them.
 * The site's own `siteOf` makes the pages, the sitemap and the feed.
 */
import { Effect, Option } from 'effect'
import { generateStaticSite } from 'foldkit-ssr/vite'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { makeBlog } from '../src/blog/library.js'
import { DEFAULT_CARD } from '../src/blog/meta.js'
import { highlighter } from '../src/content/highlight.js'
import type { ServerLibrary } from '../src/content/library.js'
import { browserLibrary } from '../src/library.js'
import { Page } from '../src/page.js'
import { siteOf } from '../src/site.js'

export const REPOSITORY = join(import.meta.dirname, '../../..')

/** The bytes of a PNG that has a header and a size, which is all the blog reads of one. */
export const png = (width: number, height: number): Buffer => {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

/** A repository of its own holding `posts` (file name to text) and the default card. */
export const repositoryOf = (
  posts: Readonly<Record<string, string>>,
  files: Readonly<Record<string, Buffer>> = {},
): string => {
  const root = mkdtempSync(join(tmpdir(), 'blog-'))
  const write = (path: string, contents: string | Buffer) => {
    const file = join(root, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, contents)
  }
  mkdirSync(join(root, 'docs/blog'), { recursive: true })
  write(`examples/site/public${DEFAULT_CARD.path}`, readFileSync(realCard))
  for (const [name, text] of Object.entries(posts)) write(`docs/blog/${name}`, text)
  for (const [path, bytes] of Object.entries(files)) write(`examples/site/public${path}`, bytes)
  return root
}

const realCard = join(REPOSITORY, 'examples/site/public', DEFAULT_CARD.path)

let highlight: ReturnType<typeof highlighter> | undefined

/** A relative link in a post leads to `resolved:` and the link; the guides' own resolver is theirs to test. */
const links = {
  href: () => (url: string) => `resolved:${url}`,
  codeLink: () => Option.none<string>(),
}

export const libraryOf = async (repository: string): Promise<ServerLibrary> => {
  highlight ??= highlighter()
  const blog = makeBlog(repository, await highlight, links)
  return {
    ...browserLibrary,
    paths: blog.paths,
    modified: blog.modified,
    feed: blog.feed,
    blog: blog.region,
    blogPosts: blog.posts,
    pageAt: path => Option.getOrElse(blog.pageAt(path), () => Page.Missing()),
  }
}

const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')

/** What the build writes for `paths` of the blog in `repository`: pages, sitemap and the feed. */
export const build = async (repository: string, paths?: ReadonlyArray<string>) => {
  const library = await libraryOf(repository)
  const site = siteOf(async () => library)
  const specs = typeof site.paths === 'function' ? await site.paths() : site.paths
  const built = await Effect.runPromise(
    generateStaticSite({
      ...site,
      paths: paths ?? specs,
      buildId: 'test-build',
      template,
    }),
  )
  const emitted = (await site.emit?.(built.pages)) ?? []
  return { ...built, emitted, library }
}
