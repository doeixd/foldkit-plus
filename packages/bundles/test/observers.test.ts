// @vitest-environment jsdom
/**
 * Resize and Intersection Mounts: observer events become Messages, teardown
 * disconnects, and a missing observer emits nothing instead of throwing.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Bounds,
  Intersection,
  IntersectionChanged,
  Measured,
  Mutated,
  Mutation,
  Resized,
  Resize,
} from '../src/observers/index.js'
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

type MutationHandler = (
  records: ReadonlyArray<{
    type: string
    addedNodes: ReadonlyArray<{ nodeName: string }>
    removedNodes: ReadonlyArray<{ nodeName: string }>
    attributeName: string | null
  }>,
) => void

const installMutationObserver = () => {
  const instances: Array<{
    readonly handler: MutationHandler
    observed: Array<Element>
    options: Array<Record<string, boolean>>
    disconnected: boolean
    fire: (records: Parameters<MutationHandler>[0]) => void
  }> = []
  class FakeMutationObserver {
    readonly handler: MutationHandler
    observed: Array<Element> = []
    options: Array<Record<string, boolean>> = []
    disconnected = false
    constructor(handler: MutationHandler) {
      this.handler = handler
      instances.push(this)
    }
    observe = (element: Element, options: Record<string, boolean>) => {
      this.observed.push(element)
      this.options.push(options)
    }
    disconnect = () => {
      this.disconnected = true
    }
    fire = (records: Parameters<MutationHandler>[0]) => {
      this.handler(records)
    }
  }
  vi.stubGlobal('MutationObserver', FakeMutationObserver)
  return instances
}

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

describe('Mutation', () => {
  it('reports child, attribute, and text changes as Mutated', async () => {
    const instances = installMutationObserver()
    const el = element()
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(Mutation().f(el, Mount.liveViewStateChanges), 3),
        )
        for (let i = 0; i < 100 && instances.length === 0; i++) {
          yield* Effect.yieldNow
        }
        expect(instances).toHaveLength(1)
        expect(instances[0]!.observed).toEqual([el])
        expect(instances[0]!.options).toEqual([
          { childList: true, attributes: true, characterData: true, subtree: true },
        ])
        instances[0]!.fire([
          {
            type: 'childList',
            addedNodes: [{ nodeName: 'DIV' }],
            removedNodes: [{ nodeName: 'SPAN' }],
            attributeName: null,
          },
        ])
        instances[0]!.fire([
          { type: 'attributes', addedNodes: [], removedNodes: [], attributeName: 'class' },
        ])
        instances[0]!.fire([
          { type: 'characterData', addedNodes: [], removedNodes: [], attributeName: null },
        ])
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      Mutated.make({ type: 'childList', added: ['DIV'], removed: ['SPAN'], attribute: null }),
      Mutated.make({ type: 'attributes', added: [], removed: [], attribute: 'class' }),
      Mutated.make({ type: 'characterData', added: [], removed: [], attribute: null }),
    ])
    expect(instances[0]!.disconnected).toBe(true)
  })

  it('ignores unknown record types', async () => {
    const instances = installMutationObserver()
    const el = element()
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(Mutation().f(el, Mount.liveViewStateChanges), 1, '100 millis'),
        )
        for (let i = 0; i < 100 && instances.length === 0; i++) {
          yield* Effect.yieldNow
        }
        instances[0]!.fire([
          { type: 'mystery', addedNodes: [], removedNodes: [], attributeName: null },
        ])
        instances[0]!.fire([
          {
            type: 'childList',
            addedNodes: [{ nodeName: 'P' }],
            removedNodes: [],
            attributeName: null,
          },
        ])
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      Mutated.make({ type: 'childList', added: ['P'], removed: [], attribute: null }),
    ])
  })

  it('emits nothing without MutationObserver', async () => {
    vi.stubGlobal('MutationObserver', undefined)
    await expect(
      Effect.runPromise(
        takeMessages(Mutation().f(element(), Mount.liveViewStateChanges), 1, '100 millis'),
      ),
    ).rejects.toThrow(/stalled/)
  })
})

describe('Bounds', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

  const stubRect = (
    el: Element,
    values: { x: number; y: number; width: number; height: number },
  ) => {
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ ...values }),
      configurable: true,
    })
  }

  it('measures now, then on observer, scroll, and resize', async () => {
    const instances = installResizeObserver()
    const el = element()
    stubRect(el, rect(1, 2, 100, 50))
    let added = 0
    let removed = 0
    const origAdd = window.addEventListener
    const origRemove = window.removeEventListener
    window.addEventListener = ((...args: Array<unknown>) => {
      added++
      return (origAdd as (...a: Array<unknown>) => void)(...args)
    }) as typeof window.addEventListener
    window.removeEventListener = ((...args: Array<unknown>) => {
      removed++
      return (origRemove as (...a: Array<unknown>) => void)(...args)
    }) as typeof window.removeEventListener
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(Bounds().f(el, Mount.liveViewStateChanges), 4),
          )
          for (let i = 0; i < 100 && instances.length === 0; i++) {
            yield* Effect.yieldNow
          }
          expect(instances).toHaveLength(1)
          stubRect(el, rect(1, 2, 200, 50))
          instances[0]!.fire(200, 50)
          for (let i = 0; i < 10; i++) {
            yield* Effect.yieldNow
          }
          stubRect(el, rect(5, 10, 200, 50))
          window.dispatchEvent(new window.Event('scroll'))
          for (let i = 0; i < 10; i++) {
            yield* Effect.yieldNow
          }
          stubRect(el, rect(5, 10, 300, 50))
          window.dispatchEvent(new window.Event('resize'))
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([
        Measured.make(rect(1, 2, 100, 50)),
        Measured.make(rect(1, 2, 200, 50)),
        Measured.make(rect(5, 10, 200, 50)),
        Measured.make(rect(5, 10, 300, 50)),
      ])
      expect(instances[0]!.disconnected).toBe(true)
      expect(added).toBe(2)
      expect(removed).toBe(2)
    } finally {
      window.addEventListener = origAdd
      window.removeEventListener = origRemove
    }
  })

  it('still measures on window events without ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const el = element()
    stubRect(el, rect(0, 0, 10, 10))
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(Bounds().f(el, Mount.liveViewStateChanges), 2),
        )
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        stubRect(el, rect(0, 5, 10, 10))
        window.dispatchEvent(new window.Event('scroll'))
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([Measured.make(rect(0, 0, 10, 10)), Measured.make(rect(0, 5, 10, 10))])
  })
})
