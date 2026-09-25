// @vitest-environment jsdom
/**
 * Targets: the nearest marked descendant under the pointer is reported once per
 * change, and nothing outside the container; a press reports its target with
 * the modifiers held, and prevents the default only when asked; listeners go
 * with the Mount; the Behavior attaches it to a container slot.
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { TargetHovered, TargetPressed, Targets, targetOf } from '../src/dom/index.js'
import { Targets as Interaction } from '../src/interaction/index.js'
import { takeMessages } from './support.js'

const fire = (element: Element, type: string, init: Record<string, unknown> = {}) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  element.dispatchEvent(event)
  return event
}

/**
 * A canvas of two marked nodes, one inside the other, and an unmarked element:
 *   <div canvas><div data-node="outer"><span data-node="inner"><b></b></span><i></i></div><p></p></div>
 * and a marked element outside the canvas.
 */
const withCanvas = <A>(
  run: (parts: {
    readonly canvas: HTMLElement
    readonly outer: HTMLElement
    readonly bold: HTMLElement
    readonly italic: HTMLElement
    readonly plain: HTMLElement
    readonly outside: HTMLElement
  }) => Promise<A>,
) => {
  const make = (tag: string, id?: string) => {
    const element = document.createElement(tag)
    if (id !== undefined) element.setAttribute('data-node', id)
    return element
  }
  const canvas = make('div')
  const outer = make('div', 'outer')
  const inner = make('span', 'inner')
  const bold = make('b')
  const italic = make('i')
  const plain = make('p')
  const outside = make('div', 'elsewhere')
  inner.append(bold)
  outer.append(inner, italic)
  canvas.append(outer, plain)
  document.body.append(canvas, outside)
  return run({ canvas, outer, bold, italic, plain, outside }).finally(() => {
    canvas.remove()
    outside.remove()
  })
}

describe('targetOf', () => {
  it('is the nearest marked ancestor inside the container, or null', () =>
    withCanvas(async ({ canvas, bold, italic, plain, outside }) => {
      expect(targetOf(canvas, bold, 'data-node')).toBe('inner')
      expect(targetOf(canvas, italic, 'data-node')).toBe('outer')
      expect(targetOf(canvas, plain, 'data-node')).toBeNull()
      expect(targetOf(canvas, outside, 'data-node')).toBeNull()
      expect(targetOf(canvas, null, 'data-node')).toBeNull()
    }))
})

describe('Targets', () => {
  const run = (canvas: HTMLElement, count: number, act: () => void, preventDefault = false) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          takeMessages(
            Targets({ attribute: 'data-node', preventDefault }).f(
              canvas,
              Mount.liveViewStateChanges,
            ),
            count,
          ),
        )
        for (let i = 0; i < 50; i++) yield* Effect.yieldNow
        act()
        return yield* Fiber.join(fiber)
      }),
    )

  it('reports the marked target under the pointer once per change', () =>
    withCanvas(async ({ canvas, bold, italic, plain }) => {
      const facts = await run(canvas, 3, () => {
        fire(bold, 'pointerover')
        fire(bold, 'pointerover')
        fire(italic, 'pointerover')
        fire(plain, 'pointerover')
        fire(plain, 'pointerover')
      })
      expect(facts).toEqual([
        TargetHovered.make({ id: 'inner' }),
        TargetHovered.make({ id: 'outer' }),
        TargetHovered.make({ id: null }),
      ])
    }))

  it('reports none when the pointer leaves the container', () =>
    withCanvas(async ({ canvas, bold }) => {
      const facts = await run(canvas, 2, () => {
        fire(bold, 'pointerover')
        fire(canvas, 'pointerleave')
      })
      expect(facts).toEqual([TargetHovered.make({ id: 'inner' }), TargetHovered.make({ id: null })])
    }))

  it('reports a press on a marked target with its modifiers, and leaves its default alone', () =>
    withCanvas(async ({ canvas, bold, plain }) => {
      let defaultPrevented: boolean | undefined
      const facts = await run(canvas, 1, () => {
        fire(plain, 'click')
        defaultPrevented = fire(bold, 'click', { shiftKey: true }).defaultPrevented
      })
      expect(facts).toEqual([
        TargetPressed.make({
          id: 'inner',
          shiftKey: true,
          altKey: false,
          ctrlKey: false,
          metaKey: false,
        }),
      ])
      expect(defaultPrevented).toBe(false)
    }))

  it('prevents a press’s default when asked, as an editor’s canvas does for its links', () =>
    withCanvas(async ({ canvas, italic }) => {
      let defaultPrevented: boolean | undefined
      await run(
        canvas,
        1,
        () => {
          defaultPrevented = fire(italic, 'click').defaultPrevented
        },
        true,
      )
      expect(defaultPrevented).toBe(true)
    }))
})

describe('Targets behavior', () => {
  it('attaches the Mount to the container slot', () => {
    const CanvasSlots = Slots.define({ canvas: Slot.make({ capability: Capability.Container }) })
    const wired = Interaction.behavior(CanvasSlots)<unknown, string>({
      container: 'canvas',
      attribute: 'data-node',
      toMessage: fact => fact._tag,
    })
    const b = SlotView.buildersFor(CanvasSlots, [wired.mixin], {
      input: undefined,
      h: SlotView.inertBuilder<string>(),
    })
    expect(Attributes.find(b.canvas.attrs(), 'OnMount')).toBeDefined()
  })
})
