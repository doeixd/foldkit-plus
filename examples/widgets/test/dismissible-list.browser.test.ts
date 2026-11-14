import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, initial, update } from '../src/dismissible-list/app.js'
import { DismissibleList } from '../src/dismissible-list/view.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const button = (label: string) =>
  [...document.querySelectorAll('button')].find(node => node.textContent === label)!

const start = async () => {
  const container = document.createElement('div')
  container.id = 'dismissible-list'
  document.body.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update,
      view: DismissibleList,
    }),
  ).dispose
  await vi.waitFor(() => expect(button('Remove design')).not.toBeUndefined())
}

it('moves focus to the next row, then to the field when the last row goes', async () => {
  await start()
  const design = button('Remove design')
  design.focus()
  await userEvent.click(design)
  await vi.waitFor(() => expect(button('Remove design')).toBeUndefined())
  expect(document.activeElement).toBe(button('Remove release'))

  const release = button('Remove release')
  release.focus()
  await userEvent.click(release)
  await vi.waitFor(() => expect(button('Remove release')).toBeUndefined())
  expect(document.activeElement).toBe(button('Remove backlog'))

  const backlog = button('Remove backlog')
  backlog.focus()
  await userEvent.click(backlog)
  await vi.waitFor(() => expect(button('Remove backlog')).toBeUndefined())
  // The last row names the field, whose id no unescaped selector could ask for.
  expect(document.activeElement).toBe(document.querySelector('input'))
})

it('returns focus to the row that holds a removed branch', async () => {
  await start()
  const draft = button('Remove draft')
  draft.focus()
  await userEvent.click(draft)
  await vi.waitFor(() => expect(button('Remove draft')).toBeUndefined())
  expect(document.activeElement).toBe(button('Remove design'))
})

it('leaves focus on the clear button when the list empties', async () => {
  await start()
  const clear = button('Clear all')
  clear.focus()
  await userEvent.click(clear)
  await vi.waitFor(() => expect(button('Remove design')).toBeUndefined())
  expect(document.activeElement).toBe(clear)
})
