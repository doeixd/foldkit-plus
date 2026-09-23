/**
 * The application Phase 2's tests hand over: a counter whose Model also holds
 * a large report the server renders from nothing, and the browser never needs.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

export const Model = Schema.Struct({ count: Schema.Number, report: Schema.String })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ Clicked: {}, Booted: {} })
export type Message = typeof Message.Type

export const App = Surface.application({
  Model,
  Message,
  initial: { count: 0, report: '' },
  update: (model: Model) => ({ model }),
})

/** How many times the application's own `init` has run. */
export const calls = { init: 0 }

export const config = {
  Model,
  init: () => {
    calls.init++
    return { model: { count: 41, report: 'HUGE server-only report' } }
  },
  update: (model: Model, message: Message) =>
    message._tag === 'Clicked'
      ? { model: { ...model, count: model.count + 1 } }
      : { model: { ...model, count: -1 } },
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Counter',
    body: h.button([h.Id('count'), h.OnClick(Message.Clicked())], [String(model.count)]),
  }),
  container: null,
}

export const plan = SSR.plan(App, { id: 'counter', state: Projection.pick(App.model.count) })

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

/** Loads a served page as the document, as a browser would. */
export const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}

export const settle = () => new Promise(resolve => setTimeout(resolve, 20))
