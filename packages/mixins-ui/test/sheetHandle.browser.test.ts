/// <reference types="@vitest/browser-playwright" />
/**
 * The Sheet's handle as a control: with more than one point it is a focusable
 * separator that names, and holds, the point the sheet rests at, and the arrow
 * keys, Home and End step between the points; with one it is decoration and
 * stays hidden from assistive technology. Escape still closes the sheet.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { open } from './sheetFixture.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const value = (handle: HTMLElement) => handle.getAttribute('aria-valuenow')
const snap = (panel: HTMLElement) => panel.style.getPropertyValue('--fk-sheet-snap')

test('with one point the handle is decoration', async () => {
  const { grabber, dispose } = await open({})
  try {
    expect(grabber.getAttribute('aria-hidden')).toBe('true')
    expect(grabber.hasAttribute('role')).toBe(false)
    expect(grabber.hasAttribute('tabindex')).toBe(false)
  } finally {
    dispose()
  }
})

test('with points the handle is a named separator holding the point the sheet rests at', async () => {
  const { grabber, panel, dispose } = await open({ points: [0.4, 0.7, 1] })
  try {
    expect(grabber.hasAttribute('aria-hidden')).toBe(false)
    expect(grabber.getAttribute('role')).toBe('separator')
    expect(grabber.getAttribute('tabindex')).toBe('0')
    expect(grabber.getAttribute('aria-label')).toBe('Resize sheet')
    expect(grabber.getAttribute('aria-orientation')).toBe('horizontal')
    expect(grabber.getAttribute('aria-controls')).toBe(panel.id)
    expect([value(grabber), grabber.getAttribute('aria-valuemin')]).toEqual(['40', '40'])
    expect(grabber.getAttribute('aria-valuemax')).toBe('100')
  } finally {
    dispose()
  }
})

test('the application words the handle, and a side sheet is vertical', async () => {
  const { grabber, dispose } = await open(
    { points: [0.5, 1], side: 'right' },
    {},
    { words: { handle: 'Redimensionner' } },
  )
  try {
    expect(grabber.getAttribute('aria-label')).toBe('Redimensionner')
    expect(grabber.getAttribute('aria-orientation')).toBe('vertical')
  } finally {
    dispose()
  }
})

test('the arrows, Home and End step a bottom sheet between its points, and stop at the ends', async () => {
  const { grabber, panel, dispose } = await open({ points: [0.4, 0.7, 1] })
  try {
    grabber.focus()
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(value(grabber)).toBe('70'))
    expect(snap(panel)).toBe('0.7')
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(value(grabber)).toBe('100'))
    await userEvent.keyboard('{ArrowUp}')
    expect(value(grabber)).toBe('100')
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(value(grabber)).toBe('70'))
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(value(grabber)).toBe('40'))
    await userEvent.keyboard('{ArrowDown}')
    expect(value(grabber)).toBe('40')
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(value(grabber)).toBe('100'))
    expect(document.activeElement).toBe(grabber)
  } finally {
    dispose()
  }
})

test.each([
  ['top', 'ArrowDown', 'ArrowUp'],
  ['left', 'ArrowRight', 'ArrowLeft'],
  ['right', 'ArrowLeft', 'ArrowRight'],
] as const)('a %s sheet is raised by %s and lowered by %s', async (side, raise, lower) => {
  const { grabber, dispose } = await open({ points: [0.5, 1], side })
  try {
    grabber.focus()
    await userEvent.keyboard(`{${lower}}`)
    expect(value(grabber)).toBe('50')
    await userEvent.keyboard(`{${raise}}`)
    await vi.waitFor(() => expect(value(grabber)).toBe('100'))
    await userEvent.keyboard(`{${lower}}`)
    await vi.waitFor(() => expect(value(grabber)).toBe('50'))
  } finally {
    dispose()
  }
})

test('the handle shows a ring while the keys have focus', async () => {
  const { grabber, dispose } = await open({ points: [0.5, 1] })
  try {
    grabber.focus()
    await userEvent.keyboard('{ArrowUp}')
    await vi.waitFor(() => expect(value(grabber)).toBe('100'))
    expect(grabber.matches(':focus-visible')).toBe(true)
    // The recipe's own ring, which a browser's default (`auto`) is not.
    expect(getComputedStyle(grabber).outlineStyle).toBe('solid')
  } finally {
    dispose()
  }
})

test('keys with a modifier are left to the browser', async () => {
  const { grabber, dispose } = await open({ points: [0.5, 1] })
  try {
    grabber.focus()
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(value(grabber)).toBe('50')
  } finally {
    dispose()
  }
})

test('Escape on the handle still closes the sheet', async () => {
  const { grabber, dispose } = await open({ points: [0.5, 1], isAnimated: false })
  try {
    grabber.focus()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.getElementById('edge-panel')).toBeNull())
  } finally {
    dispose()
  }
})
