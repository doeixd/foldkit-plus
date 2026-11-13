/**
 * Exiting rows and a popup in a real browser. Presence keeps the part drawn
 * while it hides; Leaving moves focus before the part is inert; a Show during
 * the exit keeps the part and the focus a newer surface took.
 */
import * as Runtime from 'foldkit/runtime'
import { Motion } from 'foldkit-primitives/motion'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { LEAVING } from 'foldkit-primitives/dom'
import { Model, filterId, initialFor, update, view } from '../src/ui-sdk-leaving.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const buttonIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find(node => node.textContent === label)

const rowIn = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('li')].find(
    node => node.querySelector(':scope > span')?.textContent === label,
  )

const start = async (scope: string, reduced = false) => {
  const container = document.createElement('div')
  container.id = `leaving-${scope}`
  document.body.append(container)
  const embedded = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => initialFor(scope),
      update,
      view,
      ...(reduced ? { resources: Motion.reduced } : {}),
    }),
  )
  const previous = dispose
  dispose = () => {
    embedded.dispose()
    previous()
  }
  // embed draws in place of the container, so the page is the view's main.
  const page = () => document.getElementById(filterId(scope))?.closest('main') ?? null
  await vi.waitFor(() => expect(page()).toBeInstanceOf(HTMLElement))
  return page() as HTMLElement
}

it('moves focus to the next row while the dismissed row is still drawn, then drops it', async () => {
  const page = await start('delay')
  const design = buttonIn(page, 'Remove design')!
  design.focus()
  await userEvent.click(design)
  await vi.waitFor(() => expect(rowIn(page, 'design')?.hasAttribute(LEAVING)).toBe(true))
  expect(rowIn(page, 'design')?.inert).toBe(true)
  expect(document.activeElement).toBe(buttonIn(page, 'Remove release'))
  await vi.waitFor(() => expect(rowIn(page, 'design')).toBeUndefined())
  expect(document.activeElement).toBe(buttonIn(page, 'Remove release'))
})

it('keeps the row when it is shown again before the exit completes', async () => {
  const page = await start('keep')
  await userEvent.click(buttonIn(page, 'Remove design')!)
  await vi.waitFor(() => expect(buttonIn(page, 'Keep')).toBeDefined())
  await userEvent.click(buttonIn(page, 'Keep')!)
  await vi.waitFor(() => expect(rowIn(page, 'design')?.hasAttribute(LEAVING)).toBe(false))
  await new Promise(resolve => setTimeout(resolve, 500))
  expect(rowIn(page, 'design')).toBeDefined()
  expect(rowIn(page, 'design')?.inert).toBe(false)
})

it('returns focus to the row that holds a removed branch', async () => {
  const page = await start('branch')
  const draft = buttonIn(page, 'Remove draft')!
  draft.focus()
  await userEvent.click(draft)
  await vi.waitFor(() => expect(buttonIn(page, 'Remove draft')).toBeUndefined())
  expect(document.activeElement).toBe(buttonIn(page, 'Remove design'))
})

it('sends the last row to the field, whose id no selector could ask for', async () => {
  const page = await start('last', true)
  for (const label of ['Remove design', 'Remove release', 'Remove backlog']) {
    const control = buttonIn(page, label)!
    control.focus()
    await userEvent.click(control)
    await vi.waitFor(() => expect(buttonIn(page, label)).toBeUndefined())
  }
  expect(document.activeElement).toBe(page.querySelector('input'))
})

it('hands a closing popup to its trigger and lets a newer focus keep it', async () => {
  const page = await start('popup')
  const trigger = buttonIn(page, 'Open popup')!
  await userEvent.click(trigger)
  await vi.waitFor(() => expect(buttonIn(page, 'Dialog action')).toBeDefined())
  expect(document.activeElement).toBe(buttonIn(page, 'Dialog action'))
  await vi.waitFor(() =>
    expect(
      page.querySelector('input')?.inert ||
        page.querySelector('input')?.getAttribute('aria-hidden') === 'true',
    ).toBe(true),
  )

  await userEvent.click(buttonIn(page, 'Close popup')!)
  await vi.waitFor(() => expect(page.querySelector(`[${LEAVING}]`)).toBeDefined())
  expect(document.activeElement).toBe(trigger)
  expect(page.querySelector('input')?.inert).toBe(false)

  const field = page.querySelector('input') as HTMLInputElement
  field.focus()
  await vi.waitFor(() => expect(buttonIn(page, 'Close popup')).toBeUndefined(), { timeout: 2000 })
  expect(document.activeElement).toBe(field)
})

it('shows a popup again before its exit completes, and keeps it', async () => {
  const page = await start('reopen')
  await userEvent.click(buttonIn(page, 'Open popup')!)
  await vi.waitFor(() => expect(buttonIn(page, 'Close popup')).toBeDefined())
  await userEvent.click(buttonIn(page, 'Close popup')!)
  await vi.waitFor(() => expect(page.querySelector(`[${LEAVING}]`)).toBeDefined())
  await userEvent.click(buttonIn(page, 'Open popup')!)
  await vi.waitFor(() => expect(page.querySelector(`[${LEAVING}]`)).toBeNull())
  await new Promise(resolve => setTimeout(resolve, 500))
  expect(buttonIn(page, 'Dialog action')).toBeDefined()
})

it('exits at once when motion is reduced', async () => {
  const page = await start('reduced', true)
  await userEvent.click(buttonIn(page, 'Remove design')!)
  await vi.waitFor(() => expect(rowIn(page, 'design')).toBeUndefined(), { timeout: 200 })
})

it('recovers each list on its own', async () => {
  const one = await start('one', true)
  const two = await start('two', true)
  const first = buttonIn(one, 'Remove design')!
  first.focus()
  await userEvent.click(first)
  await vi.waitFor(() => expect(buttonIn(one, 'Remove design')).toBeUndefined())
  expect(document.activeElement).toBe(buttonIn(one, 'Remove release'))
  expect(buttonIn(two, 'Remove design')).toBeDefined()
})
