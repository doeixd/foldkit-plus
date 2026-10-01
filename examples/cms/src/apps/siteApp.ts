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
 */
import { Array as Arr, Effect, Equal, Match, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Cms } from 'foldkit-cms'
import type { Document } from 'foldkit-composition'
import { QueryBlock } from 'foldkit-composition/remote'
import { Entity } from 'foldkit-entity'
import { Remote, type Page as RemotePage, type RemoteClient, type RemoteData } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import { Url, toString as urlToString } from 'foldkit/url'
import { Post, PostPage, Posts, PostById, RecentPosts } from '../content/domain.js'
import { Page, Pages } from '../content/pageDomain.js'
import { PostCard, Site } from '../content/site.js'
import { chairOf, chairs } from '../server/transport.js'

export const Route = Schema.Union([
  Schema.TaggedStruct('Page', { slug: Schema.String }),
  Schema.TaggedStruct('Blog', {}),
  Schema.TaggedStruct('Post', { slug: Schema.String }),
])
export type Route = typeof Route.Type

/** Where an address is on the site. Anything under `/site` is a page until it is not found. */
export const routeOf = (url: Url): Route => {
  const [, first, second] = url.pathname
    .split('/')
    .filter(part => part !== '')
    .map(part => decodeURIComponent(part))
  if (first === undefined) return { _tag: 'Page', slug: 'home' }
  if (first !== 'blog') return { _tag: 'Page', slug: first }
  return second === undefined ? { _tag: 'Blog' } : { _tag: 'Post', slug: second }
}

/** The address of a route: the inverse of `routeOf`. */
export const pathOf = (route: Route): string => {
  switch (route._tag) {
    case 'Page':
      return route.slug === 'home' ? '/site' : `/site/${encodeURIComponent(route.slug)}`
    case 'Blog':
      return '/site/blog'
    case 'Post':
      return `/site/blog/${encodeURIComponent(route.slug)}`
  }
}

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
  queries: [Cms.Entries, Cms.bySlug(Posts), Cms.bySlug(Pages), RecentPosts, PostById],
  mutations: [],
})

const PageRead = Entity.select(Page, { title: true, slug: true, document: true })

/** The page the address names, read by its slug; none on another route. */
export const pageRead = (model: Model) =>
  model.route._tag === 'Page'
    ? Option.some(
        Data.query(Cms.bySlug(Pages), { slug: model.route.slug }, { select: PageRead, first: 1 }),
      )
    : Option.none()

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
  blocks: QueryBlock.active('SiteBlocks', App.owner, Data, Site, pageDocument),
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
      // A link within the site is a route change; anything else is another application.
      const effect =
        request._tag === 'Internal' && request.url.pathname.startsWith('/site')
          ? Navigation.pushUrl(urlToString(request.url))
          : Navigation.load(request._tag === 'Internal' ? urlToString(request.url) : request.href)
      return {
        model,
        commands: [{ name: 'FollowLink', effect: effect.pipe(Effect.as(Message.Ticked())) }],
      }
    },
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
