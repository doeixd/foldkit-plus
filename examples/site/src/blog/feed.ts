/**
 * The blog's Atom feed (RFC 4287), written at build time to `/blog/feed.xml`.
 * An entry is the post's summary and a link, not its text: the post's code
 * blocks, tables and diagrams are drawn by the site's own styles, which a
 * feed reader does not have.
 */
import type { Post } from './posts.js'
import { BLOG_DESCRIPTION, FEED, SITE_NAME } from './meta.js'

const xml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** A day as the instant Atom wants: midnight UTC. */
const instant = (day: string): string => `${day}T00:00:00Z`

/** The feed of `posts` (newest first, as `loadPosts` returns them) under `origin`. */
export const feedOf = (posts: ReadonlyArray<Post>, origin: string): string => {
  const at = (path: string) => new URL(path, origin).href
  const updated = posts
    .map(post => post.modified)
    .sort()
    .at(-1)
  if (updated === undefined) throw new Error('the blog has no posts, so no feed')
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">',
    `  <title>${xml(`${SITE_NAME} blog`)}</title>`,
    `  <subtitle>${xml(BLOG_DESCRIPTION)}</subtitle>`,
    `  <id>${xml(at('/blog'))}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${xml(at(FEED))}"/>`,
    `  <link rel="alternate" type="text/html" href="${xml(at('/blog'))}"/>`,
    `  <updated>${instant(updated)}</updated>`,
    ...posts.flatMap(post => [
      '  <entry>',
      `    <title>${xml(post.title)}</title>`,
      `    <id>${xml(at(post.path))}</id>`,
      `    <link rel="alternate" type="text/html" href="${xml(at(post.path))}"/>`,
      `    <published>${instant(post.date)}</published>`,
      `    <updated>${instant(post.modified)}</updated>`,
      `    <author><name>${xml(post.author)}</name></author>`,
      ...post.tags.map(tag => `    <category term="${xml(tag)}"/>`),
      `    <summary>${xml(post.description)}</summary>`,
      '  </entry>',
    ]),
    '</feed>',
    '',
  ].join('\n')
}
