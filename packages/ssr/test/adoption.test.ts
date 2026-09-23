// @vitest-environment jsdom
/**
 * Phase 0: the harder things to adopt. A controlled input keeps its node and
 * its value, trusted `InnerHTML` keeps the server's children, and a custom
 * element keeps its light DOM.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { expect, it } from 'vitest'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { renderToString } from 'foldkit/experimental/server'
import { root, serve, settle } from './support.js'

const Model = Schema.Struct({ text: Schema.String })
const Message = defineMessageUnion({ Typed: { value: Schema.String } })
type Message = typeof Message.Type
const config = {
  Model,
  init: () => ({ model: { text: 'hello' } }),
  update: (_: typeof Model.Type, message: Message) => ({ model: { text: message.value } }),
  view: (model: typeof Model.Type, h: HtmlBuilder<Message>) => ({
    title: 'Adoption',
    body: h.div(
      [],
      [
        h.input([h.Id('field'), h.Value(model.text), h.OnInput(value => Message.Typed({ value }))]),
        h.p([h.Id('echo')], [model.text]),
        h.div([h.Id('trusted'), h.InnerHTML('<b id="bold">server</b>')], []),
      ],
    ),
  }),
  container: null,
}

it('adopts a controlled input, trusted markup and their nodes, and the input still works', async () => {
  await serve(renderToString(config, { buildId: 'b' }))
  const field = document.getElementById('field') as HTMLInputElement
  const bold = document.getElementById('bold')

  hydrate(makeApplication({ ...config, container: root() }), { buildId: 'b' })
  await settle()

  expect(document.getElementById('field')).toBe(field)
  expect(field.value).toBe('hello')
  expect(document.getElementById('bold')).toBe(bold)

  field.value = 'typed'
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  expect(document.getElementById('echo')?.textContent).toBe('typed')
})
