// @vitest-environment jsdom
/** Phase 0: a page from another build is refused and contained, as Foldkit refuses it. */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { expect, it } from 'vitest'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { renderToString } from 'foldkit/experimental/server'
import { root, serve, settle } from './support.js'

const Model = Schema.Struct({ count: Schema.Number })
const Message = defineMessageUnion({ Clicked: {} })
let inits = 0
const config = {
  Model,
  init: () => {
    inits++
    return { model: { count: 1 } }
  },
  update: (model: typeof Model.Type) => ({ model }),
  view: (model: typeof Model.Type, h: HtmlBuilder<typeof Message.Type>) => ({
    title: 'Counter',
    body: h.p([], [String(model.count)]),
  }),
  container: null,
}

it('refuses a page served by another build, without running init', async () => {
  await serve(renderToString(config, { buildId: 'build-1' }))
  inits = 0

  hydrate(makeApplication({ ...config, container: root() }), { buildId: 'build-2' })
  await settle()

  expect(inits).toBe(0)
  expect(document.body.inert).toBe(true)
})
