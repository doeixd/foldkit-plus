/**
 * The public site: what a visitor reads, at `/site`. Pages come from the page
 * Builder and posts from the post editor, each read by its address through
 * Remote as the visitor may see it, so only what is published shows. A page's
 * Query Blocks read through the same Remote store.
 *
 *   /site             the page whose address is `home`
 *   /site/blog        the blog, newest first
 *   /site/blog/<slug> a post
 *   /site/<slug>      any other page
 *
 * The addresses are one Site tree (`foldkit-site`): it parses an address to
 * its route, builds the address back, and says what each page tells a search
 * engine and a link preview, from the page's own data.
 */
import { Array as Arr, Effect, Equal, Match, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms } from 'foldkit-cms'
import type { Document } from 'foldkit-composition'
import { QueryBlock } from 'foldkit-composition/remote'
import { Entity } from 'foldkit-entity'
import { Remote, RemoteData, type Page as RemotePage, type RemoteClient } from 'foldkit-remote'
import { Site } from 'foldkit-site'
import type { Meta } from 'foldkit-ssr/client'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import { UrlRequest } from 'foldkit/navigation'
import { Url, toString as urlToString } from 'foldkit/url'
import { ORIGIN, Post, PostPage, Posts, PostById, RecentPosts } from '../content/domain.js'
import { Page, Pages, PublishedPages } from '../content/pageDomain.js'
import { PostCard, Site as Kit } from '../content/site.js'
import {
  Route,
  blogRouter,
  homeRouter,
  pageRouter,
  pageSlugOf,
  postRouter,
} from '../content/siteRoutes.js'
import { chairOf, chairs } from '../server/transport.js'

export const Model = Schema.Struct({
  remote: Remote.Model,
  route: Route,
  /** Who is reading: a visitor, unless the address says (`?as=edda`). Links keep it. */
  reader: Schema.Literals(chairs),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Remote.messages,
  UrlChanged: { url: Url },
  UrlRequested: { request: Navigation.UrlRequest },
  /** The reader is over, or on, a link: where they may go next. */
  PointedAtLink: { url: Url },
  /** Nothing happened. */
  Ticked: {},
  /** The reader was moved to what a route change drew. */
  FocusedMain: {},
})
export type Message = typeof Message.Type

export const App = Surface.application({ Model, Message })
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, Page, ...Object.values(Cms.Entities)],
  queries: [
    Cms.Entries,
    Cms.bySlug(Posts),
    Cms.bySlug(Pages),
    RecentPosts,
    PostById,
    PublishedPages,
  ],
  mutations: [],
})

const PageRead = Entity.select(Page, { title: true, slug: true, document: true })

/** The page the address names, read by its slug; none on another route. */
export const pageRead = (model: Model) =>
  Option.map(pageSlugOf(model.route), slug =>
    Data.query(Cms.bySlug(Pages), { slug }, { select: PageRead, first: 1 }),
  )

/** The post the address names. */
export const postRead = (model: Model) =>
  model.route._tag === 'Post'
    ? Option.some(
        Data.query(Cms.bySlug(Posts), { slug: model.route.slug }, { select: PostPage, first: 1 }),
      )
    : Option.none()

/** The blog's index. */
export const blogRead = (model: Model) =>
  model.route._tag === 'Blog'
    ? Option.some(Data.query(RecentPosts, {}, { select: PostCard, first: 24 }))
    : Option.none()

/** The first row a read holds, once it holds any. */
export const firstOf = <A>(read: RemoteData<RemotePage<A>>): Option.Option<A> =>
  read._tag === 'Ready' || read._tag === 'Refreshing' ? Arr.head(read.value.items) : Option.none()

/** The page being shown, once it is read. */
export const pageDocument = (model: Model): Option.Option<Document> =>
  Option.map(
    Option.flatMap(pageRead(model), read => firstOf(read.read(model))),
    page => page.document,
  )

/** What Remote fetches while it is on screen: the route's read, and the shown page's Blocks. */
export const actives = {
  page: Data.active('SitePage', pageRead),
  post: Data.active('SitePost', postRead),
  blog: Data.active('SiteBlog', blogRead),
  blocks: QueryBlock.active('SiteBlocks', App.owner, Data, Kit, pageDocument),
}

// HEAD

/** What the blog's index says it is: its subtitle, and its description to a search engine. */
export const BLOG_LEDE =
  'How this demo is made, one part at a time: its CMS, its page builder and the packages under them.'

/** What the site says of itself where a page says nothing of its own. */
const SITE_DESCRIPTION =
  'A blog, its studio and its server, built with Foldkit Plus: posts that explain how the demo is made.'

/** The preview image every page offers a link preview. */
const IMAGE = `${ORIGIN}/og.jpg`

/** A description a search result can show: the first sentences, within 160 characters. */
const summary = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= 160) return flat
  const cut = flat.slice(0, 157)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

/** What a page says of itself: its title, and its Hero's lead or first Text. */
const pageMeta = (model: Model): Meta => {
  const said = Option.flatMap(pageDocument(model), document =>
    Option.fromUndefinedOr(
      Object.values(document.nodes)
        .map(node => node.props['lead'] ?? node.props['body'])
        .find((text): text is string => typeof text === 'string' && text !== ''),
    ),
  )
  const title = Option.map(
    Option.flatMap(pageRead(model), read => firstOf(read.read(model))),
    page => page.title,
  )
  return {
    title: Option.getOrElse(title, () => 'Journal'),
    description: summary(Option.getOrElse(said, () => SITE_DESCRIPTION)),
  }
}

/** A post's excerpt, and, once it is published, its article facts and structured data. */
const postMeta = (route: Route & { readonly _tag: 'Post' }, model: Model): Meta =>
  Option.match(
    Option.flatMap(postRead(model), read => firstOf(read.read(model))),
    {
      // Not a post (yet): the site, not the blog it is missed from.
      onNone: () => ({ title: 'Journal', description: SITE_DESCRIPTION }),
      onSome: post => {
        const description = summary(post.excerpt)
        return Option.match(Option.fromNullOr(post.publishedAt), {
          onNone: () => ({ title: post.title, description }),
          onSome: at => ({
            title: post.title,
            description,
            type: 'article',
            article: { published: at },
            // What a search engine reads of a post, as it would a published article.
            jsonLd: [
              {
                '@context': 'https://schema.org',
                '@type': 'BlogPosting',
                headline: post.title,
                description,
                datePublished: at,
                url: `${ORIGIN}${Site.hrefOf(SiteMap, route)}`,
                image: IMAGE,
              },
            ],
          }),
        })
      },
    },
  )

const HomeNode = Site.node(homeRouter, Route.Home)
  // Every page's: a page below says its own title and description over these.
  .meta<Model>(({ model }) => ({
    siteName: 'Journal',
    image: IMAGE,
    type: 'website',
    ...pageMeta(model),
  })).node
const BlogNode = Site.node(blogRouter, Route.Blog).meta(() => ({
  title: 'The blog',
  description: BLOG_LEDE,
})).node
export const PostNode = Site.node(postRouter, Route.Post).meta<Model>(({ route, model }) =>
  postMeta(route, model),
).node
export const PageNode = Site.node(pageRouter, Route.Page).meta<Model>(({ model }) =>
  pageMeta(model),
).node

/** The site's addresses: the home page, the blog and its posts, and every other page. */
export const SiteMap = Site.make(Site.mount(HomeNode, [Site.mount(BlogNode, [PostNode]), PageNode]))

/**
 * Where an address is on the site. One the tree does not hold is a page by
 * that address, which the server does not have, so it reads as missing.
 */
export const routeOf = Site.parse(SiteMap, { make: ({ path }) => Route.Page({ slug: path }) })

/** What a route says of itself to a search engine and a link preview: the plan's `meta`. */
export const metaOf = (model: Model): Meta => Site.metaOf(SiteMap, model.route, model)

/**
 * Whether the route's read, and each read of the page's Blocks, has an
 * answer: what the site draws then is the page, not a loading state.
 */
export const answered = (model: Model): boolean => {
  const route = (read: Option.Option<{ readonly read: (model: Model) => RemoteData<unknown> }>) =>
    Option.match(read, {
      onNone: () => true,
      onSome: each => RemoteData.answered(each.read(model)),
    })
  return (
    route(pageRead(model)) &&
    route(postRead(model)) &&
    route(blogRead(model)) &&
    actives.blocks.answered(model)
  )
}

const Parent = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
export const placements = Parent.assemble(Data.wiring(actives))

/**
 * Moves the reader to what a route change drew: the bar is the same, the page
 * is not. The site is rendered on the server too, where a route change is not
 * a keyboard's to answer.
 */
export const focusMain = (): void => {
  if (typeof document === 'undefined') return
  document.getElementById('site-main')?.focus()
}

export const update = placements.update((model, message) => {
  // Remote's Messages go to its wiring, so they never reach here; the guard
  // narrows to the application's own tags, which the match below covers all of.
  if (Remote.reduces(message)) return { model }
  return Match.valueTags(message, {
    UrlChanged: ({ url }) => {
      const route = routeOf(url)
      // A URL the site wrote comes back as the route it already shows: nothing
      // changes, and nothing is worth moving focus for.
      if (Equal.equals(route, model.route)) return { model }
      return {
        model: { ...model, route },
        commands: [
          {
            name: 'FocusMain',
            effect: Effect.sync(focusMain).pipe(Effect.as(Message.FocusedMain())),
          },
        ],
      }
    },
    UrlRequested: ({ request }) => {
      // A link the site's tree holds is a route change; any other is another
      // application's (the studio's), a full load away.
      const effect = UrlRequest.match(request, {
        Internal: ({ url }) =>
          Option.match(Site.routeAt(SiteMap, url), {
            onNone: () => Navigation.load(urlToString(url)),
            onSome: () => Navigation.pushUrl(urlToString(url)),
          }),
        External: ({ href }) => Navigation.load(href),
      })
      return {
        model,
        commands: [{ name: 'FollowLink', effect: effect.pipe(Effect.as(Message.Ticked())) }],
      }
    },
    // Reads what the page there will read, so it draws at once if the reader goes.
    PointedAtLink: ({ url }) =>
      Option.match(Site.routeAt(SiteMap, url), {
        onNone: () => ({ model }),
        onSome: route =>
          Equal.equals(route, model.route)
            ? { model }
            : { model, commands: [Data.preload({ ...model, route }, actives)] },
      }),
    Ticked: () => ({ model }),
    FocusedMain: () => ({ model }),
  })
})

export const initial = (url: Url) =>
  placements.initial({
    remote: Remote.initial,
    route: routeOf(url),
    reader: chairOf(
      Option.getOrElse(url.search, () => ''),
      'visitor',
    ),
  })
