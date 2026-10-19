// @vitest-environment jsdom
/**
 * Swipe: Move's deltas, and the speed of the release over the last 100ms by
 * the events' time stamps: a flick is fast, a drag that rested before it
 * came up is still, a cancel reports no speed, and a second pointer is
 * ignored.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { describe, expect, it } from 'vitest'
import { Swipe, SwipeEnded, SwipeStarted, Swiped, velocityOf } from '../src/dom/index.js'
import { takeMessages } from './support.js'

const fire = (element: Element, type: string, at: number, init: Record<string, unknown>) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  Object.defineProperty(event, 'timeStamp', { value: at })
  element.dispatchEvent(event)
}

/** Runs `gesture` on a fresh handle and collects the first `count` facts. */
const facts = (count: number, gesture: (handle: HTMLElement) => void, slop?: number) => {
  const handle = document.createElement('div')
  document.body.appendChild(handle)
  return Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        takeMessages(
          Swipe(slop === undefined ? {} : { slop }).f(handle, Mount.liveViewStateChanges),
          count,
        ),
      )
      for (let i = 0; i < 50; i++) yield* Effect.yieldNow
      gesture(handle)
      return yield* Fiber.join(fiber)
    }),
  ).finally(() => handle.remove())
}

const down = { pointerId: 1, button: 0, pointerType: 'touch', clientX: 0, clientY: 100 }

describe('Swipe', () => {
  it('reports deltas, and a flick’s speed as it comes up', async () => {
    const seen = await facts(5, handle => {
      fire(handle, 'pointerdown', 0, down)
      // Slowly at first, long before the release: outside the window.
      fire(handle, 'pointermove', 400, { pointerId: 1, clientX: 0, clientY: 110 })
      // Then fast: 100px from the first move in the last 100ms to the release.
      fire(handle, 'pointermove', 500, { pointerId: 1, clientX: 0, clientY: 210 })
      fire(handle, 'pointermove', 570, { pointerId: 1, clientX: 0, clientY: 310 })
      fire(handle, 'pointerup', 580, { pointerId: 1, clientX: 0, clientY: 310 })
    })
    expect(seen).toEqual([
      SwipeStarted.make({ pointerId: 1, pointerType: 'touch', width: 0, height: 0 }),
      Swiped.make({ pointerId: 1, deltaX: 0, deltaY: 10 }),
      Swiped.make({ pointerId: 1, deltaX: 0, deltaY: 110 }),
      Swiped.make({ pointerId: 1, deltaX: 0, deltaY: 210 }),
      SwipeEnded.make({
        pointerId: 1,
        deltaX: 0,
        deltaY: 210,
        velocityX: 0,
        velocityY: 100 / 80,
        completed: true,
      }),
    ])
  })

  it('reports no speed when the pointer rested before it came up', async () => {
    const seen = await facts(3, handle => {
      fire(handle, 'pointerdown', 0, down)
      fire(handle, 'pointermove', 50, { pointerId: 1, clientX: 0, clientY: 300 })
      fire(handle, 'pointerup', 400, { pointerId: 1, clientX: 0, clientY: 300 })
    })
    expect(seen.at(-1)).toEqual(
      SwipeEnded.make({
        pointerId: 1,
        deltaX: 0,
        deltaY: 200,
        velocityX: 0,
        velocityY: 0,
        completed: true,
      }),
    )
  })

  it('ignores a second pointer, and ends a cancel at the last move with no speed', async () => {
    const seen = await facts(3, handle => {
      fire(handle, 'pointerdown', 0, down)
      fire(handle, 'pointerdown', 5, { ...down, pointerId: 2 })
      fire(handle, 'pointermove', 10, { pointerId: 2, clientX: 50, clientY: 50 })
      fire(handle, 'pointermove', 20, { pointerId: 1, clientX: 0, clientY: 160 })
      fire(handle, 'pointercancel', 30, { pointerId: 1 })
    })
    expect(seen).toEqual([
      SwipeStarted.make({ pointerId: 1, pointerType: 'touch', width: 0, height: 0 }),
      Swiped.make({ pointerId: 1, deltaX: 0, deltaY: 60 }),
      SwipeEnded.make({
        pointerId: 1,
        deltaX: 0,
        deltaY: 60,
        velocityX: 0,
        velocityY: 0,
        completed: false,
      }),
    ])
  })

  it('given a slop, starts only at a move past it, and captures only then', async () => {
    const captured: Array<number> = []
    const seen = await facts(
      3,
      handle => {
        Object.assign(handle, { setPointerCapture: (id: number) => captured.push(id) })
        // A press that stays within the slop is a click: nothing is reported.
        fire(handle, 'pointerdown', 0, down)
        fire(handle, 'pointermove', 10, { pointerId: 1, clientX: 3, clientY: 103 })
        fire(handle, 'pointerup', 20, { pointerId: 1, clientX: 3, clientY: 103 })
        expect(captured).toEqual([])
        fire(handle, 'pointerdown', 100, down)
        fire(handle, 'pointermove', 110, { pointerId: 1, clientX: 0, clientY: 103 })
        fire(handle, 'pointermove', 120, { pointerId: 1, clientX: 0, clientY: 130 })
        fire(handle, 'pointerup', 130, { pointerId: 1, clientX: 0, clientY: 130 })
        expect(captured).toEqual([1])
      },
      5,
    )
    // The deltas still run from where it was pressed.
    expect(seen.slice(0, 2)).toEqual([
      SwipeStarted.make({ pointerId: 1, pointerType: 'touch', width: 0, height: 0 }),
      Swiped.make({ pointerId: 1, deltaX: 0, deltaY: 30 }),
    ])
    expect(seen[2]).toMatchObject({ _tag: 'SwipeEnded', deltaY: 30, completed: true })
  })
})

describe('velocityOf', () => {
  it('reads the way over the window’s time, from its oldest sample in it', () => {
    expect(
      velocityOf([
        { at: 0, x: 0, y: 0 },
        { at: 50, x: 10, y: 0 },
        { at: 150, x: 110, y: -50 },
      ]),
    ).toEqual({ x: 1, y: -0.5 })
  })
})
