// @vitest-environment jsdom
/**
 * Virtual Mounts: the container reports its scroll position starting with
 * the current one, a window-scrolled list where the viewport lies over it,
 * rows report their border boxes through fakes, one Mount for a list's rows
 * in batches, and each disconnects on
 * teardown. A missing ResizeObserver silences rows instead of throwing.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MeasureRow,
  MeasureRows,
  RowMeasured,
  RowsMeasured,
  Viewport,
  ViewportPlaced,
  ViewportScrolled,
  WindowViewport,
} from '../src/state/index.js'
import { takeMessages } from './support.js'

type ResizeHandler = (
  entries: ReadonlyArray<{
    target: Element
    contentRect: { height: number }
    borderBoxSize: ReadonlyArray<{ blockSize: number }>
  }>,
) => void

const installResizeObserver = () => {
  const instances: Array<{
    readonly handler: ResizeHandler
    observed: Array<Element>
    disconnected: boolean
    fire: (height: number) => void
    fireAt: (sizes: ReadonlyArray<readonly [Element, number]>) => void
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
    unobserve = (element: Element) => {
      this.observed = this.observed.filter(each => each !== element)
    }
    disconnect = () => {
      this.disconnected = true
    }
    fire = (height: number) => {
      this.fireAt([[this.observed[0]!, height]])
    }
    // A row padded by 8px: its content box is that much shorter than its border box.
    fireAt = (sizes: ReadonlyArray<readonly [Element, number]>) => {
      this.handler(
        sizes.map(([target, height]) => ({
          target,
          contentRect: { height: height - 8 },
          borderBoxSize: [{ blockSize: height }],
        })),
      )
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

describe('WindowViewport', () => {
  it('reports the viewport over the box on mount, on scroll, resize and a resize of the page, once each', async () => {
    const instances = installResizeObserver()
    const box = document.createElement('div')
    document.body.appendChild(box)
    let top = 300
    box.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: top, width: 100, height: 50 })
    const scrolled = () => window.dispatchEvent(new window.Event('scroll'))
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(WindowViewport().f(box, Mount.liveViewStateChanges), 4),
          )
          for (let i = 0; i < 100 && instances.length === 0; i++) {
            yield* Effect.yieldNow
          }
          expect(instances[0]!.observed).toEqual([box, document.documentElement])
          // An unchanged reading is not sent again.
          scrolled()
          top = -120
          scrolled()
          vi.stubGlobal('innerHeight', 500)
          window.dispatchEvent(new window.Event('resize'))
          // Content above grew: the box moved down with no scroll.
          top = 80
          instances[0]!.fire(0)
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([
        ViewportPlaced.make({ top: -300, height: 768 }),
        ViewportPlaced.make({ top: 120, height: 768 }),
        ViewportPlaced.make({ top: 120, height: 500 }),
        ViewportPlaced.make({ top: -80, height: 500 }),
      ])
      expect(instances[0]!.disconnected).toBe(true)
    } finally {
      box.remove()
    }
  })

  it('stops listening to the window on teardown', async () => {
    const box = document.createElement('div')
    document.body.appendChild(box)
    const removed = vi.spyOn(window, 'removeEventListener')
    try {
      await Effect.runPromise(takeMessages(WindowViewport().f(box, Mount.liveViewStateChanges), 1))
      expect(removed.mock.calls.map(([type]) => type).sort()).toEqual(['resize', 'scroll'])
    } finally {
      removed.mockRestore()
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

describe('MeasureRows', () => {
  const settle = Effect.gen(function* () {
    for (let i = 0; i < 100; i++) yield* Effect.yieldNow
    // The MutationObserver reports in a microtask of its own.
    yield* Effect.promise(() => new Promise(resolve => setTimeout(resolve, 0)))
  })

  const row = (key: string) => {
    const element = document.createElement('div')
    element.setAttribute('data-key', key)
    return element
  }

  it('observes the keyed rows, follows rows drawn and gone, and reports a batch at once', async () => {
    const instances = installResizeObserver()
    const list = document.createElement('div')
    const [a, b, c] = [row('a'), row('b'), row('c')]
    const spacer = document.createElement('div')
    list.append(spacer, a, b)
    document.body.appendChild(list)
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(
              MeasureRows({ attribute: 'data-key' }).f(list, Mount.liveViewStateChanges),
              2,
            ),
          )
          yield* settle
          const sizes = instances[0]!
          expect(sizes.observed).toEqual([a, b])
          list.append(c)
          a.remove()
          yield* settle
          expect(sizes.observed).toEqual([b, c])
          sizes.fireAt([
            [b, 30],
            [c, 42],
          ])
          sizes.fireAt([[spacer, 99]])
          sizes.fireAt([[c, 44]])
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([
        RowsMeasured.make({
          rows: [
            { key: 'b', height: 30 },
            { key: 'c', height: 42 },
          ],
        }),
        RowsMeasured.make({ rows: [{ key: 'c', height: 44 }] }),
      ])
      expect(instances[0]!.disconnected).toBe(true)
    } finally {
      list.remove()
    }
  })
})
