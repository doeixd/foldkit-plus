/// <reference types="@vitest/browser-playwright" />
/**
 * A URL mirror's write comes back as a `UrlChanged` (Foldkit's `replaceUrl`
 * dispatches it). On a loaded machine that echo can land after a newer
 * keystroke, and reading it put the older text back: typing lost a key
 * (#379). Typed on a real application with the CPU slowed, the Model, and
 * so the address, ends on everything typed.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { embed, makeApplication } from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import * as Subscription from 'foldkit/subscription'
import { Url } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({ q: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  Typed: { q: Schema.String },
})
type Message = typeof Message.Type
const initial: Model = { q: '' }
const App = Surface.application({ Model, Message })
// As domains-plus keeps its search: replaced with every keystroke, at once.
const Query = Mirror.url(App, {
  initial,
  fields: [App.model.q],
  keys: { q: { history: 'replace' } },
  throttle: 0,
})

const routed = Mirror.routing({
  mirrors: [Query],
  urlChanged: 'ChangedUrl',
  init: () => ({ model: initial }),
  update: (model: Model, message: Message): { readonly model: Model } =>
    Message.match(message, {
      ChangedUrl: () => ({ model }),
      ClickedLink: () => ({ model }),
      Typed: ({ q }) => ({ model: modifyFields(model, { q: () => q }) }),
    }),
  routing: {
    onUrlRequest: request => Message.ClickedLink({ request }),
    onUrlChange: url => Message.ChangedUrl({ url }),
  },
})

const start = window.location.href
let dispose = () => {}

afterEach(async () => {
  dispose()
  await cdp().send('Emulation.setCPUThrottlingRate', { rate: 1 })
  document.body.replaceChildren()
  window.history.replaceState(null, '', start)
})

const mount = () => {
  const container = document.createElement('div')
  container.id = 'mirror-echo'
  document.body.append(container)
  const handle = embed(
    makeApplication({
      Model,
      ...routed,
      view: (model: Model, h: HtmlBuilder<Message>) => ({
        title: 'Echo',
        body: h.div(
          [],
          [
            h.input([
              h.AriaLabel('Search'),
              h.Value(model.q),
              h.OnInput(q => Message.Typed({ q })),
            ]),
            h.p([h.AriaLabel('model')], [model.q]),
          ],
        ),
      }),
      subscriptions: Subscription.make<Model, Message>()(() => ({ ...Query.subscriptions })),
      container,
    }),
  )
  dispose = () => handle.dispose()
}

test('typing under load keeps every key in the Model and the address', async () => {
  mount()
  const input = await vi.waitFor(() => {
    const found = document.querySelector<HTMLInputElement>('input[aria-label="Search"]')
    expect(found).not.toBeNull()
    return found!
  })
  // Each round lost a key about two runs in three before the fix.
  for (const typed of ['johnny appleseed', 'mary poppins']) {
    await userEvent.clear(input)
    await cdp().send('Emulation.setCPUThrottlingRate', { rate: 6 })
    await userEvent.type(input, typed)
    await cdp().send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await vi.waitFor(() => {
      expect(document.querySelector('[aria-label="model"]')!.textContent).toBe(typed)
      expect(new URLSearchParams(window.location.search).get('q')).toBe(typed)
    })
  }
})
