// @vitest-environment node
/**
 * What a caller learns when a guarded, Drizzle-backed server fails (#573):
 * "Internal error" and an incident. The driver's words, and a Read rule that
 * cannot be compiled for who asks, are in the report under that incident and
 * nowhere in the encoded answer; a rule's own explanation, written for the
 * reader, still arrives as written.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Diagnostics, Mutation, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['admin', 'member']) })
type User = typeof User.Type

const VaultFields = Entity.define(
  'Vault',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, label: Schema.String }),
)
const G = Guards.declare(
  'Vaults',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isOwner: guard.row(VaultFields, p => Expr.eq(VaultFields.fields.ownerId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const explained = 'Only an admin may delete a vault.'
const Vault = VaultFields.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.isAdmin],
      Update: [G.isOwner, G.isAdmin],
      Delete: Guards.on([G.isAdmin], Guards.explain(explained)),
    },
  }),
)
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

const vaults = sqliteTable('canary_vaults', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  label: text('label').notNull(),
})
const Db = bind(
  { Vault },
  { Vault: { table: vaults, visible: GuardDrizzle.visible(Policy, [Vault]).Vault } },
)

const Relabel = Mutation.write(
  'Relabel',
  Write.update(Entity.input(Vault, Schema.Struct({ id: Schema.String, label: Schema.String })), {
    id: 'id',
  }),
)
const Remove = Mutation.write(
  'RemoveVault',
  Write.delete(Entity.input(Vault, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

const guarded = GuardServer.writer(Vault, Policy, writer<Option.Option<User>>(Db.Vault))
const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [source(Db.Vault)],
  mutations: [RemoteServer.write(Relabel, guarded), RemoteServer.write(Remove, guarded)],
})

const ada = Option.some<User>({ id: 'ada', role: 'member' })
/** Text SQL cannot hold, so her own Read rule cannot be compiled. */
const nul = Option.some<User>({ id: `a${String.fromCharCode(0)}b`, role: 'member' })

type Ask = Parameters<typeof RemoteServer.answer>[1]
const read: Ask = {
  operation: 'read',
  payload: {
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Vault', id: 'v1', fields: ['label'] }],
  },
}
const mutate = (mutation: string, input: unknown): Ask => ({
  operation: 'mutate',
  payload: { requestId: 'r1', mutation, input },
})

const Incident = Schema.Struct({ incident: Schema.optional(Schema.String) })

const ask = async (who: Option.Option<User>, asked: Ask) => {
  const sqlite = new DatabaseSync(':memory:')
  // A CHECK the write below breaks, named so the driver's error quotes it.
  sqlite.exec(`
    create table canary_vaults (
      id text primary key, owner_id text not null, label text not null,
      constraint canary_secret_check check (length(label) < 5)
    );
    insert into canary_vaults values ('v1', 'ada', 'gold');
  `)
  const collected = Diagnostics.collect()
  try {
    const answered = await Effect.runPromise(
      RemoteServer.answer(RemoteServer.handlers(server, who), asked).pipe(
        Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
        Effect.provideService(Diagnostics.Reporter, collected.report),
      ),
    )
    return {
      status: answered.status,
      sent: JSON.stringify(answered),
      body: answered.body,
      incident: Schema.decodeUnknownSync(Incident)(answered.body).incident,
      defects: collected.reported.filter(report => report._tag === 'ServerDefect'),
    }
  } finally {
    sqlite.close()
  }
}

const internalError = {
  error: 'Internal error',
  incident: expect.stringMatching(/^[0-9a-f]{16}$/),
}

describe('a guarded server that fails on its own side', () => {
  it('answers a write the database refuses with nothing of the driver’s, and reports it', async () => {
    const failed = await ask(ada, mutate('Relabel', { id: 'v1', label: 'far too long' }))
    expect(failed.status).toBe(500)
    expect(failed.body).toStrictEqual(internalError)
    expect(failed.sent).not.toMatch(/canary|update |constraint|Database/i)
    expect(failed.defects).toEqual([
      expect.objectContaining({
        incident: failed.incident,
        during: 'mutate Relabel',
        message: expect.stringContaining('canary_secret_check'),
      }),
    ])
  })

  it('answers a Read rule it cannot compile for who asks with nothing of the rule, and reports it', async () => {
    const failed = await ask(nul, read)
    expect(failed.status).toBe(500)
    expect(failed.body).toStrictEqual(internalError)
    expect(failed.sent).not.toMatch(/isOwner|NUL|Read rule|foldkit/i)
    expect(failed.defects).toEqual([
      expect.objectContaining({
        incident: failed.incident,
        during: 'read Vault',
        message: expect.stringMatching(
          /Vault's Read rule could not be compiled to SQL[^]*NUL character/,
        ),
      }),
    ])
  })

  it('sends a rule’s explanation as its author wrote it, and reports nothing', async () => {
    const refused = await ask(ada, mutate('RemoveVault', { id: 'v1' }))
    expect(refused.status).toBe(403)
    expect(refused.sent).toContain(explained)
    expect(refused.sent).not.toContain('incident')
    expect(refused.defects).toEqual([])
  })
})
