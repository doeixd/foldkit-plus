/**
 * The hint tooltip in a real browser: hovering the trigger shows the panel
 * after the delay, and leaving hides it. Floating UI positioning only runs
 * against real layout, so this lives here rather than in jsdom.
 */
import { Style } from 'foldkit-mixins'
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

import { initModel, update, view, Message, Model } from '../src/main.js'

const modelForTests = initModel({ year: 2026, month: 10, day: 8 })
import { stylesheet } from '../src/style.js'
import { subscriptions } from '../src/subscriptions.js'

afterEach(() => {
  document.body.replaceChildren()
})

test('hover shows the hint, leaving hides it', async () => {
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  Runtime.run(
    Runtime.makeApplication({
      Model,
      init: () => ({ model: modelForTests }),
      update,
      view,
      subscriptions,
      container,
      devTools: { Message },
    }),
  )

  const trigger = page.getByRole('button', { name: 'Hover or focus me' })
  await vi.waitFor(() => expect(trigger.query()).not.toBeNull(), { timeout: 10_000 })
  // The trigger is a real button, so keyboard users can reach it too.
  expect(trigger.query()?.tagName).toBe('BUTTON')
  expect(document.querySelector('[role="tooltip"]')).toBeNull()

  await trigger.hover()
  await vi.waitFor(
    () => expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('A helpful hint'),
    { timeout: 10_000 },
  )

  await page.getByRole('heading', { name: 'Components in a shadcn skin' }).hover()
  await vi.waitFor(() => expect(document.querySelector('[role="tooltip"]')).toBeNull(), {
    timeout: 10_000,
  })
})
