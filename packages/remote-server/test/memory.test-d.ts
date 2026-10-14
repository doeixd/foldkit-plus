import { Effect, Schema } from 'effect'
import { Entity, Query, Remote } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'
import { RemoteServer, type MemoryBackend, type MemoryServed } from '../src/index.js'

const Item = Entity.make('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const domain = Remote.define({ entities: [Item] })
const rows = { Item: [{ id: 'a', name: 'Anchor' }] }

// With no principal, the backend answers as `undefined`.
expectTypeOf(RemoteServer.memory({ domain, rows })).toEqualTypeOf<MemoryBackend<undefined>>()

// The principal is inferred from `authorize`, and the layer answers as the one given.
expectTypeOf(
  RemoteServer.memory({
    domain,
    rows,
    principal: 'ada',
    authorize: { Item: (who: string, fields) => (who === 'ada' ? fields : []) },
  }),
).toEqualTypeOf<MemoryBackend<string>>()

// A principal that admits undefined may be left out.
RemoteServer.memory<string | undefined>({
  domain,
  rows,
  authorize: { Item: (who, fields) => (who === undefined ? [] : fields) },
})

// Without a principal the layer could answer as, there is no layer: only the
// server, answered as whoever each request names.
const served = RemoteServer.memory({
  domain,
  rows,
  authorize: { Item: (_who: string, fields) => fields },
})
expectTypeOf(served).toEqualTypeOf<MemoryServed<string>>()
// @ts-expect-error no layer, which would answer as nobody
void served.layer

// Sources beside the rows read the same principal.
const Other = Entity.make('Other', Schema.Struct({ id: Schema.String }))
const asString = RemoteServer.entity<string>(Other, { read: () => Effect.succeed([]) })
const asNumberEntity = RemoteServer.entity<number>(Other, { read: () => Effect.succeed([]) })
expectTypeOf(
  RemoteServer.memory({ domain, rows, entities: [asString], principal: 'ada' }),
).toEqualTypeOf<MemoryBackend<string>>()
RemoteServer.memory({
  domain,
  rows,
  // @ts-expect-error a string principal where an entity source reads a number
  principal: 'ada',
  entities: [asNumberEntity],
})

// What `authorize` reads and what the layer answers as must agree.
RemoteServer.memory({
  domain,
  rows,
  // @ts-expect-error a string principal where authorize reads a number
  principal: 'ada',
  authorize: { Item: (who: number, fields) => (who > 0 ? fields : []) },
})

const Items = Query.make('Items', { Input: {}, Result: Query.connection(Item) })
const asNumber = RemoteServer.query<number, never, {}>(Items, () =>
  Effect.succeed({
    edges: [],
    start: { _tag: 'Terminal' as const },
    end: { _tag: 'Terminal' as const },
  }),
)
RemoteServer.memory({
  domain,
  rows,
  // @ts-expect-error a string principal where a query source reads a number
  principal: 'ada',
  queries: [asNumber],
})
