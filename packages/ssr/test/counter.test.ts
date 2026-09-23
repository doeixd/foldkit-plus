// @vitest-environment jsdom
/**
 * Phase 0: through `foldkit-ssr`, a page renders and hydrates exactly as it does
 * through Foldkit. The server's nodes are adopted, not rebuilt, and a page from
 * another build is refused.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { afterEach, describe, expect, it } from 'vitest'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { renderToString } from 'foldkit/experimental/server'
import { root, serve, settle } from './support.js'

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Clicked: {} })
type Message = typeof Message.Type

let inits = 0
const config = {
  Model,
  init: () => {
    inits++
    return { model: { count: 41 } }
  },
  update: (model: Model, _message: Message) => ({ model: { count: model.count + 1 } }),
  view: (model: Model, h: HtmlBuilder<Message>) => {
    return {
      title: 'Counter',
      body: h.button([h.Id('count'), h.OnClick(Message.Clicked())], [String(model.count)]),
    }
  },
  container: null,
}

afterEach(() => {
  inits = 0
})

describe('foldkit-ssr, Phase 0', () => {
  it('hydrates the server render, keeping its nodes, and the page works', async () => {
    await serve(renderToString(config, { buildId: 'build-1' }))
    const served = document.getElementById('count')
    expect(served?.textContent).toBe('41')
    inits = 0

    hydrate(makeApplication({ ...config, container: root() }), { buildId: 'build-1' })
    await settle()

    expect(document.getElementById('count')).toBe(served)
    expect(inits).toBe(1)
    served?.click()
    await settle()
    expect(document.getElementById('count')?.textContent).toBe('42')
  })
})
