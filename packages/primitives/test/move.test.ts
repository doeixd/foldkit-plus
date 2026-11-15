// @vitest-environment jsdom
/**
 * Move: a primary pointer down starts and captures, moves report deltas from
 * the start, up completes, cancel or lost capture does not; a second pointer
 * and a secondary button are ignored; listeners go with the Mount; the
 * Behavior maps facts to the view's Messages on a draggable slot.
 */
import { Effect, Fiber, Option } from 'effect'
import * as Mount from 'foldkit/mount'
import { Attributes, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Move, MoveEnded, MoveStarted, Moved } from '../src/dom/index.js'
import { Move as Interaction } from '../src/interaction/index.js'
import { takeMessages } from './support.js'

const fire = (element: Element, type: string, init: Record<string, unknown>) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  element.dispatchEvent(event)
}

const withHandle = <A>(run: (handle: HTMLElement, captured: Array<number>) => Promise<A>) => {
  const handle = document.createElement('div')
  const captured: Array<number> = []
  Object.assign(handle, {
    setPointerCapture: (id: number) => captured.push(id),
    releasePointerCapture: (id: number) => captured.push(-id),
  })
  document.body.appendChild(handle)
  return run(handle, captured).finally(() => handle.remove())
}

describe('Move', () => {
  it('starts, reports deltas from the start, and completes on up', () =>
    withHandle(async (handle, captured) => {
      const facts = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(Move().f(handle, Mount.liveViewStateChanges), 4),
          )
          for (let i = 0; i < 50; i++) yield* Effect.yieldNow
          fire(handle, 'pointerdown', {
            pointerId: 3,
            button: 0,
            pointerType: 'touch',
            clientX: 10,
            clientY: 20,
          })
          fire(handle, 'pointermove', {
            pointerId: 3,
            pointerType: 'touch',
            clientX: 15,
            clientY: 18,
          })
          fire(handle, 'pointermove', {
            pointerId: 9,
            pointerType: 'mouse',
            clientX: 99,
            clientY: 99,
          })
          fire(handle, 'pointermove', {
            pointerId: 3,
            pointerType: 'touch',
            clientX: 30,
            clientY: 20,
          })
          fire(handle, 'pointerup', { pointerId: 3 })
          return yield* Fiber.join(fiber)
        }),
      )
      expect(facts).toEqual([
        MoveStarted.make({ pointerId: 3, pointerType: 'touch' }),
        Moved.make({ pointerId: 3, deltaX: 5, deltaY: -2, pointerType: 'touch' }),
        Moved.make({ pointerId: 3, deltaX: 20, deltaY: 0, pointerType: 'touch' }),
        MoveEnded.make({ pointerId: 3, completed: true }),
      ])
      expect(captured).toEqual([3, -3])
    }))

  it('ignores a secondary button and a second pointer, and ends incomplete on cancel', () =>
    withHandle(async handle => {
      const facts = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(Move().f(handle, Mount.liveViewStateChanges), 2),
          )
          for (let i = 0; i < 50; i++) yield* Effect.yieldNow
          fire(handle, 'pointerdown', {
            pointerId: 1,
            button: 2,
            pointerType: 'mouse',
            clientX: 0,
            clientY: 0,
          })
          fire(handle, 'pointerdown', {
            pointerId: 1,
            button: 0,
            pointerType: 'mouse',
            clientX: 0,
            clientY: 0,
          })
          fire(handle, 'pointerdown', {
            pointerId: 2,
            button: 0,
            pointerType: 'touch',
            clientX: 0,
            clientY: 0,
          })
          fire(handle, 'pointercancel', { pointerId: 1 })
          return yield* Fiber.join(fiber)
        }),
      )
      expect(facts).toEqual([
        MoveStarted.make({ pointerId: 1, pointerType: 'mouse' }),
        MoveEnded.make({ pointerId: 1, completed: false }),
      ])
    }))

  it('Escape ends a drag not completed, once, and stops there', () =>
    withHandle(async (handle, captured) => {
      let reachedPage = 0
      const onPage = () => reachedPage++
      document.addEventListener('keydown', onPage)
      const run = (count: number, steps: () => void) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const fiber = yield* Effect.forkChild(
              takeMessages(Move().f(handle, Mount.liveViewStateChanges), count),
            )
            for (let i = 0; i < 50; i++) yield* Effect.yieldNow
            steps()
            return yield* Fiber.join(fiber)
          }),
        )
      const down = () =>
        fire(handle, 'pointerdown', { pointerId: 4, button: 0, clientX: 0, clientY: 0 })
      const facts = await run(3, () => {
        down()
        fire(document.body, 'keydown', { key: 'Escape' })
        // The drag is over: neither this move nor a second Escape reports anything.
        fire(handle, 'pointermove', { pointerId: 4, clientX: 9, clientY: 9 })
        fire(document.body, 'keydown', { key: 'Escape' })
        down()
        fire(handle, 'pointerup', { pointerId: 4 })
      })
      document.removeEventListener('keydown', onPage)
      expect(facts).toEqual([
        MoveStarted.make({ pointerId: 4, pointerType: 'mouse' }),
        MoveEnded.make({ pointerId: 4, completed: false }),
        MoveStarted.make({ pointerId: 4, pointerType: 'mouse' }),
      ])
      expect(captured).toEqual([4, -4, 4, -4])
      // The first Escape belonged to the drag; the second found none and went on.
      expect(reachedPage).toBe(1)
    }))

  it('keeps nothing on the document while no pointer is down', () =>
    withHandle(async handle => {
      const added: Array<string> = []
      const real = document.addEventListener.bind(document)
      document.addEventListener = (type: string, ...rest: [EventListenerOrEventListenerObject]) => {
        added.push(type)
        real(type, ...rest)
      }
      try {
        await Effect.runPromise(
          Effect.gen(function* () {
            const fiber = yield* Effect.forkChild(
              takeMessages(Move().f(handle, Mount.liveViewStateChanges), 1),
            )
            for (let i = 0; i < 50; i++) yield* Effect.yieldNow
            expect(added).toEqual([])
            fire(handle, 'pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
            yield* Fiber.join(fiber)
          }),
        )
        expect(added).toEqual(['keydown'])
      } finally {
        document.addEventListener = real
      }
    }))

  it('removes its listeners with the Mount', () =>
    withHandle(async handle => {
      const facts = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(Move().f(handle, Mount.liveViewStateChanges), 1),
          )
          for (let i = 0; i < 50; i++) yield* Effect.yieldNow
          fire(handle, 'pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
          const collected = yield* Fiber.join(fiber)
          fire(handle, 'pointermove', { pointerId: 1, clientX: 5, clientY: 5 })
          return collected
        }),
      )
      expect(facts).toHaveLength(1)
    }))
})

describe('Move.behavior', () => {
  const RowSlots = Slots.define({
    row: Slot.make({ capability: Capability.Container }),
    grip: Slot.make({ capability: Capability.Draggable }),
  })
  type Message = { readonly _tag: 'Dragged'; readonly dx: number } | { readonly _tag: 'Other' }
  const h = SlotView.inertBuilder<Message>()

  it('mounts on the draggable slot with the mapping given', () => {
    const Drag = Interaction.behavior(RowSlots)<unknown, Message>({
      handle: 'grip',
      toMessage: fact =>
        fact._tag === 'Moved' ? { _tag: 'Dragged', dx: fact.deltaX } : { _tag: 'Other' },
    })
    const b = SlotView.buildersFor(RowSlots, [Drag.mixin], { input: undefined, h })
    expect(Attributes.find(b.grip.attrs(), 'OnMount')?.action.name).toContain('Move')
    expect(b.row.attrs()).toEqual([])
  })

  it('refuses a slot that is not draggable', () => {
    expect(() =>
      Interaction.behavior(RowSlots)<unknown, Message>({
        handle: 'row',
        toMessage: () => ({ _tag: 'Other' }),
      }),
    ).toThrow(/capability/)
  })
})

describe('Move keys', () => {
  const mods = (init: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>>) => ({
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...init,
  })
  const ask = <M>(
    route: Behaviors.Keys.Route<undefined, M>,
    key: string,
    init: Parameters<typeof mods>[0],
  ) => Behaviors.Keys.answer([route])({ key, modifiers: mods(init), input: undefined })
  const nudge = Interaction.nudge<undefined, string>({
    step: 2,
    toMessage: ({ dx, dy }) => `${dx},${dy}`,
  })

  it.each([
    ['ArrowRight', {}, '2,0'],
    ['ArrowLeft', { shiftKey: true }, '-20,0'],
    ['ArrowUp', {}, '0,-2'],
    ['ArrowDown', { shiftKey: true }, '0,20'],
  ])('Alt+%s nudges', (key, init, message) => {
    expect(ask(nudge, key, { altKey: true, ...init })).toEqual(Option.some(message))
  })

  it('leaves a plain arrow, an Alt+Ctrl chord and another key to the page', () => {
    expect(ask(nudge, 'ArrowRight', {})).toEqual(Option.none())
    expect(ask(nudge, 'ArrowRight', { altKey: true, ctrlKey: true })).toEqual(Option.none())
    expect(ask(nudge, 'a', { altKey: true })).toEqual(Option.none())
  })

  it('a handle’s keys move its own edges, and Home and End ask for the extremes', () => {
    const east = Interaction.resizeKeys<undefined, string>('e', {
      toMessage: ({ dx, dy }) => `${dx},${dy}`,
    })
    expect(ask(east, 'ArrowRight', {})).toEqual(Option.some('1,0'))
    expect(ask(east, 'ArrowRight', { shiftKey: true })).toEqual(Option.some('10,0'))
    expect(ask(east, 'ArrowUp', {})).toEqual(Option.none())
    expect(ask(east, 'End', {})).toEqual(Option.some('Infinity,0'))
    expect(ask(east, 'Home', {})).toEqual(Option.some('-Infinity,0'))
    expect(ask(east, 'ArrowRight', { altKey: true })).toEqual(Option.none())
  })

  it('shares a keydown owner with another route, and two on one chord are refused', () => {
    const other = Behaviors.Keys.route<undefined, string>('Other', {
      on: [Behaviors.Keys.chord('ArrowRight', { alt: true })],
      handle: () => Option.some('other'),
    })
    expect(() => Behaviors.Keys.answer([nudge, other])).toThrow(/two routes take "Alt.ArrowRight"/)
  })
})
