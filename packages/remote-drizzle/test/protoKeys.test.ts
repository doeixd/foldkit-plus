// @vitest-environment node
/**
 * Members named as `Object.prototype`'s keys. `bind` looks each member up in
 * the application's storage by its own keys, so a field `constructor` finds
 * its column, not `Object`; one with no column is refused as any other. A
 * member `__proto__` is refused where it is bound, since Drizzle builds each
 * row it reads by assignment, which would set the row's prototype.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Entity, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, source, writer } from '../src/index.js'

const Shape = Schema.Struct({ id: Schema.String, constructor: Schema.String })
const Odd = Entity.define('Odd', Shape)
const odd = sqliteTable('odd', {
  id: text('id').primaryKey(),
  constructor: text('ctor').notNull(),
})
const Edit = Mutation.write('Edit', Write.update(Entity.input(Odd, Shape), { id: 'id' }))

const open = () => {
  const client = new DatabaseSync(':memory:')
  client.exec(
    "create table odd (id text primary key, ctor text not null); insert into odd values ('o', 'c1')",
  )
  return { client, layer: databaseLayer(drizzle({ client })) }
}

describe('a member named as an Object.prototype key', () => {
  it('is bound by the column of its own name, read, written and answered', async () => {
    const Db = bind({ Odd }, { Odd: { table: odd } })
    const { client, layer } = open()
    const records = await Effect.runPromise(
      source(Db.Odd)
        .read({ ids: ['o'], fields: ['constructor'], principal: undefined })
        .pipe(Effect.provide(layer)),
    )
    expect(records).toEqual([{ id: 'o', values: { id: 'o', constructor: 'c1' } }])
    const server = RemoteServer.make({
      entities: [source(Db.Odd)],
      mutations: [RemoteServer.write(Edit, writer(Db.Odd))],
    })
    const answer = await Effect.runPromise(
      RemoteServer.handlers(server, undefined)
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'Edit',
          input: { id: 'o', constructor: 'c2' },
        })
        .pipe(Effect.provide(layer)),
    )
    expect(answer.entities).toEqual([
      { entity: 'Odd', id: 'o', values: { id: 'o', constructor: 'c2' } },
    ])
    expect(client.prepare('select ctor from odd').all()).toEqual([{ ctor: 'c2' }])
  })

  it('is refused by name when no column holds it, as any field is', () => {
    expect(() =>
      bind({ Odd }, { Odd: { table: sqliteTable('odd', { id: text('id').primaryKey() }) } }),
    ).toThrow('field "constructor" on entity "Odd" has no column')
    const Parent = Entity.define('Parent', Schema.Struct({ id: Schema.String }))
    const Linked = Entity.relate({ Parent, Odd }, { Parent: { toString: Relation.many(Odd) } })
    expect(() =>
      bind(Linked, {
        // @ts-expect-error: no storage for the relation `toString`
        Parent: { table: sqliteTable('parents', { id: text('id').primaryKey() }) },
        Odd: { table: odd },
      }),
    ).toThrow('relation "toString" on entity "Parent" has no storage')
    expect(() =>
      // @ts-expect-error: no storage for the Entity bound under `constructor`
      bind({ constructor: Odd }, {}),
    ).toThrow('entity "Odd" has no table')
  })

  it('is refused where it is bound when it is `__proto__`', () => {
    const Proto = Entity.define(
      'Proto',
      Schema.Struct({ id: Schema.String, ['__proto__']: Schema.String }),
    )
    const table = sqliteTable('proto', { id: text('id').primaryKey(), proto: text('proto') })
    expect(() =>
      bind(
        { Proto },
        { Proto: { table, fields: Object.fromEntries([['__proto__', table.proto]]) } },
      ),
    ).toThrow('entity "Proto" names a member "__proto__", which a Drizzle row cannot hold')
  })
})
