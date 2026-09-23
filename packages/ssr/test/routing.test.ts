// @vitest-environment jsdom
/** Phase 0: a routing application renders the requested route and hydrates on it. */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { Url } from 'foldkit/url'
import { expect, it } from 'vitest'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { renderToString } from 'foldkit/experimental/server'
import { root, serve, settle } from './support.js'

const Model = Schema.Struct({ path: Schema.String })
const Message = defineMessageUnion({ Requested: {}, Changed: { path: Schema.String } })
type Message = typeof Message.Type
const paths: string[] = []
const config = {
  Model,
  routing: {
    onUrlRequest: () => Message.Requested(),
    onUrlChange: (url: Url) => Message.Changed({ path: url.pathname }),
  },
  init: (url: Url) => {
    paths.push(url.pathname)
    return { model: { path: url.pathname } }
  },
  update: (model: typeof Model.Type, message: Message) =>
    message._tag === 'Changed' ? { model: { path: message.path } } : { model },
  view: (model: typeof Model.Type, h: HtmlBuilder<Message>) => ({
    title: 'Routes',
    body: h.p([h.Id('route')], [model.path]),
  }),
  container: null,
}

it('renders the requested route, and hydrates on the same one', async () => {
  window.history.replaceState(null, '', '/about')
  await serve(renderToString(config, { buildId: 'b', url: 'http://localhost/about' }))
  const served = document.getElementById('route')
  expect(served?.textContent).toBe('/about')

  hydrate(makeApplication({ ...config, container: root() }), { buildId: 'b' })
  await settle()

  expect(paths).toEqual(['/about', '/about'])
  expect(document.getElementById('route')).toBe(served)
})
