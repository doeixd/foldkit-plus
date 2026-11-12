/**
 * What the client is made of: the Model, the Message union, the Remote store
 * and the three Surfaces. The route tree (`site.ts`) places each Surface on
 * its node; `app.ts` assembles the loop over both.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'
import { Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { Composer } from './compose.js'
import { Chirper } from './domain.js'
import { Editing } from './editor.js'
import { Like, Post } from './guard.js'
import {
  ByAuthor,
  DeletePost,
  EditPost,
  LikePost,
  PostChirp,
  Timeline,
  TimelinePost,
  Unlike,
  UserCard,
  NewPost,
} from './operations.js'
import { PEOPLE } from './server/seed.js'
import { AppRoute } from './route.js'

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
  ClickedDelete: { id: Schema.String },
  ClockedPost: { post: NewPost, now: Schema.Number },
  ...steps,
}
export const Message = defineMessageUnion({
  ...Remote.messages,
  ...Composer.cases,
  ...Editing.cases,
  ...own,
})
export const Own = defineMessageUnion(own)
// #endregion

export type Model = typeof Model.Type
export type Message = typeof Message.Type

export const App = Surface.application({ Model, Message })

// #region remote-make
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Chirper, Post, Like],
  queries: [Timeline, ByAuthor],
  mutations: [PostChirp, EditPost, DeletePost, LikePost, Unlike],
  // Who reads: whom a like, a chirp's author, and `liked` are predicted for.
  viewer: model => Option.some(Remote.ref(Chirper, model.me)),
  // Off in a build; `tsx` has no `import.meta.env`.
  verifyPredictions: import.meta.env?.DEV === true,
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
