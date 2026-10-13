/**
 * complete requires init from initial when a wiring runs something at startup,
 * and url from url(...) when a wiring reads the URL.
 */
import { Match, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import type { Url } from 'foldkit/url'
import { expectTypeOf } from 'vitest'
import { Bundle, type Wiring } from '../src/index.js'

const Model = Schema.Struct({ filter: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ UrlChanged: { href: Schema.String } })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

declare const startup: Wiring<Model, Message> & { readonly init: Update.Step<Model, Message> }
declare const urlReader: Wiring<Model, Message> & {
  readonly onUrl: (model: Model, url: Url) => Model
}
const assembly = Page.assemble(startup, urlReader)
const update = assembly.update()
const toMessage = (url: Url) => Message.UrlChanged({ href: String(url) })

assembly.complete({
  init: () => assembly.initial({ filter: 'all' }),
  update,
  subscriptions: assembly.subscriptions(),
  url: assembly.url(toMessage),
})

assembly.complete({
  // @ts-expect-error: init must return assembly.initial(rest)
  init: () => ({ model: { filter: 'all' } }),
  update,
  subscriptions: assembly.subscriptions(),
  url: assembly.url(toMessage),
})

// @ts-expect-error: url must come from assembly.url(onUrlChange)
assembly.complete({
  init: () => assembly.initial({ filter: 'all' }),
  update,
  subscriptions: assembly.subscriptions(),
})

// A wiring with neither needs neither.
declare const plain: Wiring<Model, Message>
const plainAssembly = Page.assemble(plain)
plainAssembly.complete({
  update: plainAssembly.update(),
  subscriptions: plainAssembly.subscriptions(),
})

// A wiring's claimed tags leave the parent's own update; a shared one stays.
const Integrated = defineMessageUnion({
  Fetched: { id: Schema.String },
  UrlChanged: { href: Schema.String },
  Pressed: {},
})
type Integrated = typeof Integrated.Type
const Integration = Bundle.parent({ Model, Message: Integrated })
declare const fetching: Wiring<Model, Integrated, never, 'Fetched'>
declare const urlMirror: Wiring<Model, Integrated, never, 'UrlChanged'> & {
  readonly shared: ReadonlyArray<'UrlChanged'>
}
type OwnTags = Bundle.OwnMessage<Integrated, readonly [typeof fetching, typeof urlMirror]>['_tag']
expectTypeOf<OwnTags>().toEqualTypeOf<'UrlChanged' | 'Pressed'>()
// So an own update that matches every tag it gets compiles while the wiring is
// there, and stops compiling once it is gone: the removal is no longer silent.
Integration.assemble(fetching).update((model, message) =>
  Match.valueTags(message, { UrlChanged: () => ({ model }), Pressed: () => ({ model }) }),
)
Integration.assemble().update((model, message) =>
  // @ts-expect-error: without the wiring, Fetched reaches own and is not matched
  Match.valueTags(message, { UrlChanged: () => ({ model }), Pressed: () => ({ model }) }),
)
// An untyped wiring claims nothing in the type, so it changes nothing.
expectTypeOf<Bundle.OwnMessage<Integrated, readonly [typeof plain]>>().toEqualTypeOf<Integrated>()
