// @vitest-environment jsdom
/**
 * The registry on the real runtime with all 100,000 products: only a window
 * of rows is drawn while ARIA counts them all; an edited price reaches the
 * products, a bad one is refused in the cell; a paste writes what its columns
 * accept and says what they refused; select-all counts every product.
 */
import { Runtime } from 'foldkit'
import { GridFocus } from 'foldkit-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

import { type Model, init, update, view } from '../src/main.js'
import { Model as ModelSchema } from '../src/main.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

test('the registry draws a window of 100,000 products, and edits and pastes reach them', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  // jsdom lays nothing out: a 1,000 by 356 box is a 36px header over ten 32px rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(356)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  let latest: Model | undefined
  Runtime.run(
    Runtime.makeApplication({
      Model: ModelSchema,
      init: () => init(),
      update: (model: Model, message) => {
        const next = update(model, message)
        latest = next.model
        return next
      },
      view,
      container,
    }),
  )
  const grid = () => document.getElementById('products')!
  const cell = (row: string, column: string) =>
    document.getElementById(GridFocus.cellId('products', { row, column }))
  const press = (target: Element, key: string, modifiers: KeyboardEventInit = {}) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
    )
  const status = () => document.querySelector('[role="status"]')!.textContent
  const editor = () => document.querySelector<HTMLInputElement>('#products input')
  const type = (text: string) => {
    editor()!.value = text
    editor()!.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // A center column is drawn once the viewport has been measured.
  await vi.waitFor(() => expect(cell('p2', 'price')).not.toBeNull())
  expect(grid().getAttribute('aria-rowcount')).toBe('100001')
  // Ten rows in view and six of overscan below: a window, not 100,000 rows.
  expect(document.querySelectorAll('#products [role="row"]').length).toBeLessThan(30)
  expect(status()).toContain('100,000 products')

  // An edited price reaches the product.
  cell('p2', 'price')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await vi.waitFor(() =>
    expect(grid().getAttribute('aria-activedescendant')).toBe(
      GridFocus.cellId('products', { row: 'p2', column: 'price' }),
    ),
  )
  press(grid(), 'Enter')
  await vi.waitFor(() => expect(editor()).not.toBeNull())
  type('12.50')
  press(editor()!, 'Enter')
  await vi.waitFor(() => expect(latest?.products[2]?.price).toBe(12.5))
  await vi.waitFor(() => expect(status()).toContain('Saved price of p2.'))
  await vi.waitFor(() => expect(cell('p2', 'price')!.textContent).toBe('12.50'))

  // A bad price stays in the cell, refused.
  press(grid(), 'F2')
  await vi.waitFor(() => expect(editor()).not.toBeNull())
  type('cheap')
  press(editor()!, 'Enter')
  await vi.waitFor(() => expect(editor()?.getAttribute('aria-invalid')).toBe('true'))
  press(editor()!, 'Escape')
  await vi.waitFor(() => expect(editor()).toBeNull())

  // A paste from a spreadsheet: two descriptions, statuses and prices, one price refused.
  cell('p0', 'description')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await vi.waitFor(() =>
    expect(grid().getAttribute('aria-activedescendant')).toBe(
      GridFocus.cellId('products', { row: 'p0', column: 'description' }),
    ),
  )
  const paste = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', {
    value: {
      getData: () => 'Brass anchor\tLine A\tPending\t3.25\nSteel bolt\tLine B\tActive\tfree\n',
    },
  })
  grid().dispatchEvent(paste)
  await vi.waitFor(() => expect(latest?.products[0]?.description).toBe('Brass anchor'))
  expect(latest?.products[1]?.description).toBe('Steel bolt')
  expect(latest?.products[0]?.price).toBe(3.25)
  // Status is a choice of the Product's statuses, and takes one.
  expect(latest?.products[0]?.status).toBe('Pending')
  // The second product is Active already, so pasting Active onto it is no edit.
  await vi.waitFor(() =>
    expect(status()).toContain('Pasted 4 cells; refused 1: A price, like 4.99.'),
  )

  // Ctrl+A selects every product, drawn or not.
  press(grid(), 'a', { ctrlKey: true })
  await vi.waitFor(() => expect(status()).toContain('100,000 selected'))
})

test('a column filtered from its header narrows the 100,000 products, and an edit there lands on its product', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(356)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  let latest: Model | undefined
  Runtime.run(
    Runtime.makeApplication({
      Model: ModelSchema,
      init: () => init(),
      update: (model: Model, message) => {
        const next = update(model, message)
        latest = next.model
        return next
      },
      view,
      container,
    }),
  )
  const grid = () => document.getElementById('products')!
  const header = (column: string) =>
    document.getElementById(GridFocus.headerId('products', column))!
  const field = (id: string) => document.getElementById(`products:${id}`) as HTMLInputElement
  const form = () => document.querySelector('#products [role="dialog"]')
  const type = (input: HTMLInputElement, text: string) => {
    input.value = text
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const cell = (row: string, column: string) =>
    document.getElementById(GridFocus.cellId('products', { row, column }))
  const press = (target: Element, key: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  const editor = () => document.querySelector<HTMLInputElement>('#products [role="gridcell"] input')
  await vi.waitFor(() => expect(header('status')).not.toBeNull())

  // Every fifth product is Pending: a fifth of them stay.
  header('status')
    .querySelector('button')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const pending = await vi.waitFor(() => {
    const box = [
      ...document.querySelectorAll<HTMLInputElement>('#products [role="dialog"] input'),
    ].find(input => input.parentElement!.textContent === 'Pending')
    expect(box).toBeDefined()
    return box!
  })
  pending.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await vi.waitFor(() => expect(grid().getAttribute('aria-rowcount')).toBe('20001'))
  expect(header('status').getAttribute('data-filtered')).toBe('true')

  // The first row shown is the fifth product; an edit there is written to it, not to the first.
  await vi.waitFor(() => expect(cell('p4', 'price')).not.toBeNull())
  cell('p4', 'price')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await vi.waitFor(() => expect(form()).toBeNull())
  press(grid(), 'Enter')
  await vi.waitFor(() => expect(editor()).not.toBeNull())
  editor()!.value = '1.25'
  editor()!.dispatchEvent(new Event('input', { bubbles: true }))
  press(editor()!, 'Enter')
  await vi.waitFor(() => expect(latest?.products[4]?.price).toBe(1.25))
  expect(latest?.products[0]?.price).toBe(0.99)

  // A price range over the price itself, not the text its cell shows.
  header('price')
    .querySelector('button')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await vi.waitFor(() => expect(field('price:filter:max')).not.toBeNull())
  type(field('price:filter:max'), '2')
  await vi.waitFor(() => expect(Number(grid().getAttribute('aria-rowcount'))).toBeLessThan(20001))
  const kept = latest!.products.filter(
    product => product.status === 'Pending' && product.price <= 2,
  )
  expect(grid().getAttribute('aria-rowcount')).toBe(String(kept.length + 1))
  expect(latest!.filters.price).toEqual(
    expect.objectContaining({ value: expect.objectContaining({ _tag: 'Range' }) }),
  )
})
