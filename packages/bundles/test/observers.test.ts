// @vitest-environment jsdom
/**
 * Resize and Intersection Mounts: observer events become Messages, teardown
 * disconnects, and a missing observer emits nothing instead of throwing.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Intersection, IntersectionChanged, Resized, Resize } from '../src/observers/index.js'
import { takeMessages } from './support.js'

type ResizeHandler = (
  entries: ReadonlyArray<{ contentRect: { width: number; height: number } }>,
) => void
type IntersectionHandler = (
  entries: ReadonlyArray<{ isIntersecting: boolean; intersectionRatio: number }>,
) => void

const installResizeObserver = () => {
  const instances: Array<{
    readonly handler: ResizeHandler
    observed: Array<Element>
    disconnected: boolean
    fire: (width: number, height: number) => void
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
      this.observed = this.observed.filter(other => other !== element)
    }
    disconnect = () => {
      this.disconnected = true
    }
    fire = (width: number, height: number) => {
      this.handler([{ contentRect: { width, height } }])
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return instances
}

const installIntersectionObserver = () => {
  const instances: Array<{
    readonly handler: IntersectionHandler
    disconnected: boolean
    fire: (isIntersecting: boolean, ratio: number) => void
  }> = []
  class FakeIntersectionObserver {
    readonly handler: IntersectionHandler
    disconnected = false
    constructor(handler: IntersectionHandler) {
      this.handler = handler
      instances.push(this)
    }
    observe = (_element: Element) => undefined
    unobserve = (_element: Element) => undefined
    disconnect = () => {
      this.disconnected = true
    }
    fire = (isIntersecting: boolean, ratio: number) => {
      this.handler([{ isIntersecting, intersectionRatio: ratio }])
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  return instances
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const element = () => document.createElement('div')

describe('Resize', () => {
  it('reports content-box changes as Resized', async () => {
    const instances = installResizeObserver()
    const el = element()
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(Resize().f(el, Mount.liveViewStateChanges), 2),
        )
        for (let i = 0; i < 100 && instances.length === 0; i++) {
          yield* Effect.yieldNow
        }
        expect(instances).toHaveLength(1)
        expect(instances[0]!.observed).toEqual([el])
        instances[0]!.fire(100, 50)
        instances[0]!.fire(200, 50)
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      Resized.make({ width: 100, height: 50 }),
      Resized.make({ width: 200, height: 50 }),
    ])
    expect(instances).toHaveLength(1)
    expect(instances[0]!.disconnected).toBe(true)
  })

  it('emits nothing without ResizeObserver', async () => {
    await expect(
      Effect.runPromise(
        takeMessages(Resize().f(element(), Mount.liveViewStateChanges), 1, '100 millis'),
      ),
    ).rejects.toThrow(/stalled/)
  })
})

describe('Intersection', () => {
  it('reports viewport crossings', async () => {
    const instances = installIntersectionObserver()
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(Intersection().f(element(), Mount.liveViewStateChanges), 2),
        )
        for (let i = 0; i < 100 && instances.length === 0; i++) {
          yield* Effect.yieldNow
        }
        expect(instances).toHaveLength(1)
        instances[0]!.fire(true, 0.5)
        instances[0]!.fire(false, 0)
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      IntersectionChanged.make({ isIntersecting: true, ratio: 0.5 }),
      IntersectionChanged.make({ isIntersecting: false, ratio: 0 }),
    ])
    expect(instances[0]!.disconnected).toBe(true)
  })
})
