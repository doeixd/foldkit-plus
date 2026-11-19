/**
 * The blog as the server's library holds it: the pages it adds to the site,
 * the regions that draw them, and the feed. `content/library.ts` joins it to
 * the guides'; the browser never loads it.
 */
import { Option } from 'effect'

import type { Highlight } from '../content/highlight.js'
import type { Draw } from '../library.js'
import { Page } from '../page.js'
import { feedOf } from './feed.js'
import { BLOG_DESCRIPTION, FEED } from './meta.js'
import { loadPosts, POSTS_DIRECTORY, type Post } from './posts.js'
import { bodyOf } from './render.js'
import { IndexView, PostView } from './view.js'

export const BLOG = '/blog'

/** What the blog needs of the guides' library: where a link written in a repository file leads. */
export interface Links {
  /** A link written in `file`, as the site serves it. */
  readonly href: (file: string) => (url: string) => string
  /** The page a code span names, if the site explains it. */
  readonly codeLink: (code: string, from: string) => Option.Option<string>
}

export interface Blog {
  /** The index and each post's address. */
  readonly paths: ReadonlyArray<string>
  /** When each post was last changed, by address, for the sitemap's `lastmod`. */
  readonly modified: ReadonlyMap<string, string>
  readonly pageAt: (path: string) => Option.Option<Page>
  /** An address's page, drawn: the index or a post. */
  readonly region: (path: string) => Draw
  /** The posts as a list of links, the one at `path` marked. */
  readonly posts: (path: string) => Draw
  /** The Atom feed, under the site's `origin`. */
  readonly feed: (origin: string) => string
}

const pageOf = (post: Post): Page =>
  Page.Post({
    slug: post.slug,
    title: post.title,
    description: post.description,
    published: post.date,
    modified: post.modified,
    author: post.author,
    tags: post.tags,
    image: post.image,
  })

export const makeBlog = (
  repository: string,
  highlight: Highlight,
  { href, codeLink }: Links,
): Blog => {
  const posts = loadPosts(repository)
  const latest = posts.map(post => post.modified).sort().at(-1)
  if (latest === undefined) throw new Error(`${POSTS_DIRECTORY} holds no posts, so the blog is empty`)
  const byPath = new Map(posts.map(post => [post.path, post]))
  const region =
    (path: string): Draw =>
    ih => {
      if (path === BLOG) return [IndexView({ posts, description: BLOG_DESCRIPTION }, ih)]
      const post = byPath.get(path)
      if (post === undefined) throw new Error(`no blog page at ${path}`)
      const at = posts.indexOf(post)
      const resolve = href(post.file)
      const body = bodyOf(
        ih,
        {
          highlight,
          // A same-page anchor stays one: the file is not a page the guides know.
          href: url => (url.startsWith('#') ? url : resolve(url)),
          idOf: post.idOf,
          codeLink: code => codeLink(code, post.path),
        },
        repository,
        post,
      )
      return [
        PostView(
          {
            post,
            body,
            // Newest first: the post after this one in the list is the one before it in time.
            previous: Option.fromNullishOr(posts[at + 1]),
            next: Option.fromNullishOr(posts[at - 1]),
          },
          ih,
        ),
      ]
    }
  return {
    paths: [BLOG, ...posts.map(post => post.path)],
    modified: new Map([
      [BLOG, latest],
      ...posts.map(post => [post.path, post.modified] as const),
    ]),
    pageAt: path =>
      path === BLOG
        ? Option.some(Page.Blog())
        : Option.map(Option.fromNullishOr(byPath.get(path)), pageOf),
    region,
    posts: path => ih => [
      ih.section(
        [],
        [
          ih.h2([], ['Posts']),
          ih.ul(
            [],
            posts.map(post =>
              ih.li(
                [],
                [
                  ih.a(
                    [ih.Href(post.path), ...(post.path === path ? [ih.AriaCurrent('page')] : [])],
                    [post.title],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      ih.ul([], [ih.li([], [ih.a([ih.Href(FEED)], ['Atom feed'])])]),
    ],
    feed: origin => feedOf(posts, origin),
  }
}
