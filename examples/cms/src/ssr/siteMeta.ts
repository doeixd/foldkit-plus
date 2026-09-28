/**
 * What each site page says of itself to a search engine and a link preview:
 * the plan's `meta` (`sitePlan.ts`), written into the generated page and kept
 * in step as the reader moves between pages.
 */
import { Option } from 'effect'
import type { Meta } from 'foldkit-ssr'
import { ORIGIN } from '../content/domain.js'
import * as Site from '../apps/siteApp.js'
import { BLOG_LEDE } from '../views/siteView.js'

/** What the site says of itself where a page says nothing of its own. */
export const SITE_DESCRIPTION =
  'A blog, its studio and its server, built with Foldkit Plus: posts that explain how the demo is made.'

/** The preview image every page offers a link preview. */
export const IMAGE = `${ORIGIN}/og.jpg`

/** A description a search result can show: the first sentences, within 160 characters. */
export const summary = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= 160) return flat
  const cut = flat.slice(0, 157)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

/** What a page says of itself: a post its excerpt, a page its Hero's lead or first Text. */
const describe = (model: Site.Model) => {
  const post = Option.flatMap(Site.postRead(model), read => Site.firstOf(read.read(model)))
  if (Option.isSome(post))
    return {
      title: post.value.title,
      description: post.value.excerpt,
      published: Option.fromNullOr(post.value.publishedAt),
    }
  if (model.route._tag === 'Blog')
    return { title: 'The blog', description: BLOG_LEDE, published: Option.none<string>() }
  const said = Option.flatMap(Site.pageDocument(model), document =>
    Option.fromUndefinedOr(
      Object.values(document.nodes)
        .map(node => node.props['lead'] ?? node.props['body'])
        .find((text): text is string => typeof text === 'string' && text !== ''),
    ),
  )
  const title = Option.getOrElse(
    Option.map(
      Option.flatMap(Site.pageRead(model), read => Site.firstOf(read.read(model))),
      page => page.title,
    ),
    () => 'Journal',
  )
  return {
    title,
    description: Option.getOrElse(said, () => SITE_DESCRIPTION),
    published: Option.none<string>(),
  }
}

/** The page's description, its link preview, and a post's article facts and structured data. */
export const metaOf = (model: Site.Model): Meta => {
  const { title, description, published } = describe(model)
  const said = summary(description)
  const common = { title, description: said, siteName: 'Journal', image: IMAGE }
  return Option.match(published, {
    onNone: () => ({ ...common, type: 'website' }),
    onSome: at => ({
      ...common,
      type: 'article',
      article: { published: at },
      // What a search engine reads of a post, as it would a published article.
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: title,
          description: said,
          datePublished: at,
          url: `${ORIGIN}${Site.pathOf(model.route)}`,
          image: IMAGE,
        },
      ],
    }),
  })
}
