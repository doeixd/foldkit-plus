/**
 * The memory runner: the same declared write landed over rows in memory by
 * `RemoteServer.memoryWriter`, behind the guard the SQLite server uses, with
 * no database. It holds no ledger, so it has no step for one.
 */
import { Effect, Option, Schema } from 'effect'
import { Product, type User } from 'foldkit-example-writes/domain'
import { Policy } from 'foldkit-example-writes/server'
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { ReserveStock } from '../domain.js'
import { Scenario } from 'foldkit-remote/testing'
import type { ScenarioRunner } from './scenario.js'

export const memoryRunner: ScenarioRunner = {
  name: 'memory',
  run: scenario =>
    Effect.gen(function* () {
      const backend = RemoteServer.memory<Option.Option<User>>({
        domain: Remote.define({ entities: [Product], mutations: [ReserveStock] }),
        rows: { Product: scenario.given.map(({ row }) => ({ ...row, id: String(row['id']) })) },
        mutations: store => [
          RemoteServer.write(
            ReserveStock,
            GuardServer.writer(Product, Policy, RemoteServer.memoryWriter(store, Product), {
              revision: 'revision',
            }),
          ),
        ],
      })
      const [mutation, input] = scenario.when
      const decision = yield* Scenario.decisionOf(
        mutation,
        RemoteServer.handlers(backend.server, scenario.principal).FoldkitRemoteMutate({
          requestId: scenario.operation,
          operation: scenario.operation,
          mutation: mutation.name,
          input: Schema.encodeUnknownSync(mutation.Input)(input),
        }),
      )
      const id = Scenario.target(scenario)
      const wanted = Scenario.expectedRow(scenario, id)
      const held = backend.rows('Product').find(row => row['id'] === id) ?? {}
      return [
        {
          backend: 'memory',
          step: 'decision',
          expected: Scenario.expectedDecision(scenario),
          actual: decision,
        },
        { backend: 'memory', step: 'row', expected: wanted, actual: Scenario.pick(held, wanted) },
      ]
    }),
}
