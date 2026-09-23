// @vitest-environment jsdom
/**
 * ScrollLock and HideOutside: the lock holds while mounted and nests; the
 * inert set marks siblings and restores on unmount; the Behaviors mount each
 * on a container slot.
 */
import { Effect, Fiber, Stream } from 'effect'
import * as Mount from 'foldkit/mount'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { HideOutside, ScrollLock } from '../src/dom/index.js'
import { Layers } from '../src/interaction/index.js'

const run = (
  action: {
    readonly f: (
      element: Element,
      changes: typeof Mount.liveViewStateChanges,
    ) => Stream.Stream<never>
  },
  element: Element,
) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(
      Stream.runDrain(action.f(element, Mount.liveViewStateChanges)),
    )
    for (let i = 0; i < 30; i++) yield* Effect.yieldNow
    return fiber
  })

// Foldkit's inert helper waits a frame when no runtime is present; jsdom has
// no frames, so give it one and let real time pass.
if (typeof window.requestAnimationFrame !== 'function') {
  window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0)
}

const settle = Effect.sleep('30 millis')

describe('ScrollLock', () => {
  it('locks while mounted and nested locks release together', async () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    document.documentElement.style.overflow = ''
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const first = yield* run(ScrollLock(), a)
          expect(document.documentElement.style.overflow).toBe('hidden')
          const second = yield* run(ScrollLock(), b)
          yield* Fiber.interrupt(first)
          yield* settle
          expect(document.documentElement.style.overflow).toBe('hidden')
          yield* Fiber.interrupt(second)
          yield* settle
          expect(document.documentElement.style.overflow).toBe('')
        }),
      )
    } finally {
      a.remove()
      b.remove()
    }
  })
})

describe('HideOutside', () => {
  it('marks what is outside the element inert and restores on unmount', async () => {
    document.body.innerHTML = `<main id="page"><p id="text">t</p></main><div id="overlay"><button>ok</button></div>`
    const overlay = document.getElementById('overlay')!
    const page = document.getElementById('page')!
    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* run(HideOutside(), overlay)
          yield* settle
          expect(page.hasAttribute('inert') || page.getAttribute('aria-hidden') === 'true').toBe(
            true,
          )
          expect(overlay.hasAttribute('inert')).toBe(false)
          expect(overlay.getAttribute('data-foldkit-plus-hide-outside')).toMatch(/^hide-outside-/)
          yield* Fiber.interrupt(fiber)
          yield* settle
          expect(page.hasAttribute('inert')).toBe(false)
          expect(page.getAttribute('aria-hidden')).toBeNull()
          expect(overlay.hasAttribute('data-foldkit-plus-hide-outside')).toBe(false)
        }),
      )
    } finally {
      document.body.innerHTML = ''
    }
  })
})

describe('Layers behaviors', () => {
  const OverlaySlots = Slots.define({
    backdrop: Slot.make({ capability: Capability.Container }),
    panel: Slot.make({ capability: Capability.Container }),
  })
  type Message = { readonly _tag: 'Closed' }
  const h = SlotView.inertBuilder<Message>()

  it('mount ScrollLock and HideOutside on the slot named', () => {
    const Lock = Layers.scrollLock(OverlaySlots)<unknown, Message>({ container: 'backdrop' })
    const Hide = Layers.hideOutside(OverlaySlots)<unknown, Message>({ container: 'panel' })
    const b = SlotView.buildersFor(OverlaySlots, [Lock.mixin, Hide.mixin], { input: undefined, h })
    expect(Attributes.find(b.backdrop.attrs(), 'OnMount')?.action.name).toContain('ScrollLock')
    expect(Attributes.find(b.panel.attrs(), 'OnMount')?.action.name).toContain('HideOutside')
  })
})
