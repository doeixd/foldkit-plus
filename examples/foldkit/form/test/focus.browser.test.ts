/**
 * A submit the form refuses moves focus to the first key it says is missing,
 * so the reader is told where to go. A real browser: a synthetic event moves
 * no focus, so the claim is only tested where focus actually moves.
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

const start = () => {
  const container = document.createElement('div')
  container.id = 'form-focus'
  document.body.append(container)
  const handle = Runtime.embed(Runtime.makeApplication({ Model, init, update, view, container }))
  dispose = () => handle.dispose()
}

const field = (id: string): HTMLInputElement | HTMLTextAreaElement => {
  const found = document.getElementById(id)
  if (!(found instanceof HTMLInputElement) && !(found instanceof HTMLTextAreaElement))
    throw new Error(`no text control with id ${id}`)
  return found
}

const submitWithEnter = async (id: string) => {
  await userEvent.click(field(id))
  await userEvent.keyboard('{Enter}')
}

test('an empty submit moves focus to the key it says is missing', async () => {
  start()
  await vi.waitFor(() => expect(document.getElementById('email')).not.toBeNull())
  await submitWithEnter('name')
  await vi.waitFor(() => expect(document.activeElement).toBe(field('email')))
})

test('a submit with two keys missing moves focus to the first of them', async () => {
  start()
  await vi.waitFor(() => expect(document.getElementById('email')).not.toBeNull())
  await userEvent.type(field('name'), 'A')
  await vi.waitFor(() => expect(field('name').getAttribute('aria-invalid')).toBe('true'))
  await submitWithEnter('email')
  await vi.waitFor(() => expect(document.activeElement).toBe(field('name')))
})
