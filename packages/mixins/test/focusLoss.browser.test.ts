/// <reference types="@vitest/browser-playwright" />
/** `watchFocusLoss` records a removal that took the focused node, and only that. */
import { afterEach, expect, test } from 'vitest'
import { watchFocusLoss } from '../../../test-support/focusLoss.mjs'

afterEach(() => document.body.replaceChildren())

const drawn = () => {
  const root = document.createElement('div')
  const field = document.createElement('input')
  const other = document.createElement('button')
  const wrapper = document.createElement('section')
  wrapper.append(field)
  root.append(wrapper, other)
  document.body.append(root)
  return { root, wrapper, field, other }
}

// The three ways a differ or a caller takes a node out.
const removals: ReadonlyArray<
  readonly [string, (parts: ReturnType<typeof drawn>, node: Element) => void]
> = [
  ['removeChild', ({ root }, node) => root.removeChild(node)],
  ['replaceChild', ({ root }, node) => root.replaceChild(document.createElement('i'), node)],
  ['remove', (_, node) => node.remove()],
]

test.each(removals)('%s of the focused node, or of an ancestor, is recorded', (_, take) => {
  const parts = drawn()
  parts.field.focus()
  const watch = watchFocusLoss()
  try {
    take(parts, parts.wrapper)
    expect(watch.losses).toHaveLength(1)
    expect(watch.losses[0]?.focused).toBe(parts.field)
    expect(watch.losses[0]?.removed).toBe(parts.wrapper)
  } finally {
    watch.dispose()
  }
})

test.each(removals)('%s of a node that does not hold focus is not recorded', (_, take) => {
  const parts = drawn()
  parts.field.focus()
  const watch = watchFocusLoss()
  try {
    take(parts, parts.other)
    expect(watch.losses).toEqual([])
  } finally {
    watch.dispose()
  }
})

test('with nothing focused, no removal is recorded', () => {
  const parts = drawn()
  const watch = watchFocusLoss()
  try {
    parts.root.removeChild(parts.wrapper)
    expect(watch.losses).toEqual([])
  } finally {
    watch.dispose()
  }
})

test('dispose puts the prototypes back, and a second dispose does nothing', () => {
  const { removeChild, replaceChild } = Node.prototype
  const { remove } = Element.prototype
  const watch = watchFocusLoss()
  expect(Node.prototype.removeChild).not.toBe(removeChild)
  watch.dispose()
  watch.dispose()
  expect(Node.prototype.removeChild).toBe(removeChild)
  expect(Node.prototype.replaceChild).toBe(replaceChild)
  expect(Element.prototype.remove).toBe(remove)
  const parts = drawn()
  parts.field.focus()
  parts.root.removeChild(parts.wrapper)
  expect(watch.losses).toEqual([])
})
