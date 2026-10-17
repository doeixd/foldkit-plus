/**
 * `PointerPosition` on a real element with a border and padding: places are
 * read in its padding box, where a positioned thumb is laid out, a real drag that leaves the element is still
 * heard through the capture, the moves and the release are listened to only
 * during a press, and a Mount ended mid-press lets go of what it held.
 */
import { Effect, Fiber, Schema, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { PointerMoved, PointerPosition, type PointerFact } from '../src/dom/pointer-position.js'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const DURING = ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']

/**
 * A 240 by 120 padding box (a 200 by 100 content box in 10px by 20px of
 * padding) behind a 3px border at 50, 40, with a thumb inside and an empty
 * place below it.
 */
const mount = async (focus?: string) => {
  const element = document.createElement('div')
  element.style.cssText =
    'position: fixed; left: 50px; top: 40px; width: 200px; height: 100px; border: 3px solid; padding: 10px 20px'
  const thumb = document.createElement('div')
  thumb.tabIndex = 0
  element.append(thumb)
  const elsewhere = document.createElement('div')
  elsewhere.style.cssText = 'position: fixed; left: 400px; top: 300px; width: 50px; height: 50px'
  document.body.append(element, elsewhere)
  const added = vi.spyOn(element, 'addEventListener')
  const removed = vi.spyOn(element, 'removeEventListener')
  const released = vi.spyOn(element, 'releasePointerCapture')
  const heard: Array<PointerFact> = []
  const fiber = Effect.runFork(
    Stream.runForEach(
      PointerPosition(focus === undefined ? {} : { focus }).f(element, liveViewStateChanges),
      fact => Effect.sync(() => heard.push(fact)),
    ),
  )
  await expect.poll(() => added.mock.calls.length).toBe(1)
  const typesOf = (spy: typeof added) => spy.mock.calls.map(([type]) => type)
  return {
    element,
    thumb,
    elsewhere,
    heard,
    added: () => typesOf(added),
    removed: () => typesOf(removed),
    released,
    stop: () => Effect.runPromise(Fiber.interrupt(fiber)),
  }
}

/** A pointer event at `x`, `y` of the padding box at 53, 43; returns whether it was cancelled. */
const fire = (element: Element, type: string, init: PointerEventInit & { x: number; y: number }) =>
  !element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 7,
      button: 0,
      pressure: 0.5,
      ...init,
      clientX: 53 + init.x,
      clientY: 43 + init.y,
    }),
  )

it('reads places in the padding box, inside the border and over the padding', async () => {
  const { element, heard, stop } = await mount()
  try {
    const cancelled = fire(element, 'pointerdown', { x: 15, y: 7, pointerType: 'pen' })
    fire(element, 'pointermove', { x: 150, y: 90, pressure: 0.25 })
    fire(element, 'pointerup', { x: 150, y: 90 })
    await expect
      .poll(() => heard)
      .toEqual([
        {
          _tag: 'PointerPressed',
          width: 240,
          height: 120,
          point: { x: 15, y: 7, pressure: 0.5 },
          pointerType: 'pen',
        },
        {
          _tag: 'PointerMoved',
          width: 240,
          height: 120,
          point: { x: 150, y: 90, pressure: 0.25 },
          points: [{ x: 150, y: 90, pressure: 0.25 }],
        },
        { _tag: 'PointerReleased', completed: true },
      ])
    // The press keeps the browser's focus and text selection away.
    expect(cancelled).toBe(true)
  } finally {
    await stop()
  }
})

it("reports a move's coalesced places, in the padding box", async () => {
  const { element, heard, stop } = await mount()
  try {
    fire(element, 'pointerdown', { x: 0, y: 0 })
    const between = [10, 20].map(
      at =>
        new PointerEvent('pointermove', {
          pointerId: 7,
          clientX: 53 + at,
          clientY: 43 + at,
          pressure: at / 80,
        }),
    )
    fire(element, 'pointermove', { x: 20, y: 20, pressure: 0.25, coalescedEvents: between })
    await expect
      .poll(() => heard[1])
      .toMatchObject({
        point: { x: 20, y: 20, pressure: 0.25 },
        points: [
          { x: 10, y: 10, pressure: 0.125 },
          { x: 20, y: 20, pressure: 0.25 },
        ],
      })
  } finally {
    await stop()
  }
})

it('hears a real drag that leaves the element, through the capture', async () => {
  const { element, elsewhere, heard, stop } = await mount()
  try {
    await userEvent.dragAndDrop(element, elsewhere)
    await expect.poll(() => heard.at(-1)).toEqual({ _tag: 'PointerReleased', completed: true })
    const moves = heard.filter(Schema.is(PointerMoved)).map(fact => fact.point)
    // Over `elsewhere`, far to the right of and below the padding box.
    expect(moves.at(-1)?.x).toBeGreaterThan(300)
    expect(moves.at(-1)?.y).toBeGreaterThan(200)
  } finally {
    await stop()
  }
})

it('listens to the moves and the release only during a press', async () => {
  const { element, heard, added, removed, stop } = await mount()
  try {
    expect(added()).toEqual(['pointerdown'])
    fire(element, 'pointermove', { x: 1, y: 1 })
    fire(element, 'pointerdown', { x: 1, y: 1 })
    expect(added()).toEqual(['pointerdown', ...DURING])
    fire(element, 'pointercancel', { x: 1, y: 1 })
    expect(removed()).toEqual(DURING)
    fire(element, 'pointermove', { x: 2, y: 2 })
    await expect
      .poll(() => heard)
      .toMatchObject([{ _tag: 'PointerPressed' }, { _tag: 'PointerReleased', completed: false }])
    expect(heard).toHaveLength(2)
  } finally {
    await stop()
  }
})

it('removes every listener and lets go of the pointer when it ends mid-press', async () => {
  const { element, removed, released, stop } = await mount()
  fire(element, 'pointerdown', { x: 1, y: 1 })
  await stop()
  expect(removed()).toEqual(['pointerdown', ...DURING])
  expect(released).toHaveBeenCalledWith(7)
})

it('ignores a second pointer and a secondary button, and ends a press the same pointer begins again', async () => {
  const { element, heard, stop } = await mount()
  try {
    fire(element, 'pointerdown', { x: 1, y: 1, button: 2 })
    fire(element, 'pointerdown', { x: 1, y: 1 })
    fire(element, 'pointerdown', { x: 2, y: 2, pointerId: 8 })
    fire(element, 'pointermove', { x: 3, y: 3, pointerId: 8 })
    fire(element, 'pointerup', { x: 3, y: 3, pointerId: 8 })
    // Pointer 7 was never let go: pressed again, it ends incomplete and begins anew.
    fire(element, 'pointerdown', { x: 4, y: 4 })
    fire(element, 'pointerup', { x: 4, y: 4 })
    fire(element, 'pointerdown', { x: 5, y: 5 })
    await expect
      .poll(() => heard)
      .toMatchObject([
        { _tag: 'PointerPressed', point: { x: 1 } },
        { _tag: 'PointerReleased', completed: false },
        { _tag: 'PointerPressed', point: { x: 4 } },
        { _tag: 'PointerReleased', completed: true },
        { _tag: 'PointerPressed', point: { x: 5 } },
      ])
    expect(heard).toHaveLength(5)
  } finally {
    await stop()
  }
})

it('focuses what `focus` selects on a press', async () => {
  const { element, thumb, stop } = await mount('[tabindex]')
  try {
    fire(element, 'pointerdown', { x: 1, y: 1 })
    expect(document.activeElement).toBe(thumb)
  } finally {
    await stop()
  }
})
