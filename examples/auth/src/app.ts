/**
 * The client: a sign-in form, who the server says this tab is (`Me`), and the
 * notes it may read. Yielded's client signs in and out; Remote reads; this
 * `update` is the one place a change of principal is handled, whichever tab
 * caused it.
 *
 * The session never lands in the Model. The cookie is Yielded's, and what
 * the page knows of who it is, is the `Me` row the server answered.
 */
import * as Client from '@yielded/auth/Client'
import { Effect, Match, Option, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { SUBJECT_CHANGED, believing } from 'foldkit-auth'
import { Entity } from 'foldkit-entity'
import { ME } from 'foldkit-guard'
import { BroadcastMessage, broadcastMessages, postBroadcast } from 'foldkit-primitives/net'
import { Remote, RemoteData, type RemoteClient, type RemoteError } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { AuthApi, Me, Note, Notes, served } from './domain.js'

/**
 * Yielded's client, over `fetch` to this origin, which Vite proxies to the
 * server. A sign-in's cookie is set by the response, never read here.
 *
 * @internal Its type names Yielded's unexported modules (TS2742), as `AuthApi`'s does.
 */
export const AppClient = Client.make(AuthApi, { baseUrl: location.origin })

/**
 * The `fetch` Remote's transport goes through: it repeats whom the server
 * last answered as, so once the cookie means someone else (another tab
 * signed in) a read is refused rather than answered as them.
 */
export const belief = believing()

/** The channel every tab of this application hears a change of principal on. */
export const PRINCIPAL_CHANNEL = 'foldkit-example-auth/principal'

export const Model = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
  /** What the last sign-in, sign-out or broadcast said went wrong, until the next try. */
  notice: Schema.Option(Schema.String),
  remote: Remote.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ChangedEmail: { value: Schema.String },
  ChangedPassword: { value: Schema.String },
  SubmittedSignIn: {},
  SucceededSignIn: {},
  FailedSignIn: { reason: Schema.String },
  ClickedSignOut: {},
  SucceededSignOut: {},
  FailedSignOut: { reason: Schema.String },
  /** This tab's post, or another tab's, on `PRINCIPAL_CHANNEL`. */
  GotBroadcastMessage: { message: BroadcastMessage },
  GotRemoteMessage: { message: Remote.Message },
})
export type Message = typeof Message.Type

/**
 * `AppClient` as a service. An interface, so a declaration names it rather
 * than expanding Yielded's types, which it cannot name.
 */
export interface AuthClient extends Client.ClientService<'example/Auth', typeof AuthApi.actions> {}

/** What a Command or Subscription here needs from the runtime's `resources`. */
export type Services = RemoteClient | AuthClient

export const initial: Model = {
  email: '',
  password: '',
  notice: Option.none(),
  remote: Remote.initial,
}

const SignIn = Command.define('SignIn', {
  args: { email: Schema.String, password: Schema.String },
  messages: [Message.SucceededSignIn, Message.FailedSignIn],
  execute: ({ email, password }) =>
    Effect.gen(function* () {
      const { auth } = yield* AppClient
      const completion = yield* auth.signIn({ email, password })
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
      Effect.catch(error => Effect.succeed(Message.FailedSignIn({ reason: error.message }))),
    ),
})

const SignOut = Command.define('SignOut', {
  messages: [Message.SucceededSignOut, Message.FailedSignOut],
  execute: Effect.gen(function* () {
    const { auth } = yield* AppClient
    yield* auth.signOut()
    belief.forget()
    return Message.SucceededSignOut()
  }).pipe(Effect.catch(error => Effect.succeed(Message.FailedSignOut({ reason: error.message })))),
})

/** Tells the other tabs; by spec a tab does not hear its own post. */
const announce = () =>
  Command.mapMessage(postBroadcast(PRINCIPAL_CHANNEL, 'changed'), message =>
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
  model: Data.forget(modifyFields(model, { password: () => '', notice: () => Option.none() })),
  commands: [announce()],
})

// Annotated: `Data` is bound to `App`, which is built from `update`.
export function update(model: Model, message: Message): Update.Return<Model, Message, Services> {
  return Message.match(message, {
    ChangedEmail: ({ value }) => ({ model: modifyFields(model, { email: () => value }) }),
    ChangedPassword: ({ value }) => ({ model: modifyFields(model, { password: () => value }) }),
    SubmittedSignIn: () => ({
      model,
      commands: [SignIn({ email: model.email, password: model.password })],
    }),
    SucceededSignIn: () => changedHere(model),
    FailedSignIn: ({ reason }) => ({ model: noticed(model, reason) }),
    ClickedSignOut: () => ({ model, commands: [SignOut()] }),
    SucceededSignOut: () => changedHere(model),
    FailedSignOut: ({ reason }) => ({ model: noticed(model, reason) }),
    GotBroadcastMessage: ({ message }) =>
      BroadcastMessage.match(message, {
        // Another tab changed who this browser is: what this one typed stays.
        Received: () => ({ model: Data.forget(model) }),
        Posted: () => ({ model }),
        BroadcastFailed: ({ message }) => ({
          model: noticed(model, `Other tabs were not told: ${message}`),
        }),
      }),
    GotRemoteMessage: ({ message }) =>
      changedElsewhere(message) ? { model: Data.forget(model) } : foldData(model, message),
  })
}

const isSubjectChanged = (error: RemoteError): boolean =>
  Option.exists(RemoteData.refused(error), refusal =>
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

const App = Surface.application({ Model, Message, initial, update })
export const Data = Remote.make({ model: App.model.remote, ...served })
const foldData = Remote.fold(Data, message => Message.GotRemoteMessage({ message }))

const MeRow = Entity.select(Me, { key: true, may: true })
const NoteRow = Entity.select(Note, { title: true, authorId: true })

/** Who the page is signed in as, as the server answered. */
export const Session = App.surface('Session', { model: () => ({ me: Data.get(MeRow, ME) }) })

/** The notes the server lets this principal read. */
export const NoteList = App.surface('NoteList', {
  model: () => ({ notes: Data.query(Notes, {}, { select: NoteRow }) }),
})

export const subscriptions = Subscription.make<Model, Message, Services>()(() => ({
  // Both are always drawn, so both are always read.
  ...foldData.subscriptions({
    session: Surface.at(Session, undefined),
    notes: Surface.at(NoteList, undefined),
  }),
  principal: Subscription.persistent(
    Stream.map(broadcastMessages(PRINCIPAL_CHANNEL), message =>
      Message.GotBroadcastMessage({ message }),
    ),
  ),
}))
