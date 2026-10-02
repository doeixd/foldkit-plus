// @vitest-environment jsdom
/**
 * The application on the real runtime, with its list kept in a store the way
 * `entry.ts` keeps it in localStorage: a reload is a second runtime reading
 * the same store.
 */
import { KeyValueStore } from 'effect/persistence'
import * as Runtime from 'foldkit/runtime'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { Flags, Model, Page, flags, init, subscriptions, update } from '../src/main.js'

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
  document.body.replaceChildren()
})

const mount = (storage: Storage) => {
  const container = document.createElement('div')
  container.id = 'todo-runtime'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      Flags,
      flags,
      init,
      update,
      view: Page,
      subscriptions,
      container,
      resources: KeyValueStore.layerStorage(() => storage),
    }),
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
  const failing: Storage = Object.assign(Object.create(window.localStorage) as Storage, {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('QuotaExceededError')
    },
  })
  mount(failing)
  await vi.waitFor(() => expect(text()).toContain('No todos yet. Add one above!'))
  addTodo('Buy milk')
  await vi.waitFor(() => expect(status()).toBe('1 active, 0 completed'))
  checkboxOf('Buy milk').click()
  await vi.waitFor(() => expect(status()).toBe('0 active, 1 completed'))
})
