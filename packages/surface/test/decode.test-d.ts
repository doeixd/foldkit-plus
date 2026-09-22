/**
 * Projection and Surface schemas are decodable codecs. Type-checked but not
 * executed.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from '../src/index.js'

const Model = Schema.Struct({ route: Schema.String, count: Schema.Number })
const Message = defineMessageUnion({ Ping: {} })
const App = Surface.application({ Model, Message })

// A Projection's Model decodes without a cast.
const count = Projection.struct({ count: App.model.count })
const _count: { readonly count: number } = Schema.decodeUnknownSync(count.Model)({ count: 1 })

// A Surface declared with params has them present, and they decode.
const Page = App.surface('Page', {
  params: { id: Schema.String },
  model: ({ model }) => ({ count: model.count }),
})
const _params: { readonly id: string } = Schema.decodeUnknownSync(Page.Params)({ id: 'p1' })

const Explicit = Surface.make(App, 'Explicit', {
  Params: Schema.Struct({ id: Schema.String }),
  model: ({ model }) => Projection.struct({ count: model.count }),
})
const _explicit: { readonly id: string } = Schema.decodeUnknownSync(Explicit.Params)({ id: 'p1' })

// A Surface without params has none, and a params Surface still fits a `Surface<…, any>`.
const Home = App.surface('Home', { model: ({ model }) => ({ count: model.count }) })
const _home: undefined = Home.Params
const _widened: Surface<typeof Model.Type, unknown, unknown, any> = Page

declare const needsService: Schema.Codec<string, string, 'Service'>

// @ts-expect-error a Projection Model must decode without services
Projection.fromReader(needsService, () => 'x')

Surface.make(App, 'Serviced', {
  // @ts-expect-error params must decode without services
  Params: needsService,
  model: ({ model }) => Projection.struct({ count: model.count }),
})
