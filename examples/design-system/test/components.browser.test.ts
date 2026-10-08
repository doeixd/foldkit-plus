/**
 * The new pickers, menu, date, toast, and files in a real browser: each one
 * opens, commits through its fold, and shows the result. Mounts the whole
 * page fresh per test, as the tooltip test does.
 */
import { Style } from 'foldkit-mixins'
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

import { initModel, update, view, Message, Model } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { subscriptions } from '../src/subscriptions.js'

afterEach(() => {
  document.body.replaceChildren()
})

const mount = (): void => {
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  Runtime.run(
    Runtime.makeApplication({
      Model,
      init: () => ({ model: initModel({ year: 2026, month: 10, day: 8 }) }),
      update,
      view,
      subscriptions,
      container,
      devTools: { Message },
    }),
  )
}

const seen = (text: string, timeout = 10_000): Promise<void> =>
  vi.waitFor(() => expect(document.body.textContent ?? '').toContain(text), {
    timeout,
  }) as unknown as Promise<void>

test('menu picks an action', async () => {
  mount()
  await page.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Forward' }).click()
  await seen('Chose Forward.')
})

test('listbox picks a frequency', async () => {
  mount()
  await page.getByRole('button', { name: 'Select frequency' }).click()
  await page.getByRole('option', { name: 'Weekly' }).click()
  await seen('Weekly')
})

test('combobox filters and picks a city', async () => {
  mount()
  const input = page.getByPlaceholder('Search cities…')
  await input.click()
  await input.fill('qui')
  await page.getByRole('option', { name: 'Quito' }).click()
  await vi.waitFor(
    () =>
      expect(
        (document.querySelector('input[placeholder="Search cities…"]') as HTMLInputElement)?.value,
      ).toBe('Quito'),
    { timeout: 10_000 },
  )
})

test('date picker picks the 15th', async () => {
  mount()
  await page.getByRole('button', { name: 'Pick a date' }).click()
  await page.getByRole('button', { name: / 15, / }).click()
  await seen('-15.')
})

test('notify shows a toast that dismisses itself', async () => {
  mount()
  await page.getByRole('button', { name: 'Notify' }).click()
  await seen('Your changes are live.')
  await vi.waitFor(
    () => expect(document.body.textContent ?? '').not.toContain('Your changes are live.'),
    { timeout: 15_000 },
  )
})

test('drop zone lists a chosen file and removes it', async () => {
  mount()
  await vi.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull(), {
    timeout: 10_000,
  })
  // The test runs in the page: hand the hidden input files directly, as a
  // drop or a file dialog would.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const transfer = new DataTransfer()
  transfer.items.add(new File(['hello'], 'note.txt', { type: 'text/plain' }))
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await seen('note.txt')
  await page.getByRole('button', { name: 'Remove' }).click()
  await vi.waitFor(() => expect(document.body.textContent ?? '').not.toContain('note.txt'), {
    timeout: 10_000,
  })
})
