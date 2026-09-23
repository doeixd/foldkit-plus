// @vitest-environment jsdom
/** Phase 0: Flags cross in Foldkit's own payload, and the client's init receives them. */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { expect, it } from 'vitest'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { renderToString } from 'foldkit/experimental/server'
import { root, serve, settle } from './support.js'

const Flags = Schema.Struct({ theme: Schema.String })
const Model = Schema.Struct({ theme: Schema.String })
const Message = defineMessageUnion({ Ping: {} })
const received: string[] = []
const config = {
  Model,
  Flags,
  init: (flags: typeof Flags.Type) => {
    received.push(flags.theme)
    return { model: { theme: flags.theme } }
  },
  update: (model: typeof Model.Type) => ({ model }),
  view: (model: typeof Model.Type, h: HtmlBuilder<typeof Message.Type>) => ({
    title: 'Themed',
    body: h.p([h.Id('theme')], [model.theme]),
  }),
  container: null,
}

it('hands Flags to the client in its payload, and keeps the server nodes', async () => {
  await serve(renderToString(config, { buildId: 'b', flags: { theme: 'dark' } }))
  const served = document.getElementById('theme')

  hydrate(makeApplication({ ...config, container: root() }), { buildId: 'b' })
  await settle()

  // Once on the server, once on the client: Foldkit runs init on both.
  expect(received).toEqual(['dark', 'dark'])
  expect(document.getElementById('theme')).toBe(served)
  expect(document.querySelector('script[data-foldkit-flags]')).not.toBeNull()
})
