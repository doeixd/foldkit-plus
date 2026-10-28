/**
 * What the browser and the server share: who a principal is, who may read a
 * note, the `Me` row and the query the page lists. All of it is data and
 * Schemas, so the browser bundle takes it whole. Yielded's contract is in
 * `authApi.ts`, which only the client's chunk and the server read.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Guards, Interaction } from 'foldkit-guard'
import { Query, Remote } from 'foldkit-remote'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { Sync, documentId } from 'foldkit-sync'

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

const Pin = Schema.Struct({ id: Schema.String, text: Schema.NonEmptyString })
const BoardModel = Schema.Struct({ pins: Schema.Array(Pin) })
type BoardModel = typeof BoardModel.Type

/** What a signed-in reader may do to the board: pin a line. */
export const BoardMessage = defineMessageUnion({
  Pinned: { id: Schema.String, text: Schema.NonEmptyString },
})
export type BoardMessage = typeof BoardMessage.Type

const Board = Surface.application({
  Model: BoardModel,
  Message: BoardMessage,
  initial: { pins: [] },
  update: (model: BoardModel, message: BoardMessage): Update.Return<BoardModel, BoardMessage> =>
    BoardMessage.match<Update.Return<BoardModel, BoardMessage>>(message, {
      Pinned: ({ id, text }) => ({ model: { pins: [...model.pins, { id, text }] } }),
    }),
})

/**
 * A board every signed-in reader shares, through Sync: a replica writes
 * pins offline, and the server orders them. Its socket is opened with the
 * session cookie, as Remote's reads are (`server.ts`, `http.ts`).
 */
export const PinBoard: Sync<BoardMessage, BoardModel> = Sync.forApplication(Board).make({
  documentId: documentId('board'),
  shared: Projection.pick(Board.model.pins),
  durable: MessageSet.make(Board, [BoardMessage.Pinned]),
})
