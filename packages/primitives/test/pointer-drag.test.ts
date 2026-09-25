// @vitest-environment jsdom
/**
 * PointerDrag: a press becomes a drag only past the threshold; the place under
 * the pointer is reported once per change, by thirds of its box, and never as
 * the dragged element itself; a release drops and swallows the click it ends
 * with; Escape cancels; the Behavior attaches the Mount to a container slot.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import {
  DragCancelled,
  DragDropped,
  type DragPlace,
  DragStarted,
  DraggedOver,
  PointerDrag,
  boxOf,
  zoneOf,
} from '../src/dom/index.js'
import { PointerDrag as Interaction } from '../src/interaction/index.js'
import { takeMessages } from './support.js'

const fire = (target: EventTarget, type: string, init: Record<string, unknown> = {}) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  target.dispatchEvent(event)
  return event
}

/** A marked element whose box is `top` to `top + 30`. */
const row = (id: string, top: number) => {
  const element = document.createElement('li')
  element.setAttribute('data-row', id)
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: top, width: 100, height: 30 })
  return element
}

/** A list of three rows, a, b and c, 30px tall each from the top, and an element outside it. */
const withList = <A>(
  run: (parts: {
    readonly list: HTMLElement
    readonly a: HTMLElement
    readonly b: HTMLElement
    readonly c: HTMLElement
    readonly outside: HTMLElement
  }) => Promise<A>,
) => {
  const list = document.createElement('ul')
  const a = row('a', 0)
  const b = row('b', 30)
  const c = row('c', 60)
  const outside = document.createElement('div')
  list.append(a, b, c)
  document.body.append(list, outside)
  return run({ list, a, b, c, outside }).finally(() => {
    list.remove()
    outside.remove()
  })
}

const run = (list: HTMLElement, count: number, act: () => void) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        takeMessages(
          PointerDrag({ attribute: 'data-row' }).f(list, Mount.liveViewStateChanges),
          count,
        ),
      )
      for (let i = 0; i < 50; i++) yield* Effect.yieldNow
      act()
      return yield* Fiber.join(fiber)
    }),
  )

describe('zoneOf and boxOf', () => {
  it('splits a box in thirds', () => {
    const box = { top: 30, height: 30 }
    expect([31, 45, 59].map(y => zoneOf(box, y))).toEqual(['before', 'inside', 'after'])
    expect(zoneOf({ top: 0, height: 0 }, 0)).toBe('inside')
  })

  it('measures an element with no box of its own by its first child', () => {
    const wrapper = document.createElement('div')
    const child = row('x', 90)
    wrapper.append(child)
    wrapper.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 })
    expect(boxOf(wrapper).top).toBe(90)
  })
})

describe('PointerDrag', () => {
  it('starts only past the threshold, and reports each new place under the pointer', () =>
    withList(async ({ list, a, b, c, outside }) => {
      const facts = await run(list, 4, () => {
        fire(a, 'pointerdown', { button: 0, clientX: 10, clientY: 10 })
        // Not yet past the threshold, though the pointer is over b.
        fire(b, 'pointermove', { clientX: 12, clientY: 11 })
        fire(a, 'pointermove', { clientX: 10, clientY: 20 })
        fire(b, 'pointermove', { clientX: 10, clientY: 32 })
        fire(b, 'pointermove', { clientX: 10, clientY: 33 })
        fire(c, 'pointermove', { clientX: 10, clientY: 75 })
        fire(outside, 'pointermove', { clientX: 10, clientY: 200 })
      })
      expect(facts).toEqual([
        // Over the dragged row itself is over nothing, which it already was.
        DragStarted.make({ id: 'a' }),
        DraggedOver.make({ over: { id: 'b', zone: 'before' } }),
        DraggedOver.make({ over: { id: 'c', zone: 'inside' } }),
        DraggedOver.make({ over: null }),
      ])
    }))

  it('drops where the pointer is, and swallows the click the release makes', () =>
    withList(async ({ list, a, c }) => {
      let clicked: Event | undefined
      const facts = await run(list, 3, () => {
        fire(a, 'pointerdown', { button: 0, clientX: 10, clientY: 10 })
        fire(c, 'pointermove', { clientX: 10, clientY: 85 })
        fire(c, 'pointerup')
        clicked = fire(c, 'click')
      })
      expect(facts).toEqual([
        DragStarted.make({ id: 'a' }),
        DraggedOver.make({ over: { id: 'c', zone: 'after' } }),
        DragDropped.make({ id: 'a', over: { id: 'c', zone: 'after' } }),
      ])
      expect(clicked?.defaultPrevented).toBe(true)
      // The next click is a click.
      expect(fire(c, 'click').defaultPrevented).toBe(false)
    }))

  it('leaves a press that does not move a click, and a release outside does not eat one later', () =>
    withList(async ({ list, a, b, outside }) => {
      let later: Event | undefined
      const facts = await run(list, 2, () => {
        fire(a, 'pointerdown', { button: 0, clientX: 10, clientY: 10 })
        fire(a, 'pointerup')
        expect(fire(a, 'click').defaultPrevented).toBe(false)
        fire(b, 'pointerdown', { button: 0, clientX: 10, clientY: 40 })
        fire(outside, 'pointermove', { clientX: 10, clientY: 200 })
        fire(outside, 'pointerup')
        later = fire(a, 'click')
      })
      expect(facts).toEqual([
        DragStarted.make({ id: 'b' }),
        DragDropped.make({ id: 'b', over: null }),
      ])
      expect(later?.defaultPrevented).toBe(false)
    }))

  it('ends with nothing dropped on Escape, not on another key, and ignores a secondary button', () =>
    withList(async ({ list, a, b, c }) => {
      const facts = await run(list, 6, () => {
        fire(c, 'pointerdown', { button: 2, clientX: 10, clientY: 70 })
        fire(b, 'pointermove', { clientX: 10, clientY: 45 })
        fire(c, 'pointerup')
        fire(a, 'pointerdown', { button: 0, clientX: 10, clientY: 10 })
        fire(b, 'pointermove', { clientX: 10, clientY: 45 })
        fire(document, 'keydown', { key: 'a' })
        fire(b, 'pointerup')
        fire(a, 'pointerdown', { button: 0, clientX: 10, clientY: 10 })
        fire(c, 'pointermove', { clientX: 10, clientY: 75 })
        fire(document, 'keydown', { key: 'Escape' })
        fire(c, 'pointerup')
      })
      const overB: DragPlace = { id: 'b', zone: 'inside' }
      expect(facts).toEqual([
        DragStarted.make({ id: 'a' }),
        DraggedOver.make({ over: overB }),
        DragDropped.make({ id: 'a', over: overB }),
        DragStarted.make({ id: 'a' }),
        DraggedOver.make({ over: { id: 'c', zone: 'inside' } }),
        DragCancelled.make({ id: 'a' }),
      ])
    }))
})

describe('PointerDrag behavior', () => {
  it('attaches the Mount to the container slot', () => {
    const ListSlots = Slots.define({ list: Slot.make({ capability: Capability.Container }) })
    const wired = Interaction.behavior(ListSlots)<unknown, string>({
      container: 'list',
      attribute: 'data-row',
      toMessage: fact => fact._tag,
    })
    const b = SlotView.buildersFor(ListSlots, [wired.mixin], {
      input: undefined,
      h: SlotView.inertBuilder<string>(),
    })
    expect(Attributes.find(b.list.attrs(), 'OnMount')).toBeDefined()
  })
})
