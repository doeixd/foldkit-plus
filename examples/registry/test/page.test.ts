// @vitest-environment jsdom
/**
 * The registry on the real runtime over the in-process server and its SQLite
 * database: Remote's own Subscriptions read the first page, a header sorts
 * through the query's input, More reads the next page, an edited price and a
 * pasted block reach the rows, and a write the server refuses is taken back.
 */
import { Effect, Layer } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { GridFocus } from 'foldkit-data-grid'
import { Remote, RemoteMutationError } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { afterEach, expect, test, vi } from 'vitest'
import { Message, Model, Products, initial, placements, update } from '../src/app.js'
import { openServer, productId, seedOf } from '../src/server.js'
import { view } from '../src/view.js'

const count = 1_000

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** The page on the runtime, over `backend`; `refuse` makes every write fail. */
const mount = ({ refuse }: { readonly refuse?: Promise<void> } = {}) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  // jsdom lays nothing out: a 1,000 by 356 box is a 36px header over ten 32px rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(356)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const backend = openServer({ count })
  const handlers = RemoteServer.handlers(backend.server, null)
  // The server's own handlers, its writes replaced by a refusal when asked.
  const transport = Remote.clientLayer(
    refuse === undefined
      ? handlers
      : {
          ...handlers,
          // Refused once `refuse` settles, so a test can look before the answer.
          FoldkitRemoteMutate: () =>
            Effect.promise(() => refuse).pipe(
              Effect.andThen(
                Effect.fail(new RemoteMutationError({ message: 'the registry is locked' })),
              ),
            ),
        },
  ).pipe(Layer.provide(backend.layer))
  let latest = initial()
  const container = document.createElement('div')
  container.id = 'registry-page'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => ({ model: initial() }),
        update: (model: Model, message: Message) => {
          const next = update(model, message)
          latest = next.model
          return next
        },
        view,
        subscriptions: placements.subscriptions(),
        resources: transport,
      }),
    ),
  )
  return { backend, handle, latest: () => latest }
}

const grid = () => document.getElementById('products')!
const cell = (row: string, column: string) =>
  document.getElementById(GridFocus.cellId('products', { row, column }))
const press = (key: string, modifiers: KeyboardEventInit = {}) =>
  grid().dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }),
  )
const editor = () => document.querySelector<HTMLInputElement>('#products input')
const status = () => document.getElementById('saved')!.textContent
const click = (element: Element) =>
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const focusOn = async (row: string, column: string) => {
  click(cell(row, column)!)
  await vi.waitFor(() =>
    expect(grid().getAttribute('aria-activedescendant')).toBe(
      GridFocus.cellId('products', { row, column }),
    ),
  )
}
const edit = async (row: string, column: string, text: string) => {
  await focusOn(row, column)
  press('Enter')
  await vi.waitFor(() => expect(editor()).not.toBeNull())
  editor()!.value = text
  editor()!.dispatchEvent(new Event('input', { bubbles: true }))
  editor()!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  )
}
const loaded = (model: Model) => {
  const page = Products.page(model)
  return page._tag === 'Ready' ? page.value.items.length : 0
}

test('reads the first page, sorts on the server, and reads more', async () => {
  const { handle, latest } = mount()
  try {
    // Being on screen made the list a requirement; nothing asked for it.
    await vi.waitFor(() => expect(cell(productId(0), 'upc')?.textContent).toBe(seedOf(0).upc))
    expect(loaded(latest())).toBe(100)
    // A thousand rows behind a page of a hundred: the count is not known yet.
    expect(grid().getAttribute('aria-rowcount')).toBe('-1')
    expect(document.querySelector('main p')!.textContent).toBe('100 products read, more to come.')
    expect(cell(productId(0), 'cents')?.textContent).toBe((seedOf(0).cents / 100).toFixed(2))

    // Two clicks on Price ask for the dearest first; the server orders, and the
    // first row is the dearest of all thousand, not of the page that was loaded.
    const seeds = Array.from({ length: count }, (_, index) => seedOf(index))
    const dearest = [...seeds].sort((a, b) => b.cents - a.cents || (a.id < b.id ? -1 : 1))[0]!
    expect(Number(dearest.id.slice(1))).toBeGreaterThanOrEqual(100)
    const sortPrice = () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>('#products [role="columnheader"] button'),
      ).find(button => button.textContent === 'Price')!
    click(sortPrice())
    // A click acts on the button drawn last: wait for the one that asks for the next order.
    const sorted = () => sortPrice().closest('[role="columnheader"]')!.getAttribute('aria-sort')
    await vi.waitFor(() => expect(sorted()).toBe('ascending'))
    click(sortPrice())
    await vi.waitFor(() => expect(cell(dearest.id, 'upc')?.textContent).toBe(dearest.upc))
    expect(sorted()).toBe('descending')

    // More reads the next page of the same order.
    click(
      Array.from(document.querySelectorAll('#products button')).find(
        b => b.textContent === 'More',
      )!,
    )
    await vi.waitFor(() => expect(loaded(latest())).toBe(200))
  } finally {
    handle.dispose()
  }
})

test('an edited price and a pasted block are written, and read back from the rows', async () => {
  const { backend, handle } = mount()
  try {
    await vi.waitFor(() => expect(cell(productId(2), 'cents')).not.toBeNull())
    // A paste its column refuses all of writes nothing, and says nothing of a save.
    await focusOn(productId(5), 'cents')
    const onLine = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(onLine, 'clipboardData', {
      value: { getData: () => 'free\n' },
    })
    grid().dispatchEvent(onLine)
    await new Promise(resolve => setTimeout(resolve, 50))
    // Nothing was sent, so no save is spoken of.
    expect(status()).toBe('')
    expect(backend.row(productId(5))).toMatchObject({ cents: seedOf(5).cents })

    await edit(productId(2), 'cents', '12.50')
    await vi.waitFor(() => expect(status()).toBe('Saved.'))
    expect(backend.row(productId(2))).toMatchObject({ cents: 1250 })
    expect(cell(productId(2), 'cents')?.textContent).toBe('12.50')

    // Two rows of description, line and status pasted at row 0's description:
    // line and status do not edit, so only the descriptions are written, as one write.
    await focusOn(productId(0), 'description')
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => 'Brass anchor\tGarden\tActive\nSteel bolt\tGarden\tActive\n' },
    })
    grid().dispatchEvent(paste)
    await vi.waitFor(() =>
      expect(backend.row(productId(1))).toMatchObject({ description: 'Steel bolt' }),
    )
    expect(backend.row(productId(0))).toMatchObject({
      description: 'Brass anchor',
      line: seedOf(0).line,
    })
    await vi.waitFor(() =>
      expect(cell(productId(0), 'description')?.textContent).toBe('Brass anchor'),
    )
  } finally {
    handle.dispose()
  }
})

test('a write the server refuses is shown, and the cell goes back to what the server holds', async () => {
  let answer = () => {}
  const { backend, handle } = mount({ refuse: new Promise(resolve => (answer = resolve)) })
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')).not.toBeNull())
    const before = (seedOf(3).cents / 100).toFixed(2)
    await edit(productId(3), 'cents', '7.00')
    // Before the server answers, the cell shows what was typed.
    await vi.waitFor(() => expect(status()).toBe('Saving…'))
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe('7.00'))
    answer()
    await vi.waitFor(() => expect(status()).toBe('Not saved: the registry is locked'))
    expect(cell(productId(3), 'cents')?.textContent).toBe(before)
    expect(backend.row(productId(3))).toMatchObject({ cents: seedOf(3).cents })
  } finally {
    handle.dispose()
  }
})
