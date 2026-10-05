// @vitest-environment jsdom
/**
 * `Frames.track` on the real runtime: held, nothing is drawn, so events meet
 * the view as last drawn; released, the frames run and the page shows every
 * change made meanwhile; and `settle` resolves once the page has drawn what
 * it was asked to, without a sleep.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Render from 'foldkit/render'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Frames } from 'foldkit-mixins/testing'
import { afterEach, expect, test, vi } from 'vitest'

const Model = Schema.Struct({ count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Clicked: {}, Drawn: {} })
type Message = typeof Message.Type

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/**
 * A page that counts clicks; with `chain`, the first click's draw, once
 * committed, sends one more change, as a Command waiting on a frame does.
 */
const mount = (frameDelay: number, chain = false) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), frameDelay),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'frames'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { count: 0 } }),
      update: (model: Model, message: Message): Update.Return<Model, Message> =>
        Message.match(message, {
          Clicked: () => ({
            model: { count: model.count + 1 },
            commands:
              chain && model.count === 0
                ? [
                    {
                      name: 'after-draw',
                      effect: Render.afterCommit.pipe(Effect.as(Message.Drawn())),
                    },
                  ]
                : [],
          }),
          Drawn: () => ({ model: { count: model.count + 10 } }),
        }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.button([h.Id('count'), h.OnClick(Message.Clicked())], [String(model.count)]),
    }),
  )
  const button = () => document.getElementById('count')
  // A runtime still starting has asked for no frame yet, so `settle` cannot
  // wait for its first drawing: wait for that, and settle what follows.
  const booted = () => vi.waitFor(() => expect(button()?.textContent).toBe('0'))
  return { frames, handle, button, booted }
}

test('holds drawing until released, and then draws what changed meanwhile', async () => {
  const { frames, handle, button, booted } = mount(0)
  try {
    await booted()
    frames.hold()
    button()!.click()
    button()!.click()
    await expect(frames.settle()).rejects.toThrow(/frames are held/)
    // Two clicks, and every frame they asked for held: nothing drawn yet.
    expect(button()?.textContent).toBe('0')
    frames.release()
    await frames.settle()
    expect(button()?.textContent).toBe('2')
  } finally {
    handle.dispose()
    frames.dispose()
  }
})

test('settle waits for a frame slower than a turn of the event loop', async () => {
  const { frames, handle, button, booted } = mount(15)
  try {
    await booted()
    button()!.click()
    await frames.settle()
    expect(button()?.textContent).toBe('1')
  } finally {
    handle.dispose()
    frames.dispose()
  }
})

test('settle waits for what a drawn frame went on to change', async () => {
  const { frames, handle, button, booted } = mount(5, true)
  try {
    await booted()
    button()!.click()
    await frames.settle()
    expect(button()?.textContent).toBe('11')
  } finally {
    handle.dispose()
    frames.dispose()
  }
})

test('settle with nothing to draw does not wait for a frame', async () => {
  // A frame far slower than a turn of the event loop, so only waiting for one fails this.
  const { frames, handle, booted } = mount(400)
  try {
    await booted()
    const started = performance.now()
    await frames.settle()
    expect(performance.now() - started).toBeLessThan(200)
  } finally {
    handle.dispose()
    frames.dispose()
  }
})

test('settle gives up on frames that never stop, and says why', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  const frames = Frames.track()
  let spinning = true
  const spin = () => {
    if (spinning) requestAnimationFrame(spin)
  }
  try {
    requestAnimationFrame(spin)
    await expect(frames.settle()).rejects.toThrow(/still drawing after 50 rounds/)
  } finally {
    spinning = false
    frames.dispose()
  }
})
