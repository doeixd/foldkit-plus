// @vitest-environment jsdom
/** `Mirror.routing` on a real `makeApplication`: Foldkit's own URL events reach the mirror. */
import { Option, Schema } from 'effect'
import { embed, makeApplication } from 'foldkit/runtime'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import * as Subscription from 'foldkit/subscription'
import { Url, fromString } from 'foldkit/url'
import { Surface } from 'foldkit-surface'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({
  path: Schema.String,
  // The filter the application's own `update` saw when it routed.
  routedWith: Schema.String,
  filter: Schema.Literals(['all', 'active']),
  q: Schema.String,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  Typed: { q: Schema.String },
})
type Message = typeof Message.Type
const initial: Model = { path: '/', routedWith: '', filter: 'all', q: '' }
const App = Surface.application({ Model, Message })
const Filters = Mirror.url(App, {
  initial,
  fields: [App.model.filter, App.model.q],
  keys: { q: { history: 'replace' } },
  // Later than a frame, so the write's ChangedUrl cannot share a render with its cause.
  throttle: 30,
})

const routed = Mirror.routing({
  mirrors: [Filters],
  urlChanged: 'ChangedUrl',
  init: (url: Url) => ({ model: { ...initial, path: url.pathname } }),
  update: (model: Model, message: Message): { readonly model: Model } =>
    Message.match(message, {
      // A route that did not change keeps the Model, as Foldkit's no-op must.
      ChangedUrl: ({ url }) => ({
        model:
          url.pathname === model.path
            ? model
            : { ...model, path: url.pathname, routedWith: model.filter },
      }),
      ClickedLink: () => ({ model }),
      Typed: ({ q }) => ({ model: { ...model, q } }),
    }),
  routing: {
    onUrlRequest: request => Message.ClickedLink({ request }),
    onUrlChange: url => Message.ChangedUrl({ url }),
  },
})

let views = 0
const running: Array<() => void> = []

beforeEach(() => {
  views = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})
afterEach(() => {
  for (const dispose of running.splice(0)) dispose()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  window.history.replaceState(null, '', '/')
})

const mount = (href: string) => {
  window.history.replaceState(null, '', href)
  const container = document.createElement('div')
  container.id = 'mirror-routing'
  document.body.append(container)
  const handle = embed(
    makeApplication({
      Model,
      ...routed,
      view: (model: Model, h: HtmlBuilder<Message>) => {
        views += 1
        return {
          title: 'Routing',
          body: h.div(
            [],
            [
              h.p(
                [h.Id('shown')],
                [`${model.path}|${model.filter}|${model.q}|${model.routedWith}`],
              ),
              h.button([h.Id('type'), h.OnClick(Message.Typed({ q: 'rex' }))], ['type']),
            ],
          ),
        }
      },
      subscriptions: Subscription.make<Model, Message>()(() => ({ ...Filters.subscriptions })),
      container,
    }),
  )
  running.push(() => handle.dispose())
}

const shown = () => document.getElementById('shown')?.textContent ?? ''
const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
const navigate = (href: string) => {
  window.history.pushState(null, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

it('reads the starting URL into the Model the application’s init returns', async () => {
  mount('/list?filter=active&q=rex')
  await settle()
  expect(shown()).toBe('/list|active|rex|')
})

it('reads a navigation before the application routes it', async () => {
  mount('/list')
  await settle()
  navigate('/other?filter=active')
  await settle()
  // `routedWith`: the application's own update already saw the filter.
  expect(shown()).toBe('/other|active||active')
  navigate('/other')
  await settle()
  expect(shown()).toBe('/other|all||active')
})

it('the mirror’s own write comes back as a ChangedUrl that renders nothing', async () => {
  mount('/list')
  await settle()
  document.getElementById('type')?.click()
  await settle(10)
  expect(shown()).toBe('/list|all|rex|')
  expect(window.location.search).toBe('')
  const rendered = views
  await settle(80)
  // The write reached the URL, and Foldkit answered it with `onUrlChange`.
  expect(window.location.search).toBe('?q=rex')
  expect(views).toBe(rendered)
})

it('a ChangedUrl for the URL the Model shows returns that Model', () => {
  const model: Model = { ...initial, path: '/list', filter: 'active' }
  const url = Option.getOrThrow(fromString('http://localhost/list?filter=active'))
  expect(routed.update(model, Message.ChangedUrl({ url })).model).toBe(model)
})
