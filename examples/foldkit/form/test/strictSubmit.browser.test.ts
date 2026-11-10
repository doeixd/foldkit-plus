/**
 * The waitlist's submit is strict: the button reads disabled while the email
 * is being checked, and the reducer refuses a submit then, so neither Enter
 * nor a press during the check submits, and nothing is left waiting to go
 * once the check answers. A real browser: Enter's implicit submission runs
 * only there.
 */
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { Model, init, update, view } from '../src/main.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  dispose = () => {}
  document.body.replaceChildren()
})

const button = (): HTMLButtonElement => {
  const found = document.querySelector('button[type="submit"]')
  if (!(found instanceof HTMLButtonElement)) throw new Error('no submit button')
  return found
}

const checking = () => document.body.textContent?.includes('◐') === true

test('Enter and a press during the email check submit nothing, now or after', async () => {
  const container = document.createElement('div')
  container.id = 'form-strict'
  document.body.append(container)
  const handle = Runtime.embed(Runtime.makeApplication({ Model, init, update, view, container }))
  dispose = () => handle.dispose()
  await vi.waitFor(() => expect(document.getElementById('email')).not.toBeNull())

  await userEvent.type(document.getElementById('name')!, 'Ada')
  await userEvent.type(document.getElementById('email')!, 'new@example.com')
  await vi.waitFor(() => expect(checking()).toBe(true))
  expect(button().getAttribute('aria-disabled')).toBe('true')
  // The button is only `aria-disabled`, so both reach the form's submit.
  await userEvent.keyboard('{Enter}')
  button().click()
  // Both landed inside the check, or this test proves nothing.
  expect(checking()).toBe(true)

  // The answer and any submit waiting on it land in one update, so the
  // first frame that shows the answer shows the submit too.
  await vi.waitFor(() => expect(checking()).toBe(false))
  expect(button().textContent).toBe('Join Waitlist')
  expect(button().hasAttribute('aria-disabled')).toBe(false)
})
