import { Effect, Schema } from 'effect'
import { Entity, Query, Remote } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'
import { RemoteServer, type MemoryBackend } from '../src/index.js'

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

// @ts-expect-error a principal the layer could not answer as is required
RemoteServer.memory({ domain, rows, authorize: { Item: (_who: string, fields) => fields } })

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
