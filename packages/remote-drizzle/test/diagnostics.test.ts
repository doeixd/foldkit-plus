// @vitest-environment node
/**
 * What a Drizzle-backed server reports instead of saying: a statement the
 * driver failed, answered with a fixed message, and the rules no CHECK holds,
 * once per binding, on its first write.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Write } from 'foldkit-entity'
import { Diagnostics, Mutation } from 'foldkit-remote'
import { RemoteServer, type EntityWriter } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

const notes = sqliteTable('notes', { id: text('id').primaryKey(), title: text('title').notNull() })

/** An Entity over `notes` whose title is held by `rule`. */
const noteOver = (title: Schema.Top) => {
  const Note = Entity.define('Note', Schema.Struct({ id: Schema.String, title }))
  return bind({ Note }, { Note: { table: notes } }).Note
}

/** A database holding `schema`, and one collector the writes report to. */
const opened = (schema: string) => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  const collected = Diagnostics.collect()
  const run = <A, E>(effect: Effect.Effect<A, E, DrizzleDatabase>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.result,
        Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
        Effect.provideService(Diagnostics.Reporter, collected.report),
      ),
    )
  return { run, reported: collected.reported }
}

const remove = (written: EntityWriter<unknown, DrizzleDatabase>, id: string) =>
  written.delete({ id, expect: Option.none(), when: Option.none(), principal: undefined })

const withNotes = 'create table notes (id text primary key, title text not null)'

describe('ServerOnlyRules', () => {
  it('reports the rules no CHECK holds, once per binding, on its first write', async () => {
    const binding = noteOver(Schema.String.check(Schema.isTrimmed()))
    const { run, reported } = opened(withNotes)

    expect(await run(remove(writer(binding), 'a'))).toMatchObject({ _tag: 'Success' })
    await run(remove(writer(binding), 'b'))

    expect(reported).toEqual([
      expect.objectContaining({
        _tag: 'ServerOnlyRules',
        source: 'foldkit-remote-drizzle',
        level: 'warning',
        entity: 'Note',
        table: 'notes',
        rules: [expect.stringMatching(/^Note\.title: /)],
      }),
    ])
    expect(reported[0]!.message).toContain('Note.title: ')
  })

  it('reports nothing when a CHECK can hold every rule', async () => {
    const binding = noteOver(Schema.String.check(Schema.isMaxCodePoints(10)))
    const { run, reported } = opened(withNotes)

    await run(remove(writer(binding), 'a'))

    expect(reported).toEqual([])
  })
})

describe('StatementFailed', () => {
  it("reports the driver's error, which the answer leaves out", async () => {
    const binding = noteOver(Schema.String)
    const { run, reported } = opened('create table other (id text)')

    expect(await run(remove(writer(binding), 'a'))).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'RemoteServerError', message: 'Database write failed' },
    })
    expect(reported).toEqual([
      expect.objectContaining({
        _tag: 'StatementFailed',
        level: 'error',
        failed: 'Database write failed',
      }),
    ])
    // The driver's error names the statement, which the caller never sees.
    expect(reported[0]!.message).toMatch(/^Database write failed, .*delete from "notes"/s)
  })

  it('reports a ledgered write the driver failed', async () => {
    const Item = Entity.define(
      'Item',
      Schema.Struct({ id: Schema.String, stock: Schema.Int, revision: Schema.Number }),
    )
    const items = sqliteTable('items', {
      id: text('id').primaryKey(),
      stock: integer('stock').notNull(),
      revision: integer('revision').notNull(),
    })
    const ledger = sqliteTable(
      'write_ledger',
      {
        scope: text('scope').notNull(),
        operation: text('operation').notNull(),
        target: text('target').notNull(),
        answer: text('answer').notNull(),
        at: integer('at').notNull(),
        request: text('request'),
      },
      table => [primaryKey({ columns: [table.scope, table.operation, table.target] })],
    )
    const Restock = Mutation.write(
      'Restock',
      Write.update(
        Entity.input(Item, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
          quantity: Entity.unmapped,
        }),
        { id: 'id', increment: { stock: 'quantity' } },
      ),
    )
    const server = RemoteServer.make<string, DrizzleDatabase>({
      entities: [],
      mutations: [
        RemoteServer.write(
          Restock,
          writer<string>(bind({ Item }, { Item: { table: items } }).Item, {
            ledger: { table: ledger, scope: principal => principal },
          }),
        ),
      ],
    })
    // The ledger's table is missing, so its transaction fails.
    const { run, reported } = opened(
      "create table items (id text primary key, stock integer not null, revision integer not null); insert into items values ('i1', 10, 1)",
    )

    expect(
      await run(
        RemoteServer.handlers(server, 'ada').FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Restock',
          input: { id: 'i1', quantity: 5 },
          operation: 'op-a',
        }),
      ),
    ).toMatchObject({ _tag: 'Failure', failure: { message: 'Database write failed' } })
    // Item.stock's integer is a rule no CHECK holds, reported beside it.
    const failed = reported.filter(diagnostic => diagnostic._tag === 'StatementFailed')
    expect(failed).toEqual([
      expect.objectContaining({ failed: 'Database write failed', level: 'error' }),
    ])
    expect(failed[0]!.message).toContain('"write_ledger"')
  })
})
