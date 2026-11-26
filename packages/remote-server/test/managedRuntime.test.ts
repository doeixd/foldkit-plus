import { Context, Effect, Layer, ManagedRuntime, Schema } from 'effect'
import { Entity, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

const Item = Entity.make('Item', Schema.Struct({ id: Schema.String, title: Schema.String }))

class CounterService extends Context.Service<CounterService, { readonly buildId: number }>()(
  'test/CounterService',
) {}

describe('serveFetch with shared ManagedRuntime & Effect.withSpan', () => {
  it('reuses the ManagedRuntime layer across requests instead of rebuilding per request', async () => {
    let builds = 0
    const counterLayer = Layer.sync(CounterService, () => {
      builds += 1
      return { buildId: builds }
    })

    const runtime = ManagedRuntime.make(counterLayer)
    try {
      const ItemSource = RemoteServer.entity<string, CounterService>(Item, {
        authorize: (_principal, fields) => fields,
        read: ({ ids }) =>
          Effect.gen(function* () {
            const svc = yield* CounterService
            return ids.map(id => ({
              id,
              values: { id, title: `build-${svc.buildId}` },
            }))
          }),
      })

      const handler = serveFetch({
        server: RemoteServer.make({ entities: [ItemSource] }),
        resolvePrincipal: () => Effect.succeed('admin'),
        layer: () => counterLayer,
        runtime,
      })

      const call = () =>
        handler(
          new Request('http://localhost/remote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              operation: 'read',
              payload: {
                version: REMOTE_PROTOCOL_VERSION,
                requests: [{ entity: 'Item', id: '1', fields: ['id', 'title'] }],
              },
            }),
          }),
          undefined,
        ).then(r => r.json() as Promise<Record<string, unknown>>)

      const r1 = await call()
      const r2 = await call()

      expect(builds).toBe(1)
      expect(JSON.stringify(r1)).toContain('build-1')
      expect(JSON.stringify(r2)).toContain('build-1')
    } finally {
      await runtime.dispose()
    }
  })
})
