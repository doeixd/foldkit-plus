/**
 * What the browser and the server share: who a principal is, who may read a
 * note, the `Me` row, the query the page lists, and Yielded's contract. All
 * of it is data and Schemas, so the browser bundle takes it whole.
 */
import * as AuthContract from '@yielded/auth/AuthContract'
import { Schema } from 'effect'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Guards, Interaction } from 'foldkit-guard'
import { Query, Remote } from 'foldkit-remote'

/** The principal the guards read: built per request from the session's subject. */
export const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
})
export type User = typeof User.Type

const NoteFields = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, authorId: Schema.String, title: Schema.String }),
)

export const G = Guards.declare(
  'Notes',
  User,
  guard => ({
    // Its body is the server's alone (`server.ts`): the browser never runs it.
    isAdmin: guard.principal(),
    isAuthor: guard.row(NoteFields, p => Expr.eq(NoteFields.fields.authorId, p.id)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

/** A note is read by its author and by an admin; nobody writes one here. */
export const Note = NoteFields.pipe(Guards.attach(G, { row: { Read: [G.isAuthor, G.isAdmin] } }))

export const OpenAdmin = Interaction.make('OpenAdmin')

/** Who the client is, as the server answered: one row, read like any other. */
export const Me = Guards.me(G, { interactions: { [OpenAdmin.key]: [G.isAdmin] } })

/** Every note the asker may read: the guard narrows the rows, not the body. */
export const Notes = Query.define('Notes', {}, () =>
  Query.from(Note).pipe(Query.orderBy(Order.asc(Note.fields.id))),
)

/** What Remote serves, named once for the client's `Remote.make` and the server's checks. */
export const served = { entities: [Note, Me], queries: [Notes] } as const
export const Domain = Remote.define(served)

/**
 * Yielded's contract: password sign-in, plus the session actions every
 * contract has (`signOut` among them). The claims are empty on purpose: a
 * claim is a snapshot from sign-in, and the principal is read fresh per
 * request instead.
 *
 * @internal Its type names modules `@yielded/auth` does not export, so a
 * declaration file cannot (TS2742); `stripInternal` leaves it out of this
 * example's declarations, which nothing reads.
 */
export const AuthApi = AuthContract.make('example/Auth', {
  claims: Schema.Struct({}),
  actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
})
