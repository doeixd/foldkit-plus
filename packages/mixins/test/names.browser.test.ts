/**
 * The browser facts behind the resolver's tables of names: a property that
 * writes an attribute of another name, and a physical side that is a logical
 * one. Each is read from a real element, not from the spec's prose.
 */
import { afterEach, expect, test } from 'vitest'

afterEach(() => document.body.replaceChildren())

const element = (html: string): HTMLElement => {
  const holder = document.createElement('div')
  holder.innerHTML = html
  document.body.append(holder)
  return holder.firstElementChild as HTMLElement
}

test.each([
  ['classList', '<div></div>', 'x', 'class'],
  ['relList', '<a></a>', 'next', 'rel'],
  ['defaultValue', '<input>', 'x', 'value'],
  ['defaultChecked', '<input type="checkbox">', true, 'checked'],
  ['defaultSelected', '<option></option>', true, 'selected'],
] as const)(
  'assigning %s writes the attribute named by its table',
  (key, html, value, attribute) => {
    const target = element(html)
    expect(target.hasAttribute(attribute)).toBe(false)
    ;(target as unknown as Record<string, unknown>)[key] = value
    expect(target.hasAttribute(attribute)).toBe(true)
  },
)

test.each([
  ['ariaControlsElements', 'aria-controls', (other: Element) => [other]],
  ['ariaActiveDescendantElement', 'aria-activedescendant', (other: Element) => other],
] as const)('assigning %s writes %s', (key, attribute, valueOf) => {
  const target = element('<div></div>')
  const other = element('<div></div>')
  ;(target as unknown as Record<string, unknown>)[key] = valueOf(other)
  expect(target.hasAttribute(attribute)).toBe(true)
})

test.each([
  ['ltr', 'right'],
  ['rtl', 'left'],
] as const)('in a %s line, %s is the inline end', (dir, side) => {
  const target = element(
    `<div dir="${dir}" style="position:absolute;inline-size:10px;inset-inline-end:5px;${side}:20px"></div>`,
  )
  // The physical side, written after it, replaced the logical one.
  expect(getComputedStyle(target).getPropertyValue(side)).toBe('20px')
  expect(getComputedStyle(target).getPropertyValue('inset-inline-end')).toBe('20px')
})
