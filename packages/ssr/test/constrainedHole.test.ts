/**
 * A hole form whose field has checks the empty placeholder fails, such as
 * `isMinLength(1)`, cannot be written into the page as data. The view still
 * renders, and the handler is marked as one the page cannot name, so the live
 * page answers it.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { expect, it } from 'vitest'
import { BINDING_ATTRIBUTE, Resume, SSR } from 'foldkit-ssr'

const Model = Schema.Struct({ query: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Searched: { query: Schema.String.check(Schema.isMinLength(1)) },
})
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { query: '' },
  update: model => ({ model }),
})
const Page = App.surface('Page', {
  model: ({ model }) => ({ query: model.query }),
  messages: [Message.Searched],
})
const plan = SSR.plan(App, {
  id: 'search',
  state: Projection.pick(App.model.query),
  surfaces: [Surface.at(Page, undefined)],
})
const config = {
  Model,
  init: () => ({ model: { query: '' } }),
  update: (model: Model) => ({ model }),
  view: (_model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return { title: 'Search', body: rh.input([rh.Id('q'), rh.OnInput(Message.Searched)]) }
  },
  container: null,
}

it('renders, and marks the handler as one the page cannot name', async () => {
  const { rendered, envelope } = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
  expect(rendered.html).toContain(`${BINDING_ATTRIBUTE}input="*"`)
  expect(envelope).not.toContain('"bindings"')
})
