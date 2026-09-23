// @vitest-environment jsdom
/**
 * Phase 0: a custom element the view declares without children owns its light
 * DOM, and hydration leaves what the element put there alone.
 */
import { Schema } from 'effect'
import { define } from 'foldkit/customElement'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { expect, it } from 'vitest'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { renderToString } from 'foldkit/experimental/server'
import { root, serve, settle } from './support.js'

const Message = defineMessageUnion({ Ping: {} })
type Message = typeof Message.Type
const Greeting = define({ tag: 'x-greeting', properties: {}, events: {} })

// The element renders its own contents once it is in the document.
customElements.define(
  'x-greeting',
  class extends HTMLElement {
    connectedCallback() {
      if (this.firstChild === null) this.innerHTML = '<span id="inside">hello</span>'
    }
  },
)

const Model = Schema.Struct({})
const config = {
  Model,
  init: () => ({ model: {} }),
  update: (model: typeof Model.Type) => ({ model }),
  view: (_: typeof Model.Type, h: HtmlBuilder<Message>) => ({
    title: 'Element',
    body: h.div([], [Greeting.withMessage(h)([h.Id('greeting')], [])]),
  }),
  container: null,
}

it('adopts the element and keeps the contents it rendered itself', async () => {
  await serve(renderToString(config, { buildId: 'b' }))
  const element = document.getElementById('greeting')
  const inside = document.getElementById('inside')
  expect(inside?.textContent).toBe('hello')

  hydrate(makeApplication({ ...config, container: root() }), { buildId: 'b' })
  await settle()

  expect(document.getElementById('greeting')).toBe(element)
  expect(document.getElementById('inside')).toBe(inside)
})
