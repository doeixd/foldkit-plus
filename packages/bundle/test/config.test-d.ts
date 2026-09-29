/**
 * `assembly.config` keeps the `complete` guarantees by construction, takes
 * exactly the fields no placement owns, and reserves `init` and `url` for
 * the lower-level API.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import type { Url } from 'foldkit/url'
import { Bundle, Link, type Wiring } from '../src/index.js'
import { Counter, CounterMessage, CounterModel } from './fixture.js'

const GotCounter = Link.wrapper('GotCounterMessage', CounterMessage)
const Model = Schema.Struct({ counter: CounterModel })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Reset: {}, ...GotCounter.cases })
type Message = typeof Message.Type

const placed = Counter.at(Link.field<Model>()('counter', GotCounter), {
  args: { limit: 3, start: 0 },
  onOut: () => model => ({ model }),
})
const assembly = Bundle.assemble<Model, Message>()([placed])

const config = assembly.config({
  Model,
  container: null,
  view: () => 'view' as const,
  initial: {},
  update: (model, message) => {
    // The own update never sees a placement's wrapper variant.
    const tag: 'Reset' = message._tag
    void tag
    return { model }
  },
})

// The derived fields carry the `complete` brands, so `complete` accepts the result.
assembly.complete(config)

// `initial` is required: exactly the fields no placement owns.
// @ts-expect-error: initial is required
assembly.config({
  Model,
  update: (model: Model) => ({ model }),
})

// A placement's field is refused in `initial`, as with `assembly.initial`.
assembly.config({
  // @ts-expect-error: counter is the placement's field
  initial: { counter: { count: 0, running: false } },
  update: (model: Model) => ({ model }),
})

// `init` and `url` are owned by `config`: pass `initial`, or use `complete`.
assembly.config({
  initial: {},
  // @ts-expect-error: config owns init
  init: () => assembly.initial({}),
})
assembly.config({
  initial: {},
  // @ts-expect-error: config does not derive url
  url: (url: Url) => Message.Reset(),
})

// An assembly that reads the URL stays on `complete` with `assembly.url`.
declare const urlReader: Wiring<Model, Message> & {
  readonly onUrl: (model: Model, url: Url) => Model
}
declare const startup: Wiring<Model, Message> & { readonly init: Update.Step<Model, Message> }
const urlAssembly = Bundle.parent({ Model, Message }).assemble(startup, urlReader)
// @ts-expect-error: config does not derive url yet
urlAssembly.config({ initial: { counter: { count: 0, running: false } } })
