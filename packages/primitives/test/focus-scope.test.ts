// @vitest-environment jsdom
/**
 * FocusScope: initial focus (selector, first tabbable, the element), Tab and
 * Shift+Tab wrapping under contain, a stray focus brought back, restore on
 * unmount, and the Behavior contributing the Mount to the container slot.
 */
import { Effect, Fiber, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { FocusScope, tabbableWithin } from '../src/dom/index.js'
import { FocusScope as Interaction } from '../src/interaction/index.js'

const setup = () => {
  document.body.innerHTML = `
    <button id="outside">outside</button>
    <div id="scope">
      <button id="first">first</button>
      <input id="middle" />
      <a id="hidden-link" href="#" hidden>hidden</a>
      <button id="skipped" tabindex="-1">skipped</button>
      <button id="last">last</button>
    </div>`
  const byId = (id: string) => document.getElementById(id) as HTMLElement
  return {
    outside: byId('outside'),
    scope: byId('scope'),
    first: byId('first'),
    middle: byId('middle'),
    last: byId('last'),
  }
}

const tab = (target: HTMLElement, shiftKey = false) => {
  const event = new window.KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

const running = (args: Parameters<typeof FocusScope>[0], element: Element) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(
      Stream.runDrain(FocusScope(args).f(element, Mount.liveViewStateChanges)),
    )
    for (let i = 0; i < 20; i++) yield* Effect.yieldNow
    return fiber
  })

const settle = Effect.gen(function* () {
  for (let i = 0; i < 20; i++) yield* Effect.yieldNow
})

describe('tabbableWithin', () => {
  it('lists focusable, visible descendants with a non-negative tabindex, in order', () => {
    const { scope } = setup()
    expect(tabbableWithin(scope).map(e => e.id)).toEqual(['first', 'middle', 'last'])
  })
})

describe('FocusScope', () => {
  it('focuses the first tabbable on insert and restores the previous focus on unmount', async () => {
    const { outside, scope, first } = setup()
    outside.focus()
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* running({ contain: true, restore: true, initialFocus: null }, scope)
        expect(document.activeElement).toBe(first)
        yield* Fiber.interrupt(fiber)
        yield* settle
        expect(document.activeElement).toBe(outside)
      }),
    )
  })

  it('honors initialFocus and leaves focus alone on unmount without restore', async () => {
    const { outside, scope, middle } = setup()
    outside.focus()
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* running(
          { contain: false, restore: false, initialFocus: '#middle' },
          scope,
        )
        expect(document.activeElement).toBe(middle)
        yield* Fiber.interrupt(fiber)
        yield* settle
        expect(document.activeElement).toBe(middle)
      }),
    )
  })

  it('wraps Tab from the last and Shift+Tab from the first, and brings a stray focus back', async () => {
    const { outside, scope, first, last } = setup()
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* running({ contain: true, restore: false, initialFocus: null }, scope)
        last.focus()
        expect(tab(last)).toBe(true)
        expect(document.activeElement).toBe(first)
        expect(tab(first, true)).toBe(true)
        expect(document.activeElement).toBe(last)
        // Tab from the middle is the browser's: not prevented.
        first.focus()
        expect(tab(first)).toBe(false)
        outside.focus()
        expect(document.activeElement).toBe(first)
        yield* Fiber.interrupt(fiber)
      }),
    )
  })

  it('without contain, Tab is never prevented and focus may leave', async () => {
    const { outside, scope, last } = setup()
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* running({ contain: false, restore: false, initialFocus: null }, scope)
        last.focus()
        expect(tab(last)).toBe(false)
        outside.focus()
        expect(document.activeElement).toBe(outside)
        yield* Fiber.interrupt(fiber)
      }),
    )
  })

  it('removes its listeners on unmount', async () => {
    const { scope, first, last } = setup()
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* running({ contain: true, restore: false, initialFocus: null }, scope)
        yield* Fiber.interrupt(fiber)
        yield* settle
        last.focus()
        expect(tab(last)).toBe(false)
        expect(document.activeElement).toBe(last)
        void first
      }),
    )
  })
})

describe('FocusScope.behavior', () => {
  const DialogSlots = Slots.define({
    panel: Slot.make({ capability: Capability.Container }),
    close: Slot.make({ capability: Capability.Interactive }),
  })
  type Message = { readonly _tag: 'Closed' }
  const h = SlotView.inertBuilder<Message>()

  it('contributes one Mount to the container with the options given', () => {
    const Scope = Interaction.behavior(DialogSlots)<unknown, Message>({
      container: 'panel',
      initialFocus: '#close',
      contain: true,
    })
    const b = SlotView.buildersFor(DialogSlots, [Scope.mixin], { input: undefined, h })
    const mount = Attributes.find(b.panel.attrs(), 'OnMount')
    expect(mount?.action.name).toContain('FocusScope')
    expect(mount?.action.args).toEqual({ contain: true, restore: true, initialFocus: '#close' })
    expect(b.close.attrs()).toEqual([])
  })
})
