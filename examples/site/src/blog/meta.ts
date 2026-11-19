/**
 * What the head says of a blog page: Open Graph, Twitter, the article's dates
 * and tags, and a `BlogPosting` for search engines. The plan's `meta` reads it
 * from the Model's page, so the browser runs it too: it holds no library, and
 * a post's page carries what is needed (`page.ts`).
 */
import { Option } from 'effect'
import type { Meta } from 'foldkit-ssr'

import { Page } from '../page.js'

export const SITE_NAME = 'Foldkit Plus'

export const BLOG_DESCRIPTION =
  'Release notes and the reasoning behind Foldkit Plus: what changed, why, and what to write instead.'

/** The card a post without an `image` shares, and the index: 1200 by 630, made by `scripts/social.mjs`. */
export const DEFAULT_CARD = { path: '/blog/og/default.png', width: 1200, height: 630 }

/** The Atom feed, whose `<link rel="alternate">` every page's template carries. */
export const FEED = '/blog/feed.xml'

type PostPage = Extract<typeof Page.Type, { readonly _tag: 'Post' }>

const postMeta = (post: PostPage, origin: string): Meta => {
  const image = new URL(post.image.path, origin).href
  const url = new URL(`/blog/${post.slug}`, origin).href
  return {
    title: post.title,
    description: post.description,
    image,
    imageSize: { width: post.image.width, height: post.image.height },
    imageAlt: post.title,
    type: 'article',
    siteName: SITE_NAME,
    article: {
      published: post.published,
      modified: post.modified,
      authors: [post.author],
      tags: post.tags,
    },
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.published,
        dateModified: post.modified,
        author: { '@type': 'Person', name: post.author },
        image: [image],
        keywords: post.tags.join(', '),
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: origin },
      },
    ],
  }
}

/** The head of a blog page, none for any other page. */
export const metaOf = (page: Page, origin: string): Option.Option<Meta> =>
  Page.matchOrElse(
    page,
    {
      Blog: () =>
        Option.some<Meta>({
          title: `Blog · ${SITE_NAME}`,
          description: BLOG_DESCRIPTION,
          image: new URL(DEFAULT_CARD.path, origin).href,
          imageSize: DEFAULT_CARD,
          imageAlt: SITE_NAME,
          type: 'website',
          siteName: SITE_NAME,
        }),
      Post: post => Option.some(postMeta(post, origin)),
    },
    () => Option.none<Meta>(),
  )
