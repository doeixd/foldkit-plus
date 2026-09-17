/**
 * complete requires init from initial when a wiring runs something at startup,
 * and url from url(...) when a wiring reads the URL.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import type { Url } from 'foldkit/url'
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
