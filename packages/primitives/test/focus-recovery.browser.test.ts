/**
 * `FocusRecovery` in a real browser: focus inside a part that a view removes
 * goes where the part says, where its neighbours are, or to the part that held
 * it, and never anywhere else.
 */
import { Effect, Fiber, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import { afterEach, expect, it } from 'vitest'
import { FOCUS_RECOVERY_PART, FOCUS_RECOVERY_TO, FocusRecovery } from '../src/dom/focus-recovery.js'

const settled = () => new Promise(resolve => setTimeout(resolve, 10))

const start = (container: Element) =>
  Effect.runFork(Stream.runDrain(FocusRecovery().f(container, liveViewStateChanges)))

const marked = <E extends Element>(element: E, to?: string): E => {
  element.setAttribute(FOCUS_RECOVERY_PART, '')
  if (to !== undefined) element.setAttribute(FOCUS_RECOVERY_TO, to)
  return element
}

const row = (name: string, to?: string) => {
  const element = marked(document.createElement('li'), to)
  element.tabIndex = -1
  element.textContent = name
  return element
}

afterEach(() => {
  document.body.replaceChildren()
})

it('moves focus to the next part, then the previous one when the last goes', async () => {
  const list = document.createElement('ul')
  const a = row('a')
  const b = row('b')
  const c = row('c')
  list.append(a, b, c)
  document.body.append(list)
  const fiber = start(list)
  try {
    await settled()
    b.focus()
    b.remove()
    await settled()
    expect(document.activeElement).toBe(c)

    c.focus()
    c.remove()
    await settled()
    expect(document.activeElement).toBe(a)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('takes the fallback a part names, even an id no CSS selector could ask for', async () => {
  const field = document.createElement('input')
  field.id = 'a:b [c]'
  const clear = document.createElement('button')
  clear.textContent = 'Clear'
  const chips = document.createElement('ul')
  const chip = row('alpha', 'a:b [c]')
  chips.append(chip)
  document.body.append(field, chips, clear)
  const fiber = start(document.body)
  try {
    await settled()
    chip.focus()
    chip.remove()
    await settled()
    expect(document.activeElement).toBe(field)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('takes the nearest named fallback above a part and ignores an ambiguous one', async () => {
  const field = document.createElement('input')
  field.id = 'search'
  const list = marked(document.createElement('ul'), 'search')
  const first = row('one')
  const second = row('two')
  list.append(first, second)
  document.body.append(field, list)
  const fiber = start(document.body)
  try {
    await settled()
    first.focus()
    first.remove()
    await settled()
    expect(document.activeElement).toBe(field)

    const noTarget = row('orphan', 'missing')
    list.append(second, noTarget)
    noTarget.focus()
    noTarget.remove()
    await settled()
    expect(document.activeElement).toBe(second)

    const twin = document.createElement('button')
    twin.id = 'twin'
    const other = twin.cloneNode(true) as HTMLElement
    const anchor = row('anchor')
    const toTwin = row('twin row', 'twin')
    list.append(anchor, toTwin)
    document.body.append(twin, other)
    toTwin.focus()
    toTwin.remove()
    await settled()
    // Two elements answer to the name, so it names no fallback and focus
    // stays in the part's own neighbourhood.
    expect(document.activeElement).toBe(anchor)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('goes back to the part that held a removed child, as a tree row does', async () => {
  const tree = document.createElement('ul')
  const parent = marked(document.createElement('li'))
  parent.tabIndex = -1
  const children = document.createElement('ul')
  const child = marked(document.createElement('li'))
  child.tabIndex = -1
  children.append(child)
  parent.append(children)
  tree.append(parent)
  document.body.append(tree)
  const fiber = start(tree)
  try {
    await settled()
    child.focus()
    child.remove()
    await settled()
    expect(document.activeElement).toBe(parent)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('keeps a nested root to its own parts', async () => {
  const outer = document.createElement('ul')
  const before = row('before')
  const host = row('host')
  const inner = document.createElement('div')
  const nested = marked(document.createElement('button'))
  nested.textContent = 'nested'
  inner.append(nested)
  host.append(inner)
  outer.append(before, host)
  document.body.append(outer)
  const outerFiber = start(outer)
  const innerFiber = start(inner)
  try {
    await settled()
    nested.focus()
    nested.remove()
    await settled()
    // The nested root has no fallback of its own, so nothing takes focus. The
    // root around it never claims a part inside the nested one.
    expect(document.activeElement).toBe(document.body)
  } finally {
    await Effect.runPromise(Fiber.interrupt(innerFiber))
    await Effect.runPromise(Fiber.interrupt(outerFiber))
  }
})

it('never takes focus back from where the reader moved it', async () => {
  const list = document.createElement('ul')
  const a = row('a')
  const b = row('b')
  const c = row('c')
  list.append(a, b, c)
  const outside = document.createElement('button')
  document.body.append(list, outside)
  const fiber = start(list)
  try {
    await settled()
    b.focus()
    outside.focus()
    b.remove()
    await settled()
    expect(document.activeElement).toBe(outside)

    // The reader left again and did not come back, so the part they left no
    // longer answers for a removal.
    c.focus()
    outside.focus()
    await settled()
    outside.remove()
    c.remove()
    await settled()
    expect(document.activeElement).toBe(document.body)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('returns focus to a part that moved, and leaves it nowhere once it goes', async () => {
  const list = document.createElement('ul')
  const a = row('a')
  const b = row('b')
  list.append(a, b)
  document.body.append(list)
  const fiber = start(list)
  try {
    await settled()
    b.focus()
    list.append(b)
    await settled()
    expect(document.activeElement).toBe(b)

    b.remove()
    await settled()
    expect(document.activeElement).toBe(a)
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
})

it('releases its listeners on teardown and recovers each widget on its own', async () => {
  const left = document.createElement('ul')
  const leftA = row('left a')
  const leftB = row('left b')
  left.append(leftA, leftB)
  const right = document.createElement('ul')
  const rightA = row('right a')
  const rightB = row('right b')
  right.append(rightA, rightB)
  document.body.append(left, right)
  const leftFiber = start(left)
  const rightFiber = start(right)
  try {
    await settled()
    leftA.focus()
    leftA.remove()
    await settled()
    expect(document.activeElement).toBe(leftB)

    rightB.focus()
    rightB.remove()
    await settled()
    expect(document.activeElement).toBe(rightA)

    // A neighbour stays after it, so a root still attached would take focus.
    const leftC = row('left c')
    left.append(leftC)
    leftB.focus()
    await Effect.runPromise(Fiber.interrupt(leftFiber))
    leftB.remove()
    await settled()
    // Its root released: focus it held goes nowhere, not to its neighbour.
    expect(document.activeElement).toBe(document.body)
  } finally {
    await Effect.runPromise(Fiber.interrupt(leftFiber))
    await Effect.runPromise(Fiber.interrupt(rightFiber))
  }
})
