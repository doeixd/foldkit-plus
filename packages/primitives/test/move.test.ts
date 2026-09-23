// @vitest-environment jsdom
/**
 * Move: a primary pointer down starts and captures, moves report deltas from
 * the start, up completes, cancel or lost capture does not; a second pointer
 * and a secondary button are ignored; listeners go with the Mount; the
 * Behavior maps facts to the view's Messages on a draggable slot.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
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
