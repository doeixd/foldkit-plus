/**
 * The client: one Model, one Message union, one `update`. Remote holds what
 * the server owns, the compose box and the editor are Submodels placed through
 * Bundle, and the route comes from the site's tree.
 */
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { load, pushUrl, UrlRequest } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Bundle } from 'foldkit-bundle'
import { Entity, type Selected } from 'foldkit-entity'
import { Remote, RemoteData, type RemoteClient } from 'foldkit-remote'
import { Site } from 'foldkit-site'
import { Surface } from 'foldkit-surface'
import { Composer } from './compose.js'
import { Chirper } from './domain.js'
import { Editing, Editor } from './editor.js'
import { Like, Post } from './guard.js'
import {
  ByAuthor,
  EditPost,
  LikePost,
  PostChirp,
  Timeline,
  TimelinePost,
  Unlike,
  UserCard,
  likeOf,
  type NewPost,
} from './operations.js'
import { PEOPLE, type Person } from './server/seed.js'
import { AppRoute, ChirpSite, routeOf } from './site.js'

type Return = Update.Return<Model, Message, RemoteClient>

const steps = {
  MintedId: { id: Schema.String },
  ClickedEdit: { id: Schema.String },
  ClosedEditor: {},
  SwitchedPerson: { person: Schema.Literals(PEOPLE) },
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  CompletedLoad: {},
}

// #region loop
export const Model = Schema.Struct({
  ...Composer.fields,
  ...Editing.fields,
  remote: Remote.Model,
  route: AppRoute,
  me: Schema.Literals(PEOPLE),
})
const own = {
  ClickedLike: { postId: Schema.String },
  ...steps,
}
export const Message = defineMessageUnion({
  ...Remote.messages,
  ...Composer.cases,
  ...Editing.cases,
  ...own,
})
const Own = defineMessageUnion(own)
const reduce = (model: Model, message: typeof Own.Type): Return =>
  Own.match(message, {
    ClickedLike: ({ postId }) => like(model, postId),
    // #endregion
    MintedId: ({ id }) => ComposeForm.helpers.fill({ id })(model),
    ClickedEdit: ({ id }) => EditorForm.helpers.open(id)(model),
    ClosedEditor: () => EditorForm.helpers.close()(model),
    // Who you are is the page's, read once when it opens: a different person is a new page.
    SwitchedPerson: ({ person }) => ({ model, commands: [Load({ href: `/?as=${person}` })] }),
    // Claimed by the routing below: they never reach here.
    ClickedLink: () => ({ model }),
    ChangedUrl: () => ({ model }),
    CompletedNavigation: () => ({ model }),
    CompletedLoad: () => ({ model }),
  })
export type Model = typeof Model.Type
export type Message = typeof Message.Type

/** A fresh id for the next chirp: the client names the row it inserts. */
export const MintId = Command.define('MintId', {
  messages: [Message.MintedId],
  execute: Effect.sync(() => Message.MintedId({ id: crypto.randomUUID() })),
})

const Load = Command.define('Load', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoad],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoad())),
})

export const App = Surface.application({ Model, Message })

// #region remote-make
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Chirper, Post, Like],
  queries: [Timeline, ByAuthor],
  mutations: [PostChirp, EditPost, LikePost, Unlike],
  // Who reads: whom a like, a chirp's author, and `liked` are predicted for.
  viewer: model => Option.some(Remote.ref(Chirper, model.me)),
})
// #endregion

// #region surface
export const Home = App.surface('Home', {
  model: () => ({
    timeline: Data.query(Timeline, {}, { select: TimelinePost, first: 25 }),
  }),
})
// #endregion

/** A person's page: who they are, and what they posted. */
export const Profile = App.surface('Profile', {
  params: { handle: Schema.String },
  model: ({ params }) => ({
    person: Data.get(UserCard, params.handle),
    posts: Data.query(ByAuthor, { authorId: params.handle }, { select: TimelinePost, first: 25 }),
  }),
})

/** One post, at its own address. */
export const Status = App.surface('Status', {
  params: { id: Schema.String },
  model: ({ params }) => ({ post: Data.get(TimelinePost, params.id) }),
})

// #region mutate
const post = (model: Model, value: typeof NewPost.Type): Return => {
  const sent = Data.mutate(model, PostChirp, value)
  // The box empties for the next chirp, which gets an id of its own.
  const cleared = ComposeForm.helpers.fill({ body: '' })(sent.model)
  return {
    model: cleared.model,
    commands: [sent.command, ...(cleared.commands ?? []), MintId()],
  }
}
// #endregion

const Liked = Entity.select(Post, { liked: true })

/**
 * A heart pressed: your like taken back where the post shows one, made where
 * not. Read from the Model, not the drawn page, so a second press before the
 * next frame takes back the like the first made. Remote shows the count and
 * the heart at once from the declarations alone.
 */
// #region optimistic
const like = (model: Model, postId: string): Return => {
  const toggled = ({ liked }: Selected<typeof Liked>): Return => {
    const sent = Option.match(liked, {
      onNone: () => Data.mutate(model, LikePost, { id: likeOf(postId, model.me), postId }),
      onSome: id => Data.mutate(model, Unlike, { id }),
    })
    return { model: sent.model, commands: [sent.command] }
  }
  // A heart is drawn only on a post that is read, so the others press nothing.
  const unread = (): Return => ({ model })
  return RemoteData.match(Data.get(Liked, postId).read(model), {
    Initial: unread,
    Loading: unread,
    Ready: toggled,
    Refreshing: toggled,
    Failed: unread,
    NotFound: unread,
  })
}
// #endregion

// #region form-place
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()

export const ComposeForm = Page.at(Composer, {
  onOut:
    ({ value }) =>
    model =>
      post(model, value),
})

export const PostEditor = Editor.at({ data: Data, model: App.model.editor })
export const EditorForm = Page.at(Editing, { onOut: PostEditor.onOut })
// #endregion

/** Every read the page makes, each while its route is the page's. */
export const actives = {
  home: Surface.when(Home, App.model.route, AppRoute.Home, () => undefined),
  profile: Surface.when(Profile, App.model.route, AppRoute.Profile, ({ handle }) => ({ handle })),
  status: Surface.when(Status, App.model.route, AppRoute.Status, ({ id }) => ({ id })),
  editor: PostEditor.active,
}

const Routing = Site.routing<Model, Message, AppRoute>({
  site: ChirpSite,
  route: {
    dependency: ['route'],
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: routeOf,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
})

const placements = Page.assemble(ComposeForm, EditorForm, Data.wiring(actives), Routing)

export const update = PostEditor.after(placements.update(reduce))

export const initial: Model = placements.initial({
  remote: Remote.initial,
  route: AppRoute.Home(),
  me: 'you',
}).model

/** The page as `me` opens it at `url`. */
export const init =
  (me: Person) =>
  (url: Url): Return => ({
    model: modifyFields(initial, { route: () => routeOf(url), me: () => me }),
    commands: [MintId()],
  })

export const subscriptions = placements.subscriptions()
