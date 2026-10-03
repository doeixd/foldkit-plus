// @vitest-environment jsdom
import { Duration, Effect, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { Bundle } from 'foldkit-bundle'
import { GridViewport } from 'foldkit-data-grid'
import { afterEach, describe, expect, test, vi } from 'vitest'

const takeMessages = <A, E>(stream: Stream.Stream<A, E>, count: number) =>
  stream.pipe(
    Stream.take(count),
    Stream.runCollect,
    Effect.timeoutOrElse({
      duration: Duration.seconds(2),
      orElse: () => Effect.fail(new Error(`stream stalled: fewer than ${count} messages`)),
    }),
  )

const scroller = (geometry: { top: number; left: number; width: number; height: number }) => {
  const element = document.createElement('div')
  Object.defineProperty(element, 'clientWidth', { get: () => geometry.width })
  Object.defineProperty(element, 'clientHeight', { get: () => geometry.height })
  element.scrollTop = geometry.top
  element.scrollLeft = geometry.left
  return element
}

const measured = (top: number, left: number, width: number, height: number) =>
  GridViewport.Message.Measured({ top, left, width, height })

const installResizeObserver = () => {
  const instances: Array<{ fire: () => void; observed: Array<Element>; disconnected: boolean }> = []
  class FakeResizeObserver {
    observed: Array<Element> = []
    disconnected = false
    constructor(readonly handler: () => void) {
      instances.push(this)
    }
    observe = (element: Element) => {
      this.observed.push(element)
    }
    unobserve = () => undefined
    disconnect = () => {
      this.disconnected = true
    }
    fire = () => this.handler()
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return instances
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(Effect.scoped(effect))

// A forked stream attaches its listeners on the scheduler; let it settle first.
const settle = Effect.gen(function* () {
  for (let i = 0; i < 100; i++) yield* Effect.yieldNow
})

describe('GridViewport.Measure', () => {
  test('reports the geometry when it mounts, then on each scroll and resize', async () => {
    const observers = installResizeObserver()
    const geometry = { top: 0, left: 0, width: 300, height: 100 }
    const element = scroller(geometry)
    const messages = await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(GridViewport.Measure().f(element, Mount.liveViewStateChanges), 3),
        )
        yield* settle
        element.scrollTop = 250
        element.scrollLeft = 40
        element.dispatchEvent(new Event('scroll'))
        geometry.width = 500
        observers[0]!.fire()
        return yield* Fiber.join(fiber)
      }),
    )
    expect(messages).toEqual([
      measured(0, 0, 300, 100),
      measured(250, 40, 300, 100),
      measured(250, 40, 500, 100),
    ])
    expect(observers[0]!.observed).toEqual([element])
  })

  test('stops listening when it unmounts', async () => {
    const observers = installResizeObserver()
    const element = scroller({ top: 0, left: 0, width: 300, height: 100 })
    const removed = vi.spyOn(element, 'removeEventListener')
    await run(takeMessages(GridViewport.Measure().f(element, Mount.liveViewStateChanges), 1))
    expect(observers[0]!.disconnected).toBe(true)
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  test('still reports scrolls without ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const element = scroller({ top: 0, left: 0, width: 300, height: 100 })
    const messages = await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(GridViewport.Measure().f(element, Mount.liveViewStateChanges), 2),
        )
        yield* settle
        element.scrollTop = 25
        element.dispatchEvent(new Event('scroll'))
        return yield* Fiber.join(fiber)
      }),
    )
    expect(messages).toEqual([measured(0, 0, 300, 100), measured(25, 0, 300, 100)])
  })

  test('attaches nothing when ResizeObserver cannot be built', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor() {
          throw new Error('no observers here')
        }
      },
    )
    const element = scroller({ top: 0, left: 0, width: 300, height: 100 })
    const added = vi.spyOn(element, 'addEventListener')
    await Effect.runPromiseExit(
      Effect.scoped(takeMessages(GridViewport.Measure().f(element, Mount.liveViewStateChanges), 1)),
    )
    expect(added).not.toHaveBeenCalled()
  })
})

const Placement = Bundle.declare(GridViewport.bundle, 'viewport')
const Model = Schema.Struct({ ...Placement.fields })
const Message = defineMessageUnion({ ...Placement.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Placement)
const start = placed.init({ viewport: { top: 9, left: 9, width: 9, height: 9 } }).model
const send = (model: typeof start, message: typeof GridViewport.Message.Type) =>
  Option.getOrThrow(placed.update(model, Placement.wrapper.make(message))).model

describe('GridViewport placement', () => {
  test('starts at nothing scrolled and no size', () => {
    expect(start.viewport).toEqual({ top: 0, left: 0, width: 0, height: 0 })
  })

  test('keeps the measured geometry', () => {
    expect(send(start, measured(250, 40, 300, 100)).viewport).toEqual({
      top: 250,
      left: 40,
      width: 300,
      height: 100,
    })
  })

  test('a reveal moves only the offsets', () => {
    const sized = send(start, measured(0, 0, 300, 100))
    expect(send(sized, GridViewport.Message.Revealed({ top: 125, left: 10 })).viewport).toEqual({
      top: 125,
      left: 10,
      width: 300,
      height: 100,
    })
  })

  test('reads an overscroll as the edge and ignores a reading that is not a number', () => {
    const sized = send(start, measured(10, 10, 300, 100))
    expect(send(sized, measured(-30, Number.NaN, 300, Number.POSITIVE_INFINITY)).viewport).toEqual({
      top: 0,
      left: 10,
      width: 300,
      height: 100,
    })
  })

  test('an unchanged reading returns the Model it was given', () => {
    const sized = send(start, measured(10, 10, 300, 100))
    expect(send(sized, measured(10, 10, 300, 100))).toBe(sized)
    expect(send(sized, measured(10, Number.NaN, 300, 100))).toBe(sized)
  })
})

describe('GridViewport.scrollTo', () => {
  test('scrolls the container and reports the offsets', async () => {
    const element = scroller({ top: 0, left: 0, width: 300, height: 100 })
    element.id = 'grid:viewport'
    const scrolled = vi.fn()
    element.scrollTo = scrolled
    document.body.append(element)
    try {
      const message = await Effect.runPromise(
        GridViewport.scrollTo('grid:viewport', { top: 125, left: 10 }).effect,
      )
      expect(scrolled).toHaveBeenCalledWith({ top: 125, left: 10 })
      expect(message).toEqual(GridViewport.Message.Revealed({ top: 125, left: 10 }))
    } finally {
      element.remove()
    }
  })

  test('reports the offsets from a container that cannot scroll', async () => {
    const element = document.createElement('div')
    element.id = 'grid:static'
    Object.defineProperty(element, 'scrollTo', { value: undefined })
    document.body.append(element)
    try {
      const message = await Effect.runPromise(
        GridViewport.scrollTo('grid:static', { top: 7, left: 0 }).effect,
      )
      expect(message).toEqual(GridViewport.Message.Revealed({ top: 7, left: 0 }))
    } finally {
      element.remove()
    }
  })

  test('still reports the offsets when the container is gone', async () => {
    const message = await Effect.runPromise(
      GridViewport.scrollTo('missing', { top: 5, left: 0 }).effect,
    )
    expect(message).toEqual(GridViewport.Message.Revealed({ top: 5, left: 0 }))
  })
})
