/**
 * The application: one Model, one Message union, one `update`, shared by the
 * Worker's render and the browser. Remote holds what the server owns; the
 * route comes from the site tree; the forms are Submodels placed through
 * Bundle. A sign-in or a sign-out loads the next page, which the Worker
 * renders as the new reader, so nothing here forgets a principal in place.
 */
import type * as Client from '@yielded/auth/Client'
import { Clock, Context, Effect, Match, Option, Redacted, Schema, pipe } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { load, pushUrl, UrlRequest } from 'foldkit/navigation'
import { defineRouteUnion, literal, mapTo, query, root, slash, string } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { Bundle, Resource } from 'foldkit-plus/bundle'
import { Entity } from 'foldkit-plus/entity'
import { ME } from 'foldkit-plus/guard'
import { pointedLinks } from 'foldkit-plus/primitives/dom'
import { Remote, RemoteData, type RemoteClient } from 'foldkit-plus/remote'
import { Access, Site } from 'foldkit-plus/site'
import { SSR } from 'foldkit-plus/ssr/client'
import { ModelRef, Projection, Surface } from 'foldkit-plus/surface'
import type { AuthApi } from './authApi.js'
import { Adding, Editing, Editor } from './forms.js'
import { Me, Member } from './guard.js'
import {
  AddNote,
  DeleteNote,
  MemberCard,
  NOTES_PAGE,
  NoteDetail,
  NoteDraft,
  NoteRow,
  Notes,
  served,
} from './operations.js'

/**
 * Yielded's client, as the sign-in, sign-up and sign-out Commands read it.
 * Its code is a chunk of its own (`authClient.ts`), loaded on first use:
 * this module names only its type.
 */
export class AppClient extends Context.Service<
  AppClient,
  { readonly auth: Client.AuthClient<typeof AuthApi.actions> }
>()('reference/AppClient') {}

/** What a Command or Subscription here needs from the runtime's `resources`. */
export type Services = RemoteClient | Resource.Lazy<AppClient>

type Return = Update.Return<Model, Message, Services>

// ROUTES

export const AppRoute = defineRouteUnion({
  /** `returnTo` is the page that sent a visitor here; `null` on the wire, as the route crosses in the page. */
  SignIn: { returnTo: Schema.OptionFromNullOr(Schema.String) },
  Notebook: {},
  NotePage: { id: Schema.String },
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

// MODEL AND MESSAGES

const AuthMode = Schema.Literals(['signIn', 'signUp'])

export const Model = Schema.Struct({
  ...Adding.fields,
  ...Editing.fields,
  remote: Remote.Model,
  route: AppRoute,
  mode: AuthMode,
  name: Schema.String,
  email: Schema.String,
  password: Schema.String,
  passwordShown: Schema.Boolean,
  /** Why the last sign-in, sign-up or sign-out failed, until the next try. */
  notice: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

const own = {
  SwitchedMode: { mode: AuthMode },
  ChangedName: { value: Schema.String },
  ChangedEmail: { value: Schema.String },
  ChangedPassword: { value: Schema.String },
  ToggledPassword: {},
  SubmittedAuth: {},
  FailedAuth: { reason: Schema.String },
  ClickedSignOut: {},
  /** A draft from the add form, given its id and the time it was added. */
  NamedNote: { id: Schema.String, title: Schema.String, body: Schema.String, now: Schema.Number },
  ClickedEdit: { id: Schema.String },
  ClickedDelete: { id: Schema.String },
  ClickedDismiss: { requestId: Schema.String },
  ClickedRetry: { requestId: Schema.String },
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  PointedAtLink: { url: Url },
  CompletedNavigation: {},
}

export const Message = defineMessageUnion({
  ...Remote.messages,
  ...Adding.cases,
  ...Editing.cases,
  ...own,
})
export type Message = typeof Message.Type

/** What reaches this module's own `update`: its own Messages, and a write that failed. */
const Heard = defineMessageUnion({ ...own, MutationFailed: Remote.messages.MutationFailed })

// REMOTE AND SURFACES

export const App = Surface.application({ Model, Message })

export const Data = Remote.make({
  model: App.model.remote,
  ...served,
  // Who reads: a new note's author, and whose count it moves.
  viewer: model => Option.map(viewerOf(model), id => Remote.ref(Member, id)),
  // Off in a build; `tsx` has no `import.meta.env`.
  verifyPredictions: import.meta.env?.DEV === true,
})

const MeRow = Entity.select(Me, { signedIn: true, key: true })

/** Who the page is signed in as, as the server answered: read on every page. */
export const Session = App.surface('Session', { model: () => ({ me: Data.get(MeRow, ME) }) })

/** The reader's id, once the server has said who they are. */
export const viewerOf = (model: Model): Option.Option<string> =>
  RemoteData.match(Surface.read(Session, model).me, {
    Initial: () => Option.none(),
    Loading: () => Option.none(),
    Ready: me => me.key,
    Refreshing: me => me.key,
    Failed: () => Option.none(),
    NotFound: () => Option.none(),
  })

/**
 * Every note, watched live, and the reader's own card: who they are and how
 * much they have written.
 */
export const NotebookPage = App.surface('NotebookPage', {
  params: { viewer: Schema.String },
  model: ({ params }) => ({
    notes: Data.query(Notes, {}, { select: NoteRow, first: NOTES_PAGE, live: true }),
    mine: Data.get(MemberCard, params.viewer),
  }),
})

/** One note, on its own page. */
export const NotePage = App.surface('NotePage', {
  params: { id: Schema.String },
  model: ({ params }) => ({ note: Data.get(NoteDetail, params.id) }),
})

// SITE

/** What a page's `access` reads of its reader. */
interface Reader {
  readonly signedIn: boolean
}

const SignInNode = Site.node(
  pipe(
    literal('sign-in'),
    query(Schema.Struct({ returnTo: Schema.OptionFromOptional(Schema.String) })),
    mapTo(AppRoute.SignIn),
  ),
  AppRoute.SignIn,
).title(() => 'Sign in · Notebook').node

const NotebookNode = Site.node(pipe(root, mapTo(AppRoute.Notebook)), AppRoute.Notebook)
  .title(() => 'Notebook')
  .surface({
    surface: NotebookPage,
    viewer: viewerOf,
    params: (_route, viewer) => ({ viewer }),
  })
  .access<Reader>({
    allow: reader => reader.signedIn,
    otherwise: requested => Site.target(SignInNode, { returnTo: Option.some(requested) }),
  }).node

const NoteNode = Site.node(
  pipe(literal('notes'), slash(string('id')), mapTo(AppRoute.NotePage)),
  AppRoute.NotePage,
)
  .title(() => 'A note · Notebook')
  .surface({ surface: NotePage, params: ({ id }) => ({ id }) }).node

// A note's page is under the notebook, so the notebook's rule covers it too.
export const AppSite = Site.make(SignInNode, Site.mount(NotebookNode, [NoteNode]))
export const routeOf = Site.parse(AppSite, AppRoute.NotFound)

export const notebookHref = Site.href(NotebookNode, {})
export const noteHref = (id: string) => Site.href(NoteNode, { id })

// PLACEMENTS

const Page = Bundle.parent({ Model, Message }).withServices<Services>()

export const NoteEditor = Editor.at({ data: Data, model: App.model.editor })
export const EditorForm = Page.at(Editing, { onOut: NoteEditor.onOut })

/**
 * A fresh id for a note about to be added, and the time it was: `update`
 * mints no id and reads no clock.
 */
const NameNote = Command.define('NameNote', {
  args: { title: Schema.String, body: Schema.String },
  messages: [Message.NamedNote],
  execute: ({ title, body }) =>
    Effect.map(Clock.currentTimeMillis, now =>
      Message.NamedNote({ id: crypto.randomUUID(), title, body, now }),
    ),
})

/** The form empties at once for the next note; the note shows as soon as it is named. */
const submittedNote = (model: Model, value: typeof NoteDraft.Type): Return => {
  const cleared = AddingForm.helpers.fill({ title: '', body: '' })(model)
  return { model: cleared.model, commands: [...(cleared.commands ?? []), NameNote(value)] }
}

export const AddingForm = Page.at(Adding, {
  onOut:
    ({ value }) =>
    model =>
      submittedNote(model, value),
})

/**
 * Every read the page makes: who the reader is on every page, each page's
 * Surface while its route is shown, and the editor's note. The
 * subscriptions, the Worker's render and the handover read the same.
 */
export const actives = {
  session: Surface.at(Session, undefined),
  ...Site.sources(AppSite, App.owner, App.model.route),
  editor: NoteEditor.active,
}

const Routing = Site.routing<Model, Message, AppRoute, Services>({
  site: AppSite,
  owner: App.owner,
  route: {
    dependency: ModelRef.focus(App.model.route).dependency,
    get: model => model.route,
    set: (model, route) => modifyFields(model, { route: () => route }),
  },
  parse: routeOf,
  tags: { clicked: 'ClickedLink', changed: 'ChangedUrl' },
  completed: Message.CompletedNavigation,
  // A note's page is read while the reader is still pointing at its link.
  preload: {
    links: pointedLinks(),
    intended: Message.PointedAtLink,
    read: there => Data.preload(there, actives),
  },
})

const placements = Page.assemble(
  AddingForm,
  EditorForm,
  Data.wiring(actives, { shared: ['MutationFailed'] }),
  Routing,
)

// COMMANDS

/** A whole page load: the Worker renders it as whoever the cookie now says. */
const Load = Command.define('Load', {
  args: { href: Schema.String },
  messages: [Message.CompletedNavigation],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedNavigation())),
})

const PushUrl = Command.define('PushUrl', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigation],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigation())),
})

/** Yielded's failures carry no sentence of their own; these are the page's. */
const authFailure = (reason: string) => () => Effect.succeed(Message.FailedAuth({ reason }))

const SignIn = Command.define('SignIn', {
  // Redacted: a Command's args are its span's attributes and DevTools' record.
  args: { email: Schema.String, password: Schema.Redacted(Schema.String), next: Schema.String },
  messages: [Message.CompletedNavigation, Message.FailedAuth],
  execute: ({ email, password, next }) =>
    Effect.gen(function* () {
      const { auth } = yield* Resource.get(AppClient)
      const completion = yield* auth.signIn({ email, password: Redacted.value(password) })
      return yield* Match.valueTags(completion, {
        Authenticated: () => load(next).pipe(Effect.as(Message.CompletedNavigation())),
        // A second factor: the accounts here have none.
        PendingAuthentication: authFailure('This account needs a second step.'),
      })
    }).pipe(
      Effect.catchTag('PasswordRejected', authFailure('That email and password do not match.')),
      Effect.catch(authFailure('Could not sign in. Try again.')),
    ),
})

const SignUp = Command.define('SignUp', {
  args: {
    name: Schema.String,
    email: Schema.String,
    password: Schema.Redacted(Schema.String),
    next: Schema.String,
  },
  messages: [Message.CompletedNavigation, Message.FailedAuth],
  execute: ({ name, email, password, next }) =>
    Effect.gen(function* () {
      const { auth } = yield* Resource.get(AppClient)
      // Answered alike for a new email and a taken one, so it says nothing of who has signed up.
      yield* auth.register({
        requestId: crypto.randomUUID(),
        email,
        newPassword: Redacted.value(password),
        registration: { name },
      })
      const completion = yield* auth.signIn({ email, password: Redacted.value(password) })
      return yield* Match.valueTags(completion, {
        Authenticated: () => load(next).pipe(Effect.as(Message.CompletedNavigation())),
        PendingAuthentication: authFailure('This account needs a second step.'),
      })
    }).pipe(
      Effect.catchTag(
        'NewPasswordRejected',
        authFailure('Choose another password: at least 15 characters, and not a common one.'),
      ),
      // The email was taken, by someone with another password.
      Effect.catchTag('PasswordRejected', authFailure('That email already has an account.')),
      Effect.catch(authFailure('Could not sign up. Try again.')),
    ),
})

const SignOut = Command.define('SignOut', {
  messages: [Message.CompletedNavigation, Message.FailedAuth],
  execute: Effect.gen(function* () {
    const { auth } = yield* Resource.get(AppClient)
    yield* auth.signOut()
    return yield* load('/sign-in').pipe(Effect.as(Message.CompletedNavigation()))
  }).pipe(Effect.catch(authFailure('Could not sign out. Try again.'))),
})

// UPDATE

/** Stands for this page's origin, which `update` does not know: only whether a URL leaves it matters. */
const HERE = 'http://here.invalid'

/**
 * `url` as a path on this origin, as a URL parser reads it, or none. Anyone
 * can write `returnTo` into an address, and a parser reads `//` or `\` as
 * another host, and `javascript:` as no host at all: only the parse can tell.
 */
const ownPath = (url: string): Option.Option<string> => {
  if (!URL.canParse(url, HERE)) return Option.none()
  const parsed = new URL(url, HERE)
  return parsed.origin === HERE
    ? Option.some(`${parsed.pathname}${parsed.search}${parsed.hash}`)
    : Option.none()
}

/** Where a sign-in goes on to: the page that sent the visitor here, or the notebook. */
const nextOf = (route: AppRoute): string =>
  AppRoute.matchOrElse(
    route,
    {
      SignIn: ({ returnTo }) =>
        Option.getOrElse(Option.flatMap(returnTo, ownPath), () => notebookHref),
    },
    () => notebookHref,
  )

const submitted = (model: Model): Return => {
  const password = Redacted.make(model.password)
  const next = nextOf(model.route)
  const command =
    model.mode === 'signUp'
      ? SignUp({ name: model.name, email: model.email, password, next })
      : SignIn({ email: model.email, password, next })
  return { model: modifyFields(model, { notice: () => Option.none() }), commands: [command] }
}

/**
 * A named draft, added. Remote shows it at once from the declarations: the
 * reader as its author and the time it was added, both set by the context,
 * its place in the notebook by the list's order, and its author's count.
 */
const added = (model: Model, { id, title, body, now }: typeof Message.NamedNote.Type): Return => {
  const sent = Data.mutate(model, AddNote, { id, title, body }, { now })
  return { model: sent.model, commands: [sent.command] }
}

const reduce = (model: Model, message: typeof Heard.Type): Return =>
  Heard.match<Return>(message, {
    SwitchedMode: ({ mode }) => ({
      model: modifyFields(model, { mode: () => mode, notice: () => Option.none() }),
    }),
    ChangedName: ({ value }) => ({ model: modifyFields(model, { name: () => value }) }),
    ChangedEmail: ({ value }) => ({ model: modifyFields(model, { email: () => value }) }),
    ChangedPassword: ({ value }) => ({ model: modifyFields(model, { password: () => value }) }),
    ToggledPassword: () => ({ model: modifyFields(model, { passwordShown: shown => !shown }) }),
    SubmittedAuth: () => submitted(model),
    FailedAuth: ({ reason }) => ({
      model: modifyFields(model, { notice: () => Option.some(reason) }),
    }),
    ClickedSignOut: () => ({ model, commands: [SignOut()] }),
    NamedNote: named => added(model, named),
    ClickedEdit: ({ id }) => EditorForm.helpers.open(id)(model),
    ClickedDelete: ({ id }) => {
      const sent = Data.mutate(model, DeleteNote, { id })
      const closed = EditorForm.helpers.close()(sent.model)
      return {
        model: closed.model,
        commands: [sent.command, ...(closed.commands ?? []), PushUrl({ url: notebookHref })],
      }
    },
    ClickedDismiss: ({ requestId }) => ({ model: Data.dismiss(model, requestId) }),
    ClickedRetry: ({ requestId }) =>
      Option.match(Data.retry(model, requestId), {
        onNone: () => ({ model }),
        onSome: sent => ({ model: sent.model, commands: [sent.command] }),
      }),
    // A refused note has left the list with its layer. The ledger keeps the
    // failure (`Data.failedWrites`), which the view draws.
    MutationFailed: () => ({ model }),
    // Site.routing's: it claims them and has set the route by now.
    ClickedLink: () => ({ model }),
    ChangedUrl: () => ({ model }),
    PointedAtLink: () => ({ model }),
    CompletedNavigation: () => ({ model }),
  })

/** The reader, once `Me` is answered; a read that failed shows no one signed in. */
const readerOf = (model: Model): Option.Option<Reader> =>
  RemoteData.match(Surface.read(Session, model).me, {
    Initial: () => Option.none(),
    Loading: () => Option.none(),
    Ready: me => Option.some(me),
    Refreshing: me => Option.some(me),
    Failed: () => Option.some({ signedIn: false }),
    NotFound: () => Option.some({ signedIn: false }),
  })

/** Whether the reader may be shown the page the Model is on: `update` and the Worker's 303 both ask. */
export const accessOf = (model: Model): Access =>
  AppRoute.match(model.route, {
    // A member has nothing to do on the sign-in page: on to the notebook. The
    // tree cannot say so, since the notebook's own rule names this page.
    SignIn: () =>
      Option.match(readerOf(model), {
        onNone: () => Access.Pending(),
        onSome: reader =>
          reader.signedIn ? Access.Denied({ url: notebookHref }) : Access.Allowed(),
      }),
    Notebook: route => Site.accessOf(AppSite, route, readerOf(model)),
    NotePage: route => Site.accessOf(AppSite, route, readerOf(model)),
    NotFound: () => Access.Allowed(),
  })

const deniedUrl = (model: Model): Option.Option<string> =>
  Access.match(accessOf(model), {
    Allowed: () => Option.none(),
    Pending: () => Option.none(),
    Denied: ({ url }) => Option.some(url),
  })

/** Sends the reader away once the page refuses them, on whichever Message made it so, once. */
const guarded = (before: Model, returned: Return): Return =>
  Option.match(deniedUrl(returned.model), {
    onNone: () => returned,
    onSome: url =>
      Option.contains(deniedUrl(before), url)
        ? returned
        : { ...returned, commands: [...(returned.commands ?? []), Load({ href: url })] },
  })

const routed = NoteEditor.after(placements.update(reduce))

export const update = (model: Model, message: Message): Return =>
  guarded(model, routed(model, message))

export const initial: Model = placements.initial({
  remote: Remote.initial,
  route: AppRoute.NotFound({ path: '/' }),
  mode: 'signIn',
  name: '',
  email: '',
  password: '',
  passwordShown: false,
  notice: Option.none(),
}).model

/** The page at an address, before anything is read. */
export const unreadAt = (url: Url): Model => modifyFields(initial, { route: () => routeOf(url) })

export const subscriptions = placements.subscriptions()

/**
 * What the Worker draws and how it is handed to the browser: the route
 * crosses as it is, and Remote sends what `actives` read, so the browser
 * asks for none of it again. The forms start empty on both sides.
 */
export const plan = SSR.plan(
  { owner: App.owner, Message, initial },
  {
    id: 'notebook',
    state: Projection.pick(App.model.route),
    surfaces: Object.values(actives),
    parts: [Remote.resume(Data)],
  },
)
