/**
 * The client: where the page is (`AppSite`), who the server says this tab is
 * (`Me`), the sign-in form, and the notes it may read. Yielded's client signs
 * in and out; Remote reads; this `update` is the one place a change of
 * principal is handled, whichever tab caused it, and the one place a page
 * that refuses its reader sends them away.
 *
 * The session never lands in the Model. The cookie is Yielded's, and what
 * the page knows of who it is, is the `Me` row the server answered.
 */
import type * as Client from '@yielded/auth/Client'
import { Context, Effect, Match, Option, Redacted, Schema, Stream, pipe } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, replaceUrl } from 'foldkit/navigation'
import { defineRouteUnion, literal, mapTo, query, root } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Url } from 'foldkit/url'
import { SUBJECT_CHANGED, believing } from 'foldkit-auth'
import { Bundle, Resource } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { ME } from 'foldkit-guard'
import { BroadcastMessage, broadcastMessages, postBroadcast } from 'foldkit-primitives/net'
import { Remote, RemoteData, type RemoteClient, type RemoteError } from 'foldkit-remote'
import { Access, Site } from 'foldkit-site'
import { SSR } from 'foldkit-ssr/client'
import { ModelRef, Projection, Surface } from 'foldkit-surface'
import type { AuthApi } from './authApi.js'
import { Me, Note, Notes, served } from './domain.js'

/**
 * Yielded's client, as the sign-in and sign-out Commands read it. Its code
 * is a chunk of its own (`authClient.ts`), which `client.ts` loads when it
 * is first asked for: this module names only its type, so a reader who
 * neither signs in nor out downloads none of it.
 */
export class AppClient extends Context.Service<
  AppClient,
  { readonly auth: Client.AuthClient<typeof AuthApi.actions> }
>()('example/Auth/AppClient') {}

/**
 * The `fetch` Remote's transport goes through: it repeats whom the server
 * last answered as, so once the cookie means someone else (another tab
 * signed in) a read is refused rather than answered as them.
 */
export const belief = believing()

/** The channel every tab of this application hears a change of principal on. */
export const PRINCIPAL_CHANNEL = 'foldkit-example-auth/principal'

/**
 * This tab, as its posts name it. A post opens a channel of its own, so this
 * tab's `principal` Subscription hears it as any other tab does: the id
 * tells its own change, which it has already handled, from another's.
 */
export const TAB = crypto.randomUUID()

export const AppRoute = defineRouteUnion({
  /**
   * Who you are, and the sign-in form. `returnTo` is the page that sent a
   * visitor here, where a sign-in goes on to. It is `null` on the wire, as
   * the route crosses from the server in the page.
   */
  Home: { returnTo: Schema.OptionFromNullOr(Schema.String) },
  /** The notes this reader may read. */
  Notes: {},
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

export const Model = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
  /** Whether the password field shows what is typed, at the reader's asking. */
  passwordShown: Schema.Boolean,
  /** What the last sign-in, sign-out or broadcast said went wrong, until the next try. */
  notice: Schema.Option(Schema.String),
  route: AppRoute,
  remote: Remote.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedEmail: { value: Schema.String },
  ChangedPassword: { value: Schema.String },
  ToggledPassword: {},
  SubmittedSignIn: {},
  SucceededSignIn: {},
  FailedSignIn: { reason: Schema.String },
  ClickedSignOut: {},
  SucceededSignOut: {},
  FailedSignOut: { reason: Schema.String },
  /** This tab's post, or another tab's, on `PRINCIPAL_CHANNEL`. */
  GotBroadcastMessage: { message: BroadcastMessage },
  GotRemoteMessage: { message: Remote.Message },
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigation: {},
  /** Another tab changed who this browser is, and this tab's `belief` has let go. */
  ForgotBelief: {},
})
export type Message = typeof Message.Type

/** What a Command or Subscription here needs from the runtime's `resources`. */
export type Services = RemoteClient | Resource.Lazy<AppClient>

export const initial: Model = {
  email: '',
  password: '',
  passwordShown: false,
  notice: Option.none(),
  route: AppRoute.Home({ returnTo: Option.none() }),
  remote: Remote.initial,
}

const App = Surface.application({ Model, Message })
export const Data = Remote.make({
  model: App.model.remote,
  ...served,
  // Off in a build; `tsx` has no `import.meta.env`.
  verifyPredictions: import.meta.env?.DEV === true,
})

const MeRow = Entity.select(Me, { signedIn: true, key: true, may: true })
const NoteRow = Entity.select(Note, { title: true, authorId: true })

/** Who the page is signed in as, as the server answered. */
export const Session = App.surface('Session', { model: () => ({ me: Data.get(MeRow, ME) }) })

/** The notes the server lets this principal read. */
export const NoteList = App.surface('NoteList', {
  model: () => ({ notes: Data.query(Notes, {}, { select: NoteRow }) }),
})

/** What a page's `access` reads of its reader. */
interface Reader {
  readonly signedIn: boolean
}

const HomeNode = Site.route(
  pipe(
    root,
    query(Schema.Struct({ returnTo: Schema.OptionFromOptional(Schema.String) })),
    mapTo(AppRoute.Home),
  ),
  AppRoute.Home,
  { title: () => 'Notes, by who is signed in' },
)

const NotesNode = Site.node(pipe(literal('notes'), mapTo(AppRoute.Notes)), AppRoute.Notes)
  .title(() => 'Your notes')
  .surface({ surface: NoteList, params: () => undefined })
  // Presentation only: the server answers a visitor's read of the notes with none.
  .access<Reader>({
    allow: reader => reader.signedIn,
    otherwise: requested => Site.target(HomeNode, { returnTo: Option.some(requested) }),
  }).node

export const AppSite = Site.make(HomeNode, NotesNode)
export const routeOf = Site.parse(AppSite, AppRoute.NotFound)

/** A link to the home page, as a visitor who was sent nowhere reaches it. */
export const homeHref = Site.href(HomeNode, { returnTo: Option.none() })
export const notesHref = Site.href(NotesNode, {})

/**
 * Every read the page may make: `Me` on every page, the notes on theirs.
 * The subscriptions, the server's render and the handover read the same.
 */
export const actives = {
  session: Surface.at(Session, undefined),
  ...Site.sources(AppSite, App.owner, App.model.route),
}

const nobody: Reader = { signedIn: false }

/**
 * The reader, once `Me` is answered. A read the server refused (a session
 * that ended) or could not answer shows no one signed in: the page says why,
 * beside the sign-in form, rather than waiting on a read that is over.
 */
const readerOf = (model: Model): Option.Option<Reader> =>
  RemoteData.match(Surface.read(Session, model).me, {
    Initial: () => Option.none(),
    Loading: () => Option.none(),
    Ready: me => Option.some(me),
    Refreshing: me => Option.some(me),
    Failed: () => Option.some(nobody),
    NotFound: () => Option.some(nobody),
  })

/**
 * Whether the reader may be shown the page the Model is on. `update` and the
 * host's 303 both ask this, so the browser and the server cannot disagree.
 */
export const accessOf = (model: Model): Access =>
  AppRoute.matchOrElse(
    model.route,
    // No page is there to refuse anyone; the tree holds no node for it.
    { NotFound: () => Access.Allowed() },
    route => Site.accessOf(AppSite, route, readerOf(model)),
  )

/**
 * What the page draws and how it is handed to the browser: the route crosses
 * as it is, and Remote sends what `actives` read, so the browser asks for
 * none of it again. The form and the notice start empty on both sides.
 */
export const plan = SSR.plan(
  { owner: App.owner, Message, initial },
  {
    id: 'auth',
    state: Projection.pick(App.model.route),
    surfaces: Object.values(actives),
    parts: [Remote.resume(Data)],
  },
)

const SignIn = Command.define('SignIn', {
  // Redacted: a Command's args are its span's attributes and DevTools' record.
  args: { email: Schema.String, password: Schema.Redacted(Schema.String) },
  messages: [Message.SucceededSignIn, Message.FailedSignIn],
  execute: ({ email, password }) =>
    Effect.gen(function* () {
      const { auth } = yield* Resource.get(AppClient)
      const completion = yield* auth.signIn({ email, password: Redacted.value(password) })
      return Match.valueTags(completion, {
        Authenticated: () => {
          // Before `update` forgets and reads again: the reads after are the new principal's.
          belief.forget()
          return Message.SucceededSignIn()
        },
        // A second factor: the accounts here have none, so this is another setup's.
        PendingAuthentication: () =>
          Message.FailedSignIn({ reason: 'This account needs a second step.' }),
      })
    }).pipe(
      Effect.catchTag('PasswordRejected', () =>
        Effect.succeed(Message.FailedSignIn({ reason: 'That email and password do not match.' })),
      ),
      // Yielded's other failures carry no sentence of their own (an empty `message`).
      Effect.catch(() =>
        Effect.succeed(Message.FailedSignIn({ reason: 'Could not sign in. Try again.' })),
      ),
    ),
})

const SignOut = Command.define('SignOut', {
  messages: [Message.SucceededSignOut, Message.FailedSignOut],
  execute: Effect.gen(function* () {
    const { auth } = yield* Resource.get(AppClient)
    yield* auth.signOut()
    belief.forget()
    return Message.SucceededSignOut()
  }).pipe(
    Effect.catch(() =>
      Effect.succeed(Message.FailedSignOut({ reason: 'Could not sign out. Try again.' })),
    ),
  ),
})

/**
 * Lets go of whom the server last answered as, before `update` reads again:
 * a read sent with the old belief would be refused once more.
 */
const ForgetBelief = Command.define('ForgetBelief', {
  messages: [Message.ForgotBelief],
  execute: Effect.sync(() => {
    belief.forget()
    return Message.ForgotBelief()
  }),
})

/** The address, replaced: Back then skips the page that sent the reader on. */
const ReplaceUrl = Command.define('ReplaceUrl', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigation],
  execute: ({ url }) => replaceUrl(url).pipe(Effect.as(Message.CompletedNavigation())),
})

/** Tells the other tabs, naming this one, which hears its own post too. */
const announce = () =>
  Command.mapMessage(postBroadcast(PRINCIPAL_CHANNEL, TAB), message =>
    Message.GotBroadcastMessage({ message }),
  )

const noticed = (model: Model, notice: string) =>
  modifyFields(model, { notice: () => Option.some(notice) })

/**
 * This tab changed who it is: the password is spent, and everything Remote
 * holds was read as the old principal. `forget` drops it, and every active
 * read (`Me` among them) asks again as the new one.
 */
const changedHere = (model: Model): Update.Return<Model, Message, Services> => ({
  model: Data.forget(
    modifyFields(model, {
      password: () => '',
      passwordShown: () => false,
      notice: () => Option.none(),
    }),
  ),
  commands: [announce()],
})

/** Stands for this page's origin, which `update` does not know: only whether a URL leaves it matters. */
const HERE = 'http://here.invalid'

/**
 * `url` as a path on this origin, as a URL parser reads it, or none. Anyone
 * can write `returnTo` into an address, and a parser drops tabs and line
 * breaks and reads `//` or `\` as another host, so `/\t/evil.com` is
 * `http://evil.com/`: only the parse can tell.
 */
const ownPath = (url: string): Option.Option<string> => {
  if (!url.startsWith('/') || !URL.canParse(url, HERE)) return Option.none()
  const parsed = new URL(url, HERE)
  return parsed.origin === HERE
    ? Option.some(`${parsed.pathname}${parsed.search}${parsed.hash}`)
    : Option.none()
}

/** Where a sign-in goes on to: the page that sent the visitor here, if any. */
const returning = (route: AppRoute) =>
  AppRoute.match(route, {
    Home: ({ returnTo }) =>
      Option.toArray(Option.map(Option.flatMap(returnTo, ownPath), url => ReplaceUrl({ url }))),
    Notes: () => [],
    NotFound: () => [],
  })

const Routing = Site.routing<Model, Message, AppRoute>({
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
})

const assembly = Bundle.assemble<Model, Message, Services>()([Routing])

const routed = assembly.update((model, message) =>
  Message.match<Update.Return<Model, Message, Services>>(message, {
    ChangedEmail: ({ value }) => ({ model: modifyFields(model, { email: () => value }) }),
    ChangedPassword: ({ value }) => ({ model: modifyFields(model, { password: () => value }) }),
    ToggledPassword: () => ({
      model: modifyFields(model, { passwordShown: shown => !shown }),
    }),
    SubmittedSignIn: () => ({
      model,
      commands: [SignIn({ email: model.email, password: Redacted.make(model.password) })],
    }),
    SucceededSignIn: () => {
      const changed = changedHere(model)
      return { ...changed, commands: [...(changed.commands ?? []), ...returning(model.route)] }
    },
    FailedSignIn: ({ reason }) => ({ model: noticed(model, reason) }),
    ClickedSignOut: () => ({ model, commands: [SignOut()] }),
    SucceededSignOut: () => changedHere(model),
    // The server may have signed out though its answer was lost: ask `Me` again.
    FailedSignOut: ({ reason }) => ({ model: Data.forget(noticed(model, reason)) }),
    GotBroadcastMessage: ({ message }) =>
      BroadcastMessage.match(message, {
        // Another tab changed who this browser is: what this one typed stays.
        Received: ({ data }) => (data === TAB ? { model } : { model, commands: [ForgetBelief()] }),
        Posted: () => ({ model }),
        BroadcastFailed: ({ message }) => ({
          model: noticed(model, `Other tabs were not told: ${message}`),
        }),
      }),
    GotRemoteMessage: ({ message }) =>
      changedElsewhere(message) ? { model: Data.forget(model) } : foldData(model, message),
    // Site.routing's: it claims the click and has set the route by now.
    ClickedLink: () => ({ model }),
    ChangedUrl: () => ({ model }),
    CompletedNavigation: () => ({ model }),
    // What this tab typed stays; what Remote read was the old principal's.
    ForgotBelief: () => ({ model: Data.forget(model) }),
  }),
)

const deniedUrl = (model: Model): Option.Option<string> =>
  Access.match(accessOf(model), {
    Allowed: () => Option.none(),
    Pending: () => Option.none(),
    Denied: ({ url }) => Option.some(url),
  })

/**
 * Sends the reader away once the page refuses them, on whichever Message
 * made it so: a new route, or `Me` answered. Until the replaced address
 * arrives, the Messages between are refused for the same page and send
 * nothing more.
 */
const guarded = (
  before: Model,
  returned: Update.Return<Model, Message, Services>,
): Update.Return<Model, Message, Services> =>
  Option.match(deniedUrl(returned.model), {
    onNone: () => returned,
    onSome: url =>
      Option.contains(deniedUrl(before), url)
        ? returned
        : { ...returned, commands: [...(returned.commands ?? []), ReplaceUrl({ url })] },
  })

export const update = (model: Model, message: Message): Update.Return<Model, Message, Services> =>
  guarded(model, routed(model, message))

/** The page at an address, before anything is read. */
export const unreadAt = (url: Url): Model => modifyFields(initial, { route: () => routeOf(url) })

/** Where a page starts without a server render; the server's reads `unreadAt` first. */
export const init = (url: Url): Update.Return<Model, Message, Services> => ({
  model: unreadAt(url),
})

const isSubjectChanged = (error: RemoteError): boolean =>
  Option.exists(RemoteData.denied(error), refusal =>
    Option.contains(refusal.reason, SUBJECT_CHANGED),
  )

/**
 * A read refused because who is signed in changed since this tab last heard:
 * what Remote holds is the old principal's, and `belief` has already let go
 * of it, so forgetting reads everything again as whoever is signed in now.
 */
const changedElsewhere = Match.type<typeof Remote.Message.Type>().pipe(
  Match.tags({
    ReadFailed: ({ error }) => isSubjectChanged(error),
    QueryFailed: ({ error }) => isSubjectChanged(error),
  }),
  Match.orElse(() => false),
)

const foldData = Remote.fold(Data, message => Message.GotRemoteMessage({ message }))

export const subscriptions = Subscription.make<Model, Message, Services>()(entry => ({
  ...foldData.subscriptions(actives),
  // Yielded's client starts loading once the reader types an email, so the
  // sign-in waits for no chunk. A sign-out loads it on the press.
  authClient: entry(
    { signingIn: Schema.Boolean },
    {
      modelToDependencies: model => ({ signingIn: model.email !== '' }),
      dependenciesToStream: ({ signingIn }) =>
        signingIn ? Stream.drain(Stream.fromEffect(Resource.prefetch(AppClient))) : Stream.empty,
    },
  ),
  principal: Subscription.persistentEntry(
    Stream.map(broadcastMessages(PRINCIPAL_CHANNEL), message =>
      Message.GotBroadcastMessage({ message }),
    ),
  ),
}))
