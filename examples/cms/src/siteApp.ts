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
import { Array as Arr, Effect, Option, Schema } from 'effect'
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
import { Post, PostPage, Posts, PostById, RecentPosts } from './domain.js'
import { Page, Pages } from './pageDomain.js'
import { PostCard, Site } from './site.js'

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

export const Model = Schema.Struct({ remote: Remote.Model, route: Route })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Remote.messages,
  UrlChanged: { url: Url },
  UrlRequested: { request: Navigation.UrlRequest },
  /** Nothing happened. */
  Ticked: {},
})
export type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, Page, ...Object.values(Cms.Entities)],
  queries: [Cms.Entries, Cms.bySlug(Posts), Cms.bySlug(Pages), RecentPosts, PostById],
  mutations: [],
})

const PageRead = Entity.select(Page, { title: true, slug: true, document: true })

/** The page the address names, read by its slug. */
export const pageRead = (model: Model) =>
  model.route._tag === 'Page'
    ? Data.query(Cms.bySlug(Pages), { slug: model.route.slug }, { select: PageRead, first: 1 })
    : undefined

/** The post the address names. */
export const postRead = (model: Model) =>
  model.route._tag === 'Post'
    ? Data.query(Cms.bySlug(Posts), { slug: model.route.slug }, { select: PostPage, first: 1 })
    : undefined

/** The blog's index. */
export const blogRead = (model: Model) =>
  model.route._tag === 'Blog'
    ? Data.query(RecentPosts, {}, { select: PostCard, first: 24 })
    : undefined

/** The first row a read holds, once it holds any. */
export const firstOf = <A>(read: RemoteData<RemotePage<A>> | undefined): Option.Option<A> =>
  read?._tag === 'Ready' || read?._tag === 'Refreshing' ? Arr.head(read.value.items) : Option.none()

/**
 * The page being shown, once it is read. `undefined` for none, because that is
 * what `QueryBlock.active` asks of `documentOf` (FINDINGS, item 13).
 */
export const pageDocument = (model: Model): Document | undefined =>
  Option.getOrUndefined(Option.map(firstOf(pageRead(model)?.read(model)), page => page.document))

const reading = <P>(name: string, projectionOf: (model: Model) => P) => ({
  name,
  owner: App.owner,
  messages: [],
  projectionOf,
})

/** What Remote fetches while it is on screen: the route's read, and the shown page's Blocks. */
export const actives = {
  page: reading('SitePage', pageRead),
  post: reading('SitePost', postRead),
  blog: reading('SiteBlog', blogRead),
  blocks: QueryBlock.active('SiteBlocks', App.owner, Data, Site, pageDocument),
}

const Parent = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
export const placements = Parent.assemble(Data.wiring(actives))

export const update = placements.update((model: Model, message: Message) => {
  switch (message._tag) {
    case 'UrlChanged':
      return { model: { ...model, route: routeOf(message.url) } }
    case 'UrlRequested': {
      const { request } = message
      // A link within the site is a route change; anything else is another application.
      const effect =
        request._tag === 'Internal' && request.url.pathname.startsWith('/site')
          ? Navigation.pushUrl(urlToString(request.url))
          : Navigation.load(request._tag === 'Internal' ? urlToString(request.url) : request.href)
      return {
        model,
        commands: [{ name: 'FollowLink', effect: effect.pipe(Effect.as(Message.Ticked())) }],
      }
    }
    default:
      return { model }
  }
})

export const initial = (url: Url) =>
  placements.initial({ remote: Remote.initial, route: routeOf(url) })
