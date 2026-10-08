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

test('radio group selects with a click', async () => {
  mount()
  await page.getByRole('radio', { name: /phone/i }).click()
  await seen('Currently phone.')
})

test('radio labels select with a click', async () => {
  mount()
  await page.getByText('Phone', { exact: true }).click()
  await seen('Currently phone.')
})

test('radio descriptions select with a click', async () => {
  mount()
  await page.getByText('Only when something is on fire.').click()
  await seen('Currently phone.')
})

test('radio circles center on their labels’ first lines', async () => {
  mount()
  await seen('Currently email.')
  // Geometry, not text: the circle top-aligns against a taller first line,
  // so the style nudges it down. Fails at 3.5px without the nudge.
  await vi.waitFor(
    () => {
      const radio = document.querySelector('[role="radio"]') as HTMLElement
      const label = radio.parentElement?.querySelector('label') as HTMLElement
      const circle = radio.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(label)
      const lines = range.getClientRects()
      expect(lines.length).toBeGreaterThan(0)
      const line = lines[0]!
      const offset = Math.abs(circle.top + circle.height / 2 - (line.top + line.height / 2))
      expect(offset).toBeLessThanOrEqual(1.5)
    },
    { timeout: 10_000 },
  )
})

test('tabs switch panels', async () => {
  mount()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await seen('knobs for the whole page.')
})

test('dialog opens modal and cancel closes', async () => {
  mount()
  await page.getByRole('button', { name: 'Delete this project?' }).click()
  await seen('It goes for good, with its history.')
  expect(document.querySelector('dialog[open]')).not.toBeNull()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await vi.waitFor(
    () => expect(document.body.textContent ?? '').not.toContain('It goes for good'),
    { timeout: 10_000 },
  )
})

test('delete dialog centers its panel on the viewport', async () => {
  mount()
  await page.getByRole('button', { name: 'Delete this project?' }).click()
  await seen('It goes for good, with its history.')
  // Geometry, not text: the dialog element is a full-viewport layer, so an
  // uncentered panel sits at its top, ~350px above center here.
  await vi.waitFor(
    () => {
      const heading = document.querySelector('dialog[open] h2') as HTMLElement
      const panel = heading.parentElement as HTMLElement
      const box = panel.getBoundingClientRect()
      const offset = Math.abs(window.innerHeight / 2 - (box.top + box.height / 2))
      expect(offset).toBeLessThanOrEqual(2)
    },
    { timeout: 10_000 },
  )
})

test('delete dialog gaps its actions', async () => {
  mount()
  await page.getByRole('button', { name: 'Delete this project?' }).click()
  await seen('It goes for good, with its history.')
  // The Delete and Cancel buttons share a row: without the cluster gap the
  // row's computed gap is `normal`, which parses to no pixels at all. (The
  // × close button is skipped: its parent is the panel, which has its own
  // grid gap from the recipe.)
  await vi.waitFor(
    () => {
      const buttons = [...document.querySelectorAll('dialog[open] button')]
      const remove = buttons.find(button => button.textContent === 'Delete') as HTMLElement
      const gap = Number.parseFloat(getComputedStyle(remove.parentElement as HTMLElement).gap)
      expect(gap).toBeGreaterThan(0)
    },
    { timeout: 10_000 },
  )
})

test('feedback warns and confirms with alerts', async () => {
  mount()
  await seen('Storage almost full')
  await seen('All checks passed')
})

test('navigation trails a breadcrumb', async () => {
  mount()
  await seen('Launch checklist')
})

test('display shows people, keys, rules, placeholders, and a spinner', async () => {
  mount()
  await seen('Loading projects')
  expect(document.querySelectorAll('img[alt]')).toHaveLength(3)
  expect(document.querySelectorAll('kbd')).toHaveLength(2)
  expect(document.querySelectorAll('#display [role="separator"]')).toHaveLength(2)
  // Two skeleton bars, the skeleton disc, and the spinner wheel. Scoped to
  // the section: the success alert elsewhere is a status too.
  expect(document.querySelectorAll('#display [role="status"]')).toHaveLength(4)
})

test('collections show an empty state, a list, and a table', async () => {
  mount()
  await seen('No projects yet')
  await seen('Deploy finished')
  await seen('Review requested')
  await seen('Team plans')
})

test('shadow presets rewrite the strength knob on :root', async () => {
  mount()
  await page.getByRole('button', { name: 'Soft' }).click()
  await vi.waitFor(
    () =>
      expect(
        [...document.querySelectorAll('style')].some(element =>
          (element.textContent ?? '').includes('--fk-knob-shadow-strength:60%'),
        ),
      ).toBe(true),
    { timeout: 10_000 },
  )
})

test('slider offers the pointer over its bar and thumb', async () => {
  mount()
  await seen('Volume: 60')
  const thumb = document.querySelector('[role="slider"]') as HTMLElement
  const track = thumb.parentElement as HTMLElement
  expect(getComputedStyle(track).cursor).toBe('pointer')
  expect(getComputedStyle(thumb).cursor).toBe('pointer')
})

test('hover card opens anchored and hides on leave', async () => {
  mount()
  const trigger = page.getByRole('button', { name: 'A team member' })
  await trigger.hover()
  await seen('Wren Quan, design engineer.')
  // The Anchor behavior positioned the panel: it carries a placement.
  await vi.waitFor(() => expect(document.querySelector('[data-placement]')).not.toBeNull(), {
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Show details' }).hover()
  await vi.waitFor(() => expect(document.body.textContent ?? '').not.toContain('Wren Quan'), {
    timeout: 10_000,
  })
})

test('popover anchors and closes from its trigger', async () => {
  mount()
  await page.getByRole('button', { name: 'Show details' }).click()
  await seen('Project details, anchored live')
  await page.getByRole('button', { name: 'Show details' }).click()
  await vi.waitFor(
    () => expect(document.body.textContent ?? '').not.toContain('Project details, anchored live'),
    { timeout: 10_000 },
  )
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

test('date picker pages months and years with full labels', async () => {
  mount()
  await page.getByRole('button', { name: 'Pick a date' }).click()
  await page.getByRole('button', { name: 'Switch to month picker' }).click()
  await page.getByRole('button', { name: 'January 2026' }).click()
  const daysHeading = page.getByRole('button', { name: 'Switch to month picker' })
  await vi.waitFor(() => expect(daysHeading.query()?.textContent).toContain('January 2026'), {
    timeout: 10_000,
  })
  await daysHeading.click()
  await page.getByRole('button', { name: 'Switch to year picker' }).click()
  // A truncated year button would read '199', not '2024'.
  await page.getByRole('button', { name: '2024', exact: true }).click()
  await seen('2024')
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
