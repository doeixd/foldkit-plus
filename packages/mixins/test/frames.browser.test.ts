/**
 * `Frames.track` over the browser's own `requestAnimationFrame`: `settle`
 * resolves once a click's change is drawn, with no stub and no sleep.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Frames } from 'foldkit-mixins/testing'
import { expect, test, vi } from 'vitest'

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Clicked: {} })
type Message = typeof Message.Type

test('settles once a change is drawn by the browser’s own frames', async () => {
  const frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'frames-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { count: 0 } }),
      update: (model: Model, message: Message) =>
        Message.match(message, { Clicked: () => ({ model: { count: model.count + 1 } }) }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.button([h.Id('count'), h.OnClick(Message.Clicked())], [String(model.count)]),
    }),
  )
  const button = () => document.getElementById('count')
  try {
    // A runtime still starting has asked for no frame yet: wait for its first drawing.
    await vi.waitFor(() => expect(button()?.textContent).toBe('0'))
    button()!.click()
    await frames.settle()
    expect(button()?.textContent).toBe('1')
  } finally {
    handle.dispose()
    frames.dispose()
  }
})
