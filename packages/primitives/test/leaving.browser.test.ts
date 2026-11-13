/**
 * `Leaving` in a real browser: a part that stays drawn but is marked leaving
 * loses focus before it becomes inert, to the same fallback a removal would
 * use, and unmarking it restores its own inert without taking focus back.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it, vi, type MockInstance } from 'vitest'
import { FOCUS_RECOVERY_TO } from '../src/dom/focus-recovery.js'
import { HideOutside } from '../src/dom/layers.js'
import { LEAVING, Leaving } from '../src/dom/leaving.js'

const settled = () => new Promise(resolve => setTimeout(resolve, 20))

const start = (container: Element) =>
  Effect.runFork(Stream.runDrain(Leaving().f(container, liveViewStateChanges)))

const button = (name: string) => {
  const element = document.createElement('button')
  element.textContent = name
  return element
}

const mark = (element: Element, to?: string) => {
  if (to !== undefined) element.setAttribute(FOCUS_RECOVERY_TO, to)
  element.setAttribute(LEAVING, '')
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

it('moves focus to the next part before it becomes inert, then to the previous', async () => {
  const list = document.createElement('div')
  const a = button('a')
  const b = button('b')
  const c = button('c')
  list.append(a, b, c)
  document.body.append(list)
  let sawBody = false
  b.addEventListener('focusout', () => {
    // A focus move passes through the body before focusin. Inert first is the
    // case where the part is already inert when that happens.
    if (document.activeElement === document.body && b.inert) sawBody = true
  })
  const fiber = start(list)
  try {
    await settled()
    b.focus()
    mark(b)
    await settled()
    expect(document.activeElement).toBe(c)
    expect(b.inert).toBe(true)
    expect(sawBody).toBe(false)

    c.focus()
    mark(c)
    await settled()
    expect(document.activeElement).toBe(a)
    expect(c.inert).toBe(true)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('moves focus out of a descendant before the part becomes inert', async () => {
  const list = document.createElement('div')
  const row = document.createElement('div')
  const inside = button('inside')
  const next = button('next')
  row.append(inside)
  list.append(row, next)
  document.body.append(list)
  let sawBody = false
  inside.addEventListener('focusout', () => {
    if (document.activeElement === document.body && row.inert) sawBody = true
  })
  const fiber = start(list)
  try {
    await settled()
    inside.focus()
    mark(row)
    await settled()
    expect(document.activeElement).toBe(next)
    expect(row.inert).toBe(true)
    expect(sawBody).toBe(false)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('takes a named fallback, including one no selector could ask for', async () => {
  const field = document.createElement('input')
  field.id = 'a:b [c]'
  const row = button('row')
  document.body.append(field, row)
  const fiber = start(document.body)
  try {
    await settled()
    row.focus()
    mark(row, 'a:b [c]')
    await settled()
    expect(document.activeElement).toBe(field)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('ignores an ambiguous name and a missing one', async () => {
  const list = document.createElement('div')
  const next = button('next')
  const row = button('row')
  const twin = button('twin')
  twin.id = 'twin'
  const other = button('other')
  other.id = 'twin'
  list.append(row, next)
  document.body.append(list, twin, other)
  const fiber = start(document.body)
  try {
    await settled()
    row.focus()
    mark(row, 'twin')
    await settled()
    expect(document.activeElement).toBe(next)

    const orphan = button('orphan')
    list.append(orphan)
    orphan.focus()
    mark(orphan, 'missing')
    await settled()
    expect(document.activeElement).toBe(next)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('restores the inert the part had and does not take focus back', async () => {
  const kept = button('kept')
  kept.inert = true
  const open = button('open')
  const next = button('next')
  document.body.append(kept, open, next)
  const fiber = start(document.body)
  try {
    await settled()
    open.focus()
    mark(open)
    mark(kept)
    await settled()
    expect(document.activeElement).toBe(next)
    expect(open.inert).toBe(true)
    open.removeAttribute(LEAVING)
    kept.removeAttribute(LEAVING)
    await settled()
    expect(open.inert).toBe(false)
    expect(kept.inert).toBe(true)
    expect(document.activeElement).toBe(next)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('leaves a descendant that is still leaving inert when its parent is shown', async () => {
  const parent = document.createElement('div')
  const child = button('child')
  parent.append(child)
  document.body.append(parent)
  const fiber = start(document.body)
  try {
    await settled()
    mark(parent)
    mark(child)
    await settled()
    expect(parent.inert).toBe(true)
    expect(child.inert).toBe(true)
    parent.removeAttribute(LEAVING)
    await settled()
    expect(parent.inert).toBe(false)
    expect(child.inert).toBe(true)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('unmarking a part leaves the other parts inert, without walking its subtree', async () => {
  const shown = document.createElement('div')
  const inside = button('inside')
  const staying = document.createElement('div')
  shown.append(inside)
  document.body.append(shown, staying)
  const fiber = start(document.body)
  let walk: MockInstance | undefined
  try {
    await settled()
    mark(shown)
    mark(inside)
    mark(staying)
    await settled()
    walk = vi.spyOn(Element.prototype, 'querySelectorAll')
    shown.removeAttribute(LEAVING)
    await settled()
    expect(shown.inert).toBe(false)
    expect(inside.inert).toBe(true)
    expect(staying.inert).toBe(true)
    inside.removeAttribute(LEAVING)
    await settled()
    expect(inside.inert).toBe(false)
    expect(staying.inert).toBe(true)
    expect(walk).not.toHaveBeenCalled()
  } finally {
    walk?.mockRestore()
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('keeps a nested container to its own fallback', async () => {
  const outer = document.createElement('div')
  const inner = document.createElement('div')
  const row = button('row')
  const decoy = button('decoy')
  const innerTarget = button('inner')
  innerTarget.id = 'same'
  const outerTarget = button('outer')
  outerTarget.id = 'same'
  inner.append(row, decoy, innerTarget)
  outer.append(inner, outerTarget)
  document.body.append(outer)
  const outerFiber = start(outer)
  const innerFiber = start(inner)
  try {
    await settled()
    row.focus()
    mark(row, 'same')
    await settled()
    expect(document.activeElement).toBe(innerTarget)
    expect(row.inert).toBe(true)
  } finally {
    await Effect.runPromise(Fiber.interrupt(innerFiber))
    await Effect.runPromise(Fiber.interrupt(outerFiber))
  }
})

it('does not take focus that is already outside the part', async () => {
  const row = button('row')
  const next = button('next')
  const outside = button('outside')
  document.body.append(row, next, outside)
  const fiber = start(document.body)
  try {
    await settled()
    outside.focus()
    mark(row)
    await settled()
    expect(document.activeElement).toBe(outside)
    expect(row.inert).toBe(true)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('focuses a fallback HideOutside had made inert', async () => {
  const outside = button('outside')
  const overlay = document.createElement('div')
  const inside = button('inside')
  overlay.append(inside)
  document.body.append(outside, overlay)
  const hide = Effect.runFork(Stream.runDrain(HideOutside().f(overlay, liveViewStateChanges)))
  const leave = start(overlay)
  try {
    await settled()
    expect(outside.inert || outside.getAttribute('aria-hidden') === 'true').toBe(true)
    inside.focus()
    mark(overlay)
    await settled()
    expect(document.activeElement).toBe(outside)
    expect(outside.inert).toBe(false)
    expect(outside.getAttribute('aria-hidden')).toBeNull()
    expect(overlay.inert).toBe(true)
  } finally {
    await Effect.runPromise(Fiber.interrupt(leave))
    await Effect.runPromise(Fiber.interrupt(hide))
  }
})

it('releases its observer on teardown and recovers each widget on its own', async () => {
  const left = document.createElement('div')
  const leftA = button('left a')
  const leftB = button('left b')
  left.append(leftA, leftB)
  const right = document.createElement('div')
  const rightA = button('right a')
  const rightB = button('right b')
  right.append(rightA, rightB)
  document.body.append(left, right)
  const leftFiber = start(left)
  const rightFiber = start(right)
  try {
    await settled()
    leftA.focus()
    mark(leftA)
    await settled()
    expect(document.activeElement).toBe(leftB)
    expect(leftA.inert).toBe(true)

    rightB.focus()
    mark(rightB)
    await settled()
    expect(document.activeElement).toBe(rightA)

    await Effect.runPromise(Fiber.interrupt(leftFiber))
    await settled()
    expect(leftA.inert).toBe(false)
    const leftC = button('left c')
    left.append(leftC)
    leftB.focus()
    mark(leftB)
    await settled()
    expect(document.activeElement).toBe(leftB)
    expect(leftB.inert).toBe(false)
  } finally {
    await Effect.runPromise(Fiber.interrupt(leftFiber))
    await Effect.runPromise(Fiber.interrupt(rightFiber))
  }
})
