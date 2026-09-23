/**
 * The application Phase 3's tests check plans against: a post page whose
 * Surfaces read the post, a menu that starts closed in the browser, and a
 * Remote read of the post's author.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineRouteUnion } from 'foldkit/route'
import { Entity, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

export const AppRoute = defineRouteUnion({ Home: {}, Post: { id: Schema.String } })

export const Model = Schema.Struct({
  route: AppRoute,
  post: Schema.Struct({ id: Schema.String, title: Schema.String, liked: Schema.Boolean }),
  menuOpen: Schema.Boolean,
  remote: Remote.Model,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ ...Remote.messages })

export const initial: Model = {
  route: AppRoute.Home(),
  post: { id: '', title: '', liked: false },
  menuOpen: false,
  remote: Remote.initial,
}

export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Data = Remote.at(Remote.define({ entities: [User] }), App.model.remote)

/** Reads the post's id and whether it is liked, while the route is a post. */
const PostActions = App.surface('PostActions', {
  params: { id: Schema.String },
  model: ({ model }) => ({ id: model.post.id, liked: model.post.liked }),
})
export const postActions = Surface.when(PostActions, App.model.route, AppRoute.Post, route => ({
  id: route.id,
}))

/** Reads the menu, which the browser always starts closed. */
const Menu = App.surface('Menu', { model: ({ model }) => ({ open: model.menuOpen }) })
export const menu = Surface.at(Menu, undefined)

/**
 * Active while the post is liked, and reads only its id. Its activation reads
 * `post.liked` inside a callback, which no path records.
 */
const LikedBadge = App.surface('LikedBadge', {
  params: { id: Schema.String },
  model: ({ model }) => ({ id: model.post.id }),
})
export const likedBadge = Surface.at(LikedBadge, (model: Model) =>
  model.post.liked ? { id: model.post.id } : undefined,
)

/** Reads the post's author from Remote, which has no Model path. */
const Author = App.surface('Author', {
  params: { id: Schema.String },
  model: ({ params }) => ({ author: Remote.select(Data, User.select({ name: true }))(params.id) }),
})
export const author = Surface.at(Author, (model: Model) =>
  model.route._tag === 'Post' ? { id: 'u1' } : undefined,
)

/** The same read, for an id taken from `post.id`: only its metadata says which. */
export const postAuthor = Surface.at(Author, (model: Model) =>
  model.route._tag === 'Post' ? { id: model.post.id } : undefined,
)

/** The server's Model for a post page. */
export const served: Model = {
  ...initial,
  route: AppRoute.Post({ id: 'p1' }),
  post: { id: 'p1', title: 'Hello', liked: true },
}

export const config = {
  Model,
  init: () => ({ model: served }),
  update: (model: Model) => ({ model }),
  view: (model: Model, h: HtmlBuilder<typeof Message.Type>) => ({
    title: 'Post',
    body: h.p([h.Id('post')], [model.post.id]),
  }),
  container: null,
}
