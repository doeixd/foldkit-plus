/**
 * The checkbox group in a real browser: each option's row, the label a finger
 * presses, is at least 24px tall, and its box is drawn larger than the
 * browser's 13px default.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import * as Runtime from 'foldkit/runtime'
import { CheckboxGroup as CheckboxGroupView } from '../src/checkbox-group/view.js'
import * as CheckboxGroup from '../src/checkbox-group/app.js'

afterEach(() => {
  document.body.replaceChildren()
})

test('each option is a finger’s target, its box a size to see', async () => {
  await page.viewport(390, 844)
  const container = document.createElement('div')
  container.id = 'toppings'
  document.body.appendChild(container)
  Runtime.embed(
    Runtime.makeElement({
      Model: CheckboxGroup.Model,
      init: () => CheckboxGroup.initial,
      update: CheckboxGroup.update,
      view: (model, h) => CheckboxGroupView(model, h),
      container,
    }),
  )
  await vi.waitFor(() => expect(document.querySelectorAll('fieldset label')).toHaveLength(3))
  for (const label of document.querySelectorAll('fieldset label')) {
    expect(label.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
    expect(label.querySelector('input')!.getBoundingClientRect().width).toBe(16)
  }
})
