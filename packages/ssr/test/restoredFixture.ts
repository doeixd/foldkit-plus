/**
 * #470: a page whose query the browser reads again, so the envelope does not
 * carry it. The server draws `server`; the browser's own restore gives
 * `browser`, and the first render is rebuilt where they differ.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

export const Model = Schema.Struct({
  path: Schema.String,
  query: Schema.String,
  count: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ Clicked: {} })
export type Message = typeof Message.Type

export const initial: Model = { path: '/', query: '', count: 0 }

export const App = Surface.application({
  Model,
  Message,
  initial,
  update: (model: Model) => ({ model }),
})

const Search = App.surface('Search', { model: ({ model }) => ({ query: model.query }) })

const SearchWhen = App.surface('SearchWhen', {
  params: { query: Schema.String },
  model: ({ model }) => ({ query: model.query }),
})

export const config = {
  Model,
  init: () => ({ model: { path: '/', query: 'server', count: 0 } }),
  update: (model: Model) => ({ model }),
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Restored',
    body: h.p([h.Id('query')], [model.query]),
  }),
  container: null,
}

export const plan = SSR.plan(App, {
  id: 'restored',
  state: Projection.pick(App.model.path, App.model.count),
  restored: [App.model.query],
  restore: (model: Model) => ({ ...model, query: 'browser' }),
  surfaces: [Surface.at(Search, undefined)],
})

/**
 * A Surface activated by the restored field. The server's coverage check must
 * see the browser's restored value, or it would judge the browser's baseline.
 */
export const activatedPlan = SSR.plan(App, {
  id: 'restored-active',
  state: Projection.pick(App.model.path, App.model.count),
  restored: [App.model.query],
  restore: (model: Model) => ({ ...model, query: 'server' }),
  surfaces: [
    Surface.at(SearchWhen, model =>
      model.query === 'server' ? Option.some({ query: model.query }) : Option.none(),
    ),
  ],
})

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

export const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}
