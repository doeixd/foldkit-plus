/**
 * What reading many rows by id costs on every render (#384).
 *
 * domains-plus reads each of 556 names with `Data.get(Quote, name).read(model)`
 * on every render, before any region is asked. Four questions:
 *
 * - **Same Model**: the render after a Message that changed nothing Remote
 *   holds (a menu opened). Every read asks the store it read last time.
 * - **Held handles**: the same, with each `Data.get` made once, so the
 *   difference is what making a read costs.
 * - **One row changed**: a price arriving. One row's value changed, and 555
 *   are as they were.
 * - **An unrelated write**: a row no read here reaches was written.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, test } from 'vitest'
import { Remote } from '../src/index.js'

// Vitest 5 hands `bench` to a test as a context fixture; this keeps each case one line.
const benchmark = (name: string, run: () => unknown) =>
  test(name, async ({ bench }) => {
    await bench(name, run).run()
  })

const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, tld: Schema.String, price: Schema.Number },
  Unconfirmed: { id: Schema.String, name: Schema.String, tld: Schema.String },
})
const Quote = Entity.select(Domain, { _tag: true, name: true, tld: true, price: true })

const Model = Schema.Struct({ remote: Remote.Model, query: Schema.String })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Domain] })

const receive = (model: Model, rows: ReadonlyArray<readonly [string, number]>): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: rows.map(([id]) => ({
      entity: 'Domain',
      id,
      fields: ['_tag', 'name', 'tld', 'price'],
    })),
    result: {
      settled: [],
      entities: rows.map(([id, price]) => ({
        entity: 'Domain',
        id,
        values: { _tag: 'Available', id, name: id, tld: 'com', price },
      })),
    },
    now: 0,
  })

const names = Array.from({ length: 556 }, (_, n) => `acme${n}.com`)
const loaded = receive(
  { remote: Remote.initial, query: '' },
  names.map(name => [name, 10] as const),
)
const readAll = (model: Model) => names.map(name => Data.get(Quote, name).read(model))
if (readAll(loaded).some(read => read._tag !== 'Ready')) throw new Error('fixture is not Ready')
const handles = names.map(name => Data.get(Quote, name))

let price = 10
let other = 0

describe('556 rows read by id', () => {
  benchmark('same Model', () => readAll(loaded))

  benchmark('same Model, held handles', () => handles.map(handle => handle.read(loaded)))

  benchmark('one row changed', () => readAll(receive(loaded, [[names[3]!, ++price]])))

  benchmark('an unrelated row written', () =>
    readAll(receive(loaded, [[`other${other++}.com`, 1]])),
  )

  benchmark('the write alone', () => receive(loaded, [[names[3]!, ++price]]))
})
