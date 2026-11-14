/**
 * The SQLite runner: the scenario's rows inserted into a fresh database, the
 * write sent through the server's handlers as who asks, and what the table and
 * the ledger then hold.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Option, Schema } from 'effect'
import { schema } from 'foldkit-example-writes/server'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { server } from '../sqlite.js'
import { decisionOf } from './decision.js'
import {
  expectedDecision,
  expectedRow,
  lands,
  pick,
  targetOf,
  type ScenarioRunner,
  type ScenarioStep,
} from './scenario.js'

const columns = 'id, owner_id, name, status, stock, reserved, revision'

export const sqliteRunner: ScenarioRunner = {
  name: 'sqlite',
  run: scenario =>
    Effect.gen(function* () {
      const database = new DatabaseSync(':memory:')
      database.exec(schema)
      const insert = database.prepare(
        `insert into products (${columns}) values (?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const { row } of scenario.given)
        insert.run(
          String(row['id']),
          String(row['ownerId']),
          String(row['name']),
          String(row['status']),
          Number(row['stock']),
          Number(row['reserved']),
          Number(row['revision']),
        )
      const [mutation, input] = scenario.when
      const decision = yield* decisionOf(
        RemoteServer.handlers(server, scenario.principal).FoldkitRemoteMutate({
          requestId: scenario.operation,
          operation: scenario.operation,
          mutation: mutation.name,
          input: Schema.encodeUnknownSync(mutation.Input)(input),
        }),
      ).pipe(Effect.provide(databaseLayer(drizzle({ client: database }))))

      const id = targetOf(scenario)
      const wanted = expectedRow(scenario, id)
      const held = database
        .prepare(
          `select id, owner_id as ownerId, name, status, stock, reserved, revision from products where id = ?`,
        )
        .get(id)
      const ledgered = database.prepare('select scope, operation from write_ledger').all()
      return [
        {
          backend: 'sqlite',
          step: 'decision',
          expected: expectedDecision(scenario),
          actual: decision,
        },
        { backend: 'sqlite', step: 'row', expected: wanted, actual: pick(held ?? {}, wanted) },
        {
          backend: 'sqlite',
          step: 'ledger',
          expected: lands(scenario)
            ? [
                {
                  scope: Option.match(scenario.principal, {
                    onNone: () => '',
                    onSome: ({ id }) => id,
                  }),
                  operation: scenario.operation,
                },
              ]
            : [],
          actual: ledgered,
        },
      ] satisfies ReadonlyArray<ScenarioStep>
    }),
}
