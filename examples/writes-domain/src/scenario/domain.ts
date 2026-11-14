/**
 * The Domain runner: the scenario's rows listed as products in a model hosted
 * in memory, and the write sent twice over: through the adapter as Remote's
 * client sends it (the decision), and as a Story on Domain's own terms (the
 * events recorded and the View). What the aggregate then holds is read from it.
 */
import { Story } from '@alchemy.run/domain/Story'
import { Cause, Effect, Exit, Option, Ref, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { RemoteClient } from 'foldkit-remote'
import { Product as ProductEntity } from 'foldkit-example-writes/domain'
import {
  CurrentUser,
  Product,
  ProductListed,
  ProductRow,
  ProductRowLive,
  Reserved,
  Shop,
  StockReserved,
} from '../model.js'
import { decisionOf } from './decision.js'
import {
  expectedDecision,
  expectedRow,
  lands,
  pick,
  seededRow,
  targetOf,
  type ScenarioRunner,
  type WriteScenario,
} from './scenario.js'
import { world } from './world.js'

const decodeRow = Schema.decodeUnknownSync(ProductEntity.schema)

/** The `Invalid` the model rejects with for an invariant of the Entity: its words and the path it shows beside. */
const invalid = ({ entity, id }: { readonly entity: string; readonly id: string }) => {
  const held = Entity.invariants(ProductEntity).find(
    each => each.entity === entity && each.id === id,
  )
  if (held === undefined) throw new Error(`${entity} declares no invariant "${id}"`)
  return new Reserved.rejections.Invalid({
    entity: Option.some(entity),
    rule: Option.some(id),
    message: held.message,
    path: [...held.path],
  })
}

/** The write as a Story over the target's aggregate: what Domain records, rejects and shows. */
const story = (scenario: WriteScenario) => {
  const id = targetOf(scenario)
  const ref = Product.ref(id)
  const [, input] = scenario.when
  const { revision, quantity } = input as { readonly revision: number; readonly quantity: number }
  const listed = scenario.given.flatMap(({ row }) =>
    row['id'] === id ? [new ProductListed({ row: decodeRow(row) })] : [],
  )
  const command = new Reserved.command({ revision, quantity })
  const commandId = `ReserveStock:${scenario.operation}:${'a'.repeat(32)}`
  const { expect } = scenario
  const start = [
    Story.given(ref, ...listed),
    Story.clock(scenario.now),
    Story.provide(CurrentUser, scenario.principal),
    Story.when(ref, command, { commandId }),
  ] as const
  const run = Story.make(Shop, { layer: ProductRowLive })
  switch (expect._tag) {
    case 'Accepted':
      return run(
        ...start,
        Story.then(
          ref,
          new StockReserved({
            quantity,
            reservedAfter: Number(expect.row['reserved']),
            revisionAfter: Number(expect.row['revision']),
          }),
        ),
        Story.view(ProductRow, ref, decodeRow({ ...seededRow(scenario, id), ...expect.row })),
      )
    case 'Forbidden':
      return run(...start, Story.rejected(new Reserved.rejections.Forbidden({})))
    case 'Unauthenticated':
      return run(...start, Story.rejected(new Reserved.rejections.Unauthenticated({})))
    case 'Refused': {
      const { refusal } = expect
      return run(
        ...start,
        Story.rejected(
          typeof refusal === 'string'
            ? refusal === 'Conflict'
              ? new Reserved.rejections.Conflict({})
              : new Reserved.rejections.Unmet({})
            : invalid(refusal),
        ),
      )
    }
  }
}

export const domainRunner: ScenarioRunner = {
  name: 'domain',
  run: scenario => {
    const shop = world()
    const id = targetOf(scenario)
    const wanted = expectedRow(scenario, id)
    const [mutation, input] = scenario.when
    const asking = Option.map(scenario.principal, user => user.id)
    return Effect.gen(function* () {
      yield* shop.seed(scenario.given.map(({ row }) => row))
      yield* Ref.set(shop.as, asking)
      const client = yield* RemoteClient
      const decision = yield* decisionOf(
        client.mutate({
          requestId: scenario.operation,
          operation: scenario.operation,
          mutation: mutation.name,
          input: Schema.encodeUnknownSync(mutation.Input)(input),
          principal: Option.getOrNull(asking),
        }),
      )
      yield* shop.control.drain
      const products = yield* Product
      const held = Option.getOrElse((yield* products.get(id)).row, () => ({}))
      const told = yield* Effect.exit(story(scenario))
      return [
        {
          backend: 'domain',
          step: 'decision',
          expected: expectedDecision(scenario),
          actual: decision,
        },
        { backend: 'domain', step: 'row', expected: wanted, actual: pick(held, wanted) },
        {
          backend: 'domain',
          step: 'commits',
          expected: scenario.given.length + (lands(scenario) ? 1 : 0),
          actual: shop.control.commits.length,
        },
        {
          backend: 'domain',
          step: 'story',
          expected: 'passed',
          actual: Exit.isSuccess(told) ? 'passed' : Cause.pretty(told.cause),
        },
      ]
    }).pipe(Effect.scoped, Effect.provide(shop.layer))
  },
}
