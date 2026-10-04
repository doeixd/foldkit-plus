// @vitest-environment jsdom
/**
 * `Frames.hold` on the real runtime: while the page's frames are held nothing
 * is drawn, so events meet the view as last drawn; released, the frames run
 * and the page shows every change made meanwhile.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Frames } from 'foldkit-mixins/testing'
import { afterEach, expect, test, vi } from 'vitest'

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Clicked: {} })
type Message = typeof Message.Type

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

test('holds drawing until released, and then draws what changed meanwhile', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'frames'
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
    await vi.waitFor(() => expect(button()?.textContent).toBe('0'))
    const frames = Frames.hold()
    button()!.click()
    await new Promise(resolve => setTimeout(resolve, 30))
    button()!.click()
    await new Promise(resolve => setTimeout(resolve, 30))
    // Two clicks, and time for frames to have run: nothing drawn yet.
    expect(button()?.textContent).toBe('0')
    frames.release()
    await vi.waitFor(() => expect(button()?.textContent).toBe('2'))
  } finally {
    handle.dispose()
  }
})
