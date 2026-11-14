// @vitest-environment node
/**
 * One trace through a write: the span Remote opens for the mutation, the
 * adapter's call to the Api, and Domain's `decide` all name one trace id, and
 * each is the child of the one before. A trace that broke at the adapter would
 * start Domain's span afresh.
 */
import { Effect, Optic, Schema, Tracer } from 'effect'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { ModelRef } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { ProductEntity, Reserve, ShopApi } from './fixture.js'
import { world as makeWorld } from './transport.js'

const AppModel = Schema.Struct({ remote: Remote.Model })
const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<typeof AppModel.Type>().key('remote'), [
    'remote',
  ]),
  entities: [ProductEntity],
  mutations: [Reserve],
})

/** A tracer that keeps every span it makes. */
const recording = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: options => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { spans, tracer }
}

const parentOf = (span: Tracer.NativeSpan) =>
  span.parent._tag === 'Some' ? span.parent.value.spanId : undefined

describe('a write is one trace', () => {
  it('runs from the Remote mutation through the adapter to Domain’s decide', async () => {
    const world = makeWorld()
    const { spans, tracer } = recording()
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* ShopApi.Client
        yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
        yield* world.control.drain
        const started = Data.mutate({ remote: Remote.initial }, Reserve, {
          id: 'p1',
          quantity: 2,
          revision: 1,
        })
        yield* (started.command.effect as Effect.Effect<unknown, never, RemoteClient>).pipe(
          Effect.provideService(Tracer.Tracer, tracer),
        )
      }).pipe(Effect.scoped, Effect.provide(world.layer)),
    )
    const byId = new Map(spans.map(span => [span.spanId, span]))
    const decide = spans.find(span => span.name === 'Domain.decide Product.ReserveStock')
    expect(decide).toBeDefined()
    const ancestry: Array<string> = []
    for (let at = decide; at !== undefined; at = byId.get(parentOf(at) ?? ''))
      ancestry.unshift(at.name)
    expect(ancestry[0]).toBe('Remote.mutate')
    // The adapter's call to the Api sits between Remote's span and Domain's.
    expect(ancestry).toContain('ReserveStock')
    expect(ancestry.at(-1)).toBe('Domain.decide Product.ReserveStock')
    expect(new Set(spans.map(span => span.traceId)).size).toBe(1)
  })
})
