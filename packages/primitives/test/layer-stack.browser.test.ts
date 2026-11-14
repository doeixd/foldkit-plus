/// <reference types="@vitest/browser-playwright" />
/**
 * Modal layers drawn as siblings, as dialogs portaled to the body are: the
 * topmost layer owns containment. An outer `FocusScope` yields while a later
 * layer is open, and an outer `HideOutside` does not hide a layer opened over
 * it, even one drawn into a container that was already outside the outer.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FocusScope } from '../src/dom/focus-scope.js'
import { HideOutside } from '../src/dom/layers.js'

const fibers: Array<Fiber.Fiber<unknown>> = []
afterEach(async () => {
  await Promise.all(fibers.splice(0).map(fiber => Effect.runPromise(Fiber.interrupt(fiber))))
  document.body.replaceChildren()
})

/** A dialog-like layer with two buttons, each Mount of the modal policy run on it. */
const layer = (
  name: string,
  into: Element,
  options: { readonly hide: boolean } = { hide: true },
) => {
  const element = document.createElement('div')
  element.id = name
  element.setAttribute('role', 'dialog')
  for (const label of ['first', 'second']) {
    const button = document.createElement('button')
    button.id = `${name}-${label}`
    button.textContent = `${name} ${label}`
    element.append(button)
  }
  into.append(element)
  const run = (stream: Stream.Stream<never>) => {
    const fiber = Effect.runFork(Stream.runDrain(stream))
    fibers.push(fiber)
    return fiber
  }
  const scope = run(
    FocusScope({ contain: true, restore: true, initialFocus: null }).f(
      element,
      liveViewStateChanges,
    ),
  )
  const hide = options.hide ? run(HideOutside().f(element, liveViewStateChanges)) : undefined
  return {
    element,
    close: async () => {
      if (hide !== undefined) await Effect.runPromise(Fiber.interrupt(hide))
      await Effect.runPromise(Fiber.interrupt(scope))
      element.remove()
    },
  }
}

const frames = () => new Promise<void>(resolve => setTimeout(resolve, 50))
const focused = () => document.activeElement?.id

it('keeps focus in the second of two sibling layers, and gives it back when that one closes', async () => {
  const opener = document.createElement('button')
  opener.id = 'opener'
  const app = document.createElement('main')
  app.append(opener)
  document.body.append(app)
  opener.focus()
  const outer = layer('outer', document.body)
  await expect.poll(focused).toBe('outer-first')
  await frames()
  ;(document.getElementById('outer-second') as HTMLElement).focus()
  const inner = layer('inner', document.body)
  await expect.poll(focused).toBe('inner-first')
  await frames()
  // The outer layer neither pulls focus back nor hides the inner one.
  expect(focused()).toBe('inner-first')
  expect(inner.element.inert).toBe(false)
  expect(outer.element.inert).toBe(true)
  await userEvent.keyboard('{Tab}')
  expect(focused()).toBe('inner-second')
  await userEvent.keyboard('{Tab}')
  expect(focused()).toBe('inner-first')
  await inner.close()
  await expect.poll(focused).toBe('outer-second')
  await expect.poll(() => outer.element.inert).toBe(false)
  await userEvent.keyboard('{Tab}')
  expect(focused()).toBe('outer-first')
  await outer.close()
  await expect.poll(focused).toBe('opener')
})

it('does not hide a layer drawn into a container that was outside the outer layer', async () => {
  const app = document.createElement('main')
  const portal = document.createElement('div')
  portal.id = 'portal'
  document.body.append(app, portal)
  layer('outer', app)
  await frames()
  expect(portal.inert).toBe(true)
  const inner = layer('inner', portal)
  await expect.poll(() => portal.inert).toBe(false)
  await expect.poll(focused).toBe('inner-first')
  expect(app.inert).toBe(true)
  await inner.close()
  await expect.poll(() => portal.inert).toBe(true)
  expect(app.inert).toBe(false)
})

it('contains again once the layer opened over it closes', async () => {
  const outside = document.createElement('button')
  outside.id = 'outside'
  document.body.append(outside)
  layer('outer', document.body, { hide: false })
  await expect.poll(focused).toBe('outer-first')
  const inner = layer('inner', document.body, { hide: false })
  await expect.poll(focused).toBe('inner-first')
  await inner.close()
  await expect.poll(focused).toBe('outer-first')
  outside.focus()
  expect(focused()).toBe('outer-first')
})
