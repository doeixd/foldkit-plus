// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Anchor } from '../src/index.js'
import { h, type TestMessage } from './fixture.js'

describe('Anchor adapter', () => {
  const MenuSlots = Slots.define({
    button: Slot.make({ capability: Capability.Interactive }),
    panel: Slot.make({ capability: Capability.Container }),
  })
  interface Input {
    readonly id: string
  }

  it('mounts the anchor on the floating slot with the config the input gives', () => {
    const Position = Anchor.behavior(MenuSlots)<Input, TestMessage>({
      floating: 'panel',
      config: input => ({
        buttonId: `${input.id}-button`,
        anchor: { placement: 'bottom-start', gap: 4 },
      }),
    })
    const b = SlotView.buildersFor(MenuSlots, [Position.mixin], { input: { id: 'file' }, h })
    const mount = Attributes.find(b.panel.attrs(), 'OnMount')
    expect(mount?.action.name).toContain('Anchor')
    expect(mount?.action.args).toEqual({
      buttonId: 'file-button',
      anchor: { placement: 'bottom-start', gap: 4 },
    })
    expect(b.button.attrs()).toEqual([])
  })

  it('refuses a slot that is not a container', () => {
    expect(() =>
      Anchor.behavior(MenuSlots)<Input, TestMessage>({
        floating: 'button',
        config: () => ({ buttonId: 'x', anchor: {} }),
      }),
    ).toThrow(/capability/)
  })
})

describe('topLayer', () => {
  /**
   * A panel with spied popover methods, as Chromium provides them: showing
   * one without the `popover` attribute throws, as Chromium's does.
   */
  const popover = (attribute: boolean = true) => {
    const events: Array<string> = []
    const element = document.createElement('div')
    if (attribute) element.setAttribute('popover', 'manual')
    const show = vi.fn(() => {
      if (!element.hasAttribute('popover')) {
        throw new DOMException(
          'Not supported on element that does not have valid popover attribute',
          'NotSupportedError',
        )
      }
      events.push('shown')
    })
    const hide = vi.fn(() => {
      events.push('hidden')
    })
    Object.assign(element, { showPopover: show, hidePopover: hide })
    return { element, show, hide, events }
  }

  it('keeps the wrapped Mount’s name and args, so Scene tests still match it', () => {
    const wrapped = Anchor.topLayer({
      name: 'Probe',
      args: { buttonId: 'x' },
      f: () => Stream.never,
    })
    expect(wrapped.name).toBe('Probe')
    expect(wrapped.args).toEqual({ buttonId: 'x' })
  })

  it('shows around the wrapped acquire, and hides once it releases', async () => {
    const { element, show, hide, events } = popover()
    const wrapped = Anchor.topLayer({
      name: 'Probe',
      f: () =>
        Stream.unwrap(
          Effect.acquireRelease(
            Effect.sync(() => {
              events.push('positioned')
            }),
            () =>
              Effect.sync(() => {
                events.push('unpositioned')
              }),
          ).pipe(Effect.as(Stream.never)),
        ),
    })
    const fiber = Effect.runFork(Stream.runDrain(wrapped.f(element, liveViewStateChanges)))
    await vi.waitFor(() => expect(events).toEqual(['shown', 'positioned']))
    expect(show).toHaveBeenCalledTimes(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(events).toEqual(['shown', 'positioned', 'unpositioned', 'hidden'])
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('passes the wrapped Mount’s messages through, then hides', async () => {
    const { element, hide } = popover()
    const wrapped = Anchor.topLayer({ name: 'Probe', f: () => Stream.make('a', 'b') })
    const collected = await Effect.runPromise(
      Stream.runCollect(wrapped.f(element, liveViewStateChanges)),
    )
    expect([...collected]).toEqual(['a', 'b'])
    expect(hide).toHaveBeenCalledTimes(1)
  })

  it('is a no-op on an element without the popover attribute, and the anchor still positions', async () => {
    const { element, show, hide } = popover(false)
    const wrapped = Anchor.topLayer({ name: 'Probe', f: () => Stream.make('positioned') })
    const collected = await Effect.runPromise(
      Stream.runCollect(wrapped.f(element, liveViewStateChanges)),
    )
    expect([...collected]).toEqual(['positioned'])
    expect(show).not.toHaveBeenCalled()
    expect(hide).not.toHaveBeenCalled()
  })

  it('is a no-op where the popover API is missing, and the anchor still positions', async () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'showPopover', { value: undefined })
    Object.defineProperty(element, 'hidePopover', { value: undefined })
    const positioned: Array<string> = []
    const wrapped = Anchor.topLayer({
      name: 'Probe',
      f: () =>
        Stream.unwrap(
          Effect.acquireRelease(
            Effect.sync(() => {
              positioned.push('positioned')
            }),
            () => Effect.void,
          ).pipe(Effect.as(Stream.never)),
        ),
    })
    const fiber = Effect.runFork(Stream.runDrain(wrapped.f(element, liveViewStateChanges)))
    await vi.waitFor(() => expect(positioned).toEqual(['positioned']))
    await Effect.runPromise(Fiber.interrupt(fiber))
  })
})
