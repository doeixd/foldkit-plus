/**
 * `assembly.runtime` builds the runtime config from `initial` rest or an init
 * function, checks the whole update, derives the records, and reserves `init`.
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

const update = (model: Model, message: Message) => ({ model })

// Rest form: init is derived, and the result passes `complete`.
const fromRest = assembly.runtime({ initial: {}, update })
assembly.complete(fromRest)

// Function form: the init passes through.
const initFn = () => assembly.initial({})
const fromFn = assembly.runtime({ initial: initFn, update })
const sameFn: typeof initFn = fromFn.init
void sameFn

// The update already routes every placement, so it is narrowed nowhere.
assembly.runtime({
  initial: {},
  // @ts-expect-error: the wrapper is already routed inside
  update: (model: Model, _message: { readonly _tag: 'Reset' }) => ({ model }),
})

// Rest holds exactly the fields no placement owns.
assembly.runtime({
  // @ts-expect-error: counter is the placement's field
  initial: { counter: { count: 0, running: false } },
  update,
})

// `init` is reserved for the derivation.
assembly.runtime({
  initial: {},
  update,
  // @ts-expect-error: runtime owns init
  init: () => assembly.initial({}),
})

// Assemblies that read the URL pass their `url` from `assembly.url`.
declare const urlReader: Wiring<Model, Message> & {
  readonly onUrl: (model: Model, url: Url) => Model
}
declare const startup: Wiring<Model, Message> & { readonly init: Update.Step<Model, Message> }
const urlAssembly = Bundle.parent({ Model, Message }).assemble(startup, urlReader)
const wired = urlAssembly.runtime({
  initial: { counter: { count: 0, running: false } },
  update,
  url: urlAssembly.url(() => Message.Reset()),
})
assembly.complete(fromRest)
void wired

// ...but a missing one is refused.
// @ts-expect-error: url must come from assembly.url
urlAssembly.runtime({ initial: { counter: { count: 0, running: false } }, update })

// An unbranded init function is refused where a wiring runs startup Commands.
urlAssembly.runtime({
  // @ts-expect-error: an init function must return assembly.initial(...)
  initial: () => ({ model: {} as Model }),
  update,
  url: urlAssembly.url(() => Message.Reset()),
})
