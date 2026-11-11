// @vitest-environment jsdom
/**
 * The application on the real runtime, with its list kept in a store the way
 * `entry.ts` keeps it in localStorage: a reload is a second runtime reading
 * the same store.
 */
import { KeyValueStore } from 'effect/persistence'
import * as Runtime from 'foldkit/runtime'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Flags, Model, TodosMirror, flags, routed, subscriptions, view } from '../src/main.js'
import { modelWithTodos } from './fixtures.js'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})

const running: Array<() => void> = []

afterEach(() => {
  for (const dispose of running.splice(0)) dispose()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  document.body.replaceChildren()
})

const mount = (storage: Storage) => {
  const container = document.createElement('div')
  container.id = 'todo-runtime'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeApplication({
      Model,
      Flags,
      ...routed,
      view,
      subscriptions,
      container,
      resources: KeyValueStore.layerStorage(() => storage),
    }),
    { flags },
  )
  running.push(() => handle.dispose())
}

const text = (): string => document.body.textContent ?? ''

const status = (): string => document.querySelector('[role="status"]')?.textContent ?? ''

const addTodo = (value: string): void => {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="New todo"]')
  if (input === null) throw new Error('no New todo input')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const form = input.closest('form')
  if (form === null) throw new Error('the New todo input is not in a form')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

const checkboxOf = (name: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[aria-label="${name}"]`)
  if (found === null) throw new Error(`no checkbox labelled ${name}`)
  return found
}

test('a todo added before a reload is there after it', async () => {
  mount(window.localStorage)
  await vi.waitFor(() => expect(text()).toContain('No todos yet. Add one above!'))
  addTodo('Water the plants')
  await vi.waitFor(() => expect(status()).toBe('1 active, 0 completed'))
  // Written at once, as upstream wrote it, not after the mirror's default 250 ms.
  await vi.waitFor(
    () => expect(window.localStorage.getItem('todos')).toContain('Water the plants'),
    { timeout: 100 },
  )
  for (const dispose of running.splice(0)) dispose()
  document.body.replaceChildren()

  mount(window.localStorage)
  await vi.waitFor(() => expect(status()).toBe('1 active, 0 completed'))
  expect(text()).toContain('Water the plants')
})

test('keeps in-memory changes when saving fails', async () => {
  const failing: Storage = {
    length: 0,
    clear: () => {},
    key: () => null,
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
  mount(failing)
  await vi.waitFor(() => expect(text()).toContain('No todos yet. Add one above!'))
  addTodo('Buy milk')
  await vi.waitFor(() => expect(status()).toBe('1 active, 0 completed'))
  checkboxOf('Buy milk').click()
  await vi.waitFor(() => expect(status()).toBe('0 active, 1 completed'))
})

const stored = JSON.stringify({ version: 1, keys: TodosMirror.encode(modelWithTodos) })

const listed = (): ReadonlyArray<string> =>
  Array.from(document.querySelectorAll('li'), item => item.textContent ?? '')

const filterButton = (name: string): HTMLButtonElement => {
  const found = Array.from(document.querySelectorAll('button')).find(
    button => button.textContent === name,
  )
  if (found === undefined) throw new Error(`no ${name} filter`)
  return found
}

test("a link's filter opens over this device's stored list", async () => {
  window.localStorage.setItem('todos', stored)
  window.history.replaceState(null, '', '/?filter=Completed')
  mount(window.localStorage)
  // The list from the store and the filter from the URL, both read by `init`.
  await vi.waitFor(() => expect(status()).toBe('2 active, 1 completed'))
  expect(listed()).toEqual([expect.stringContaining('Done task')])
})

test('a filter chosen is a history entry, and back returns to the last one', async () => {
  window.localStorage.setItem('todos', stored)
  mount(window.localStorage)
  await vi.waitFor(() => expect(listed()).toHaveLength(3))
  filterButton('Active').click()
  await vi.waitFor(() => expect(window.location.search).toBe('?filter=Active'))
  expect(listed()).toHaveLength(2)
  window.history.back()
  await vi.waitFor(() => expect(window.location.search).toBe(''))
  await vi.waitFor(() => expect(listed()).toHaveLength(3))
})
