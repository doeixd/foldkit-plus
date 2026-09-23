// @vitest-environment jsdom
/** Phase 0: the Document's head fields are in the served page before the runtime boots. */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { expect, it } from 'vitest'
import { renderToString } from 'foldkit/experimental/server'
import { serve } from './support.js'

const Model = Schema.Struct({})
const Message = defineMessageUnion({ Ping: {} })
const config = {
  Model,
  init: () => ({ model: {} }),
  update: (model: typeof Model.Type) => ({ model }),
  view: (_: typeof Model.Type, h: HtmlBuilder<typeof Message.Type>) => ({
    title: 'Served title',
    lang: 'fr',
    body: h.p([], ['Bonjour']),
  }),
  container: null,
}

it('stamps the title and language into the page it serves', async () => {
  const page = await serve(renderToString(config, { buildId: 'b' }))

  expect(page).toContain('<title>Served title</title>')
  expect(page).toContain('lang="fr"')
})
