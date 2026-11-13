import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, initial, update, view } from '../src/ui-sdk-search-field.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const input = (placement: string) =>
  document.querySelector<HTMLInputElement>(`#${placement} input`)!

it('opens and clears each routed search independently in a real browser', async () => {
  const container = document.createElement('div')
  container.id = 'search-fields'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({ Model, container, init: () => ({ model: initial }), update, view }),
  ).dispose

  await vi.waitFor(() => expect(document.querySelector('#first input')).not.toBeNull())
  input('first').focus()
  await userEvent.keyboard('alpha')
  await vi.waitFor(() => expect(input('first').value).toBe('alpha'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() =>
    expect(document.getElementById('first-search-results')?.textContent).toBe('Results for alpha'),
  )
  expect(document.getElementById('second-search-results')).toBeNull()

  input('second').focus()
  await userEvent.keyboard('beta')
  await vi.waitFor(() => expect(input('second').value).toBe('beta'))
  await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
  expect(document.getElementById('second-search-results')).toBeNull()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(input('second').value).toBe(''))
  expect(input('first').value).toBe('alpha')
  expect(document.getElementById('first-search-results')).not.toBeNull()

  input('first').focus()
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(document.getElementById('first-search-results')).toBeNull())
  expect(input('first').value).toBe('')
})
