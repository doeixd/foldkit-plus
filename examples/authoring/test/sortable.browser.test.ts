/// <reference types="@vitest/browser-playwright" />
/**
 * Reorder beside a roving stop: the arrows navigate until Alt+Enter grabs a
 * row, then carry it; Space selects while nothing is held; focus stays on the
 * row the keyboard is on throughout.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { Frames } from 'foldkit-mixins/testing'
import { mountSortable } from '../src/sortable/mount.js'
import { pageStylesheet } from '../src/style.js'

let handle: { readonly dispose: () => void } | undefined
let frames: ReturnType<typeof Frames.track> | undefined

beforeEach(async () => {
  Style.install(pageStylesheet)
  frames = Frames.track()
  const container = document.createElement('div')
  container.id = 'sortable-host'
  document.body.appendChild(container)
  handle = mountSortable(container)
  await vi.waitFor(() => expect(rows()).toHaveLength(4))
})

afterEach(() => {
  handle?.dispose()
  frames?.dispose()
  document.body.replaceChildren()
})

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
const order = () => rows().map(row => row.textContent)
const on = (name: string) => rows().find(row => row.textContent === name)!

test('the arrows navigate, Space selects, and neither reorders', async () => {
  on('Urgent').focus()
  await frames?.settle()
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(document.activeElement).toBe(on('High')))
  await frames?.settle()
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(on('High').getAttribute('aria-selected')).toBe('true'))
  expect(order()).toEqual(['Urgent', 'High', 'Normal', 'Low'])
})

test('Alt+Enter grabs the row, an arrow carries it, and Enter drops it with focus still on it', async () => {
  on('High').focus()
  await frames?.settle()
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}')
  await vi.waitFor(() => expect(on('High').getAttribute('data-reorder')).toBe('held'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() =>
    expect(rows().some(row => row.hasAttribute('data-reorder-over'))).toBe(true),
  )
  // Nothing moves while it is held: the drop line is a mark, and focus stays on the held row.
  expect(order()).toEqual(['Urgent', 'High', 'Normal', 'Low'])
  expect(document.activeElement).toBe(on('High'))
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(order()).toEqual(['Urgent', 'Normal', 'High', 'Low']))
  await vi.waitFor(() => expect(document.activeElement).toBe(on('High')))
})

test('while a row is held, Space drops it instead of selecting', async () => {
  on('Low').focus()
  await frames?.settle()
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}')
  await vi.waitFor(() => expect(on('Low').getAttribute('data-reorder')).toBe('held'))
  await userEvent.keyboard('{ArrowUp}')
  await vi.waitFor(() =>
    expect(rows().some(row => row.hasAttribute('data-reorder-over'))).toBe(true),
  )
  await frames?.settle()
  await userEvent.keyboard(' ')
  await vi.waitFor(() => expect(order()).toEqual(['Urgent', 'High', 'Low', 'Normal']))
  await frames?.settle()
  expect(rows().some(row => row.hasAttribute('data-reorder'))).toBe(false)
  expect(on('Low').getAttribute('aria-selected')).not.toBe('true')
})

test('while a row is held, Escape puts it back where it was', async () => {
  on('Low').focus()
  await frames?.settle()
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}')
  await vi.waitFor(() => expect(on('Low').getAttribute('data-reorder')).toBe('held'))
  await userEvent.keyboard('{ArrowUp}')
  await vi.waitFor(() =>
    expect(rows().some(row => row.hasAttribute('data-reorder-over'))).toBe(true),
  )
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(rows().some(row => row.hasAttribute('data-reorder'))).toBe(false))
  expect(order()).toEqual(['Urgent', 'High', 'Normal', 'Low'])
})
