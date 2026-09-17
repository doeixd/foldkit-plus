// @vitest-environment jsdom
/**
 * Virtual Mounts: the container reports its scroll position starting with
 * the current one, rows report heights through fakes, and both disconnect
 * on teardown. A missing ResizeObserver silences rows instead of throwing.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeasureRow, RowMeasured, Viewport, ViewportScrolled } from '../src/state/index.js'
import { takeMessages } from './support.js'

type ResizeHandler = (entries: ReadonlyArray<{ contentRect: { height: number } }>) => void

const installResizeObserver = () => {
  const instances: Array<{
    readonly handler: ResizeHandler
    observed: Array<Element>
    disconnected: boolean
    fire: (height: number) => void
  }> = []
  class FakeResizeObserver {
    readonly handler: ResizeHandler
    observed: Array<Element> = []
    disconnected = false
    constructor(handler: ResizeHandler) {
      this.handler = handler
      instances.push(this)
    }
    observe = (element: Element) => {
      this.observed.push(element)
    }
    unobserve = () => undefined
    disconnect = () => {
      this.disconnected = true
    }
    fire = (height: number) => {
      this.handler([{ contentRect: { height } }])
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return instances
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Viewport', () => {
  it('starts with the current position, then follows scrolls', async () => {
    const box = document.createElement('div')
    document.body.appendChild(box)
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(Viewport().f(box, Mount.liveViewStateChanges), 2),
          )
          for (let i = 0; i < 100; i++) {
            yield* Effect.yieldNow
          }
          box.scrollTop = 40
          box.dispatchEvent(new window.Event('scroll'))
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([
        ViewportScrolled.make({ top: 0 }),
        ViewportScrolled.make({ top: 40 }),
      ])
    } finally {
      box.remove()
    }
  })
})

describe('MeasureRow', () => {
  it('reports the row key with its height and disconnects after', async () => {
    const instances = installResizeObserver()
    const row = document.createElement('div')
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(MeasureRow({ key: 'b' }).f(row, Mount.liveViewStateChanges), 2),
        )
        for (let i = 0; i < 100 && instances.length === 0; i++) {
          yield* Effect.yieldNow
        }
        expect(instances).toHaveLength(1)
        expect(instances[0]!.observed).toEqual([row])
        instances[0]!.fire(30)
        instances[0]!.fire(32)
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      RowMeasured.make({ key: 'b', height: 30 }),
      RowMeasured.make({ key: 'b', height: 32 }),
    ])
    expect(instances[0]!.disconnected).toBe(true)
  })

  it('emits nothing without ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    await expect(
      Effect.runPromise(
        takeMessages(
          MeasureRow({ key: 'b' }).f(document.createElement('div'), Mount.liveViewStateChanges),
          1,
          '100 millis',
        ),
      ),
    ).rejects.toThrow(/stalled/)
  })
})
