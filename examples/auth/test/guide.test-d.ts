/**
 * Every TypeScript snippet of `docs/auth-and-guard.md`, as one module, so the
 * guide cannot drift from the API. What the guide leaves to the reader is
 * declared: Yielded's `Auth` service, its Layer, the user store and the
 * Remote server.
 */
import { Auth, AuthContract, Password, Sessions } from '@yielded/auth'
import { Context, Effect, Layer, Option, Schema } from 'effect'
import { AuthServer } from 'foldkit-auth/server'
import { Entity, Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import type { RemoteUnauthenticated } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'

const AppAuth = Auth.make(
  AuthContract.make('guide/Auth', {
    claims: Schema.Struct({}),
    actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
  }),
  {
    sessions: Sessions.stateful({ idleTimeout: '10 minutes', maxAge: '1 hour' }),
    strategies: { password: Password.make() },
    defaultStrategy: 'password',
  },
)
declare const AppAuthLive: Layer.Layer<Context.Service.Identifier<typeof AppAuth>>
const http = { origin: 'https://app.example' } as const

// ## The seam: one principal type

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
    isAdmin: guard.principal(),
    isAuthor: guard.row(NoteFields, p => Expr.eq(NoteFields.fields.authorId, p.id)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

export const Note = NoteFields.pipe(Guards.attach(G, { row: { Read: [G.isAuthor, G.isAdmin] } }))

declare const Users: { readonly find: (id: string) => Effect.Effect<User, RemoteUnauthenticated> }
const server = RemoteServer.make<Option.Option<User>>({ entities: [] })

// Guard: the principal guards' bodies, server only.
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

// Auth: who a session is, looked up per request, never taken from its claims.
const principal = (session: { readonly subjectId: string }) => Users.find(session.subjectId)

const resolving = { auth: AppAuth, http, principal, key: Policy.key }

export const remote = serveFetch({
  server, // built with GuardServer.memory / GuardDrizzle, checked by GuardServer.validate
  resolvePrincipal: AuthServer.resolver(resolving), // auth: request -> Option<User>
  headers: AuthServer.answered(resolving),
  layer: () => AppAuthLive,
})
