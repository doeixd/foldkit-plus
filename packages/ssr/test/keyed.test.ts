// @vitest-environment jsdom
/** Phase 0: a keyed list is adopted row for row, and keeps its rows when reordered. */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { expect, it } from 'vitest'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { renderToString } from 'foldkit/experimental/server'
import { root, serve, settle } from './support.js'

const Model = Schema.Struct({ items: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ Reversed: {} })
type Message = typeof Message.Type
const config = {
  Model,
  init: () => ({ model: { items: ['a', 'b', 'c'] } }),
  update: (model: typeof Model.Type) => ({ model: { items: [...model.items].reverse() } }),
  view: (model: typeof Model.Type, h: HtmlBuilder<Message>) => ({
    title: 'List',
    body: h.div(
      [],
      [
        h.button([h.Id('reverse'), h.OnClick(Message.Reversed())], ['Reverse']),
        h.ul(
          [],
          model.items.map(item => h.keyed('li')(item, [], [item])),
        ),
      ],
    ),
  }),
  container: null,
}

const rows = () => Array.from(document.querySelectorAll('li'))

it('adopts each row, and moves the same rows when the order changes', async () => {
  await serve(renderToString(config, { buildId: 'b' }))
  const [a, b, c] = rows()

  hydrate(makeApplication({ ...config, container: root() }), { buildId: 'b' })
  await settle()
  expect(rows()).toEqual([a, b, c])

  document.getElementById('reverse')!.click()
  await settle()
  expect(rows()).toEqual([c, b, a])
})
