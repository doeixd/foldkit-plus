// @vitest-environment jsdom
/**
 * The registry on the real runtime, over the in-process server, its SQLite
 * database and the edits' journal:
 *
 * - Remote's own Subscriptions read the first page, a header sorts through the
 *   query's input, and More reads the next page;
 * - an edit shows at once, is sent on the next exchange, and the journal
 *   applies it to the table;
 * - an edit made while the server cannot be reached stays on the device, through
 *   a remount over the same storage, and goes once the server is back;
 * - an edit another device made shows here after an exchange, before Remote
 *   reads the row again;
 * - a committed edit shows until a read of the row has it, by its revision.
 */
import { Effect, Layer, Option } from 'effect'
import { GridFocus } from 'foldkit-data-grid'
import { Frames } from 'foldkit-mixins/testing'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { ReplicaId, Sync, type Storage, type TransportClient } from 'foldkit-sync'
import { afterEach, expect, test, vi } from 'vitest'
import { Message, Products, type Model } from '../src/app.js'
import { ProductId } from '../src/domain.js'
import { openJournal } from '../src/journal.js'
import { openServer, productId, seedOf } from '../src/server.js'
import { RegistrySync, mountRegistry } from '../src/sync.js'

const count = 1_000

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** A replica's storage in memory: what IndexedDB keeps across a reload. */
const memoryStorage = (): Storage => {
  let stored: unknown
  return {
    load: () => Effect.sync(() => stored),
    save: next => Effect.sync(() => (stored = structuredClone(next))),
    close: Effect.void,
  }
}

/** The server, its journal, and a transport to it that can be cut, over a table that can fail. */
const serve = () => {
  const backend = openServer({ count })
  let writable = true
  const journal = openJournal((change, at) => {
    if (!writable) throw new Error('the table cannot be written')
    backend.apply(change, at)
  })
  let online = true
  const transport: TransportClient = {
    exchange: (cursor, pending, epoch) =>
      online
        ? journal.transport.exchange(cursor, pending, epoch)
        : Promise.reject(new Error('offline')),
  }
  return {
    backend,
    journal,
    setOnline: (value: boolean) => (online = value),
    setWritable: (value: boolean) => (writable = value),
    resources: Remote.clientLayer(RemoteServer.handlers(backend.server, null)).pipe(
      Layer.provide(backend.layer),
    ),
    transport: Sync.transport.fromPromise(transport),
  }
}

/** The page over a replica on `storage`, on the runtime, with the last Model it drew. */
const mount = async (server: ReturnType<typeof serve>, storage: Storage, name = 'tab-1') => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  // jsdom lays nothing out: a 1,000 by 356 box is a 36px header over ten 32px rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(356)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const replica = await Effect.runPromise(RegistrySync.openReplica(ReplicaId.make(name), storage))
  document.body.innerHTML = ''
  const container = document.createElement('div')
  container.id = 'registry-page'
  document.body.appendChild(container)
  const { mounted, dispose } = mountRegistry(replica, {
    container,
    resources: server.resources,
  })
  const exchange = () =>
    Effect.runPromise(replica.synchronize.pipe(Effect.provide(server.transport), Effect.ignore))
  return { replica, mounted, dispose, exchange, latest: (): Model => mounted.model() }
}

const grid = () => document.getElementById('products')!
const cell = (row: string, column: string) =>
  document.getElementById(GridFocus.cellId('products', { row, column }))
const status = () => document.getElementById('exchange')!.textContent
const click = (element: Element) =>
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
const press = (target: Element, key: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
const editor = () => document.querySelector<HTMLInputElement>('#products input')
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
  press(grid(), 'Enter')
  await vi.waitFor(() => expect(editor()).not.toBeNull())
  editor()!.value = text
  editor()!.dispatchEvent(new Event('input', { bubbles: true }))
  press(editor()!, 'Enter')
}
const pasteAt = async (row: string, column: string, text: string) => {
  await focusOn(row, column)
  const paste = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', { value: { getData: () => text } })
  grid().dispatchEvent(paste)
}
const loaded = (model: Model) => {
  const page = Products.page(model)
  return page._tag === 'Ready' ? page.value.items.length : 0
}
const priceOf = (index: number) => (seedOf(index).cents / 100).toFixed(2)

test('reads the first page, sorts on the server, and reads more', async () => {
  const { dispose, latest } = await mount(serve(), memoryStorage())
  try {
    // Being on screen made the list a requirement; nothing asked for it.
    await vi.waitFor(() => expect(cell(productId(0), 'upc')?.textContent).toBe(seedOf(0).upc))
    expect(loaded(latest())).toBe(100)
    // A thousand rows behind a page of a hundred: the count is not known yet.
    expect(grid().getAttribute('aria-rowcount')).toBe('-1')
    expect(document.querySelector('main p')!.textContent).toBe('100 products read, more to come.')
    expect(cell(productId(0), 'cents')?.textContent).toBe(priceOf(0))

    // Two clicks on Price ask for the dearest first; the server orders, and the
    // first row is the dearest of all thousand, not of the page that was loaded.
    const seeds = Array.from({ length: count }, (_, index) => seedOf(index))
    const dearest = [...seeds].sort((a, b) => b.cents - a.cents || (a.id < b.id ? -1 : 1))[0]!
    expect(Number(dearest.id.slice(1))).toBeGreaterThanOrEqual(100)
    const sortPrice = () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>('#products [role="columnheader"] button'),
      ).find(button => button.textContent === 'Price')!
    const sorted = () => sortPrice().closest('[role="columnheader"]')!.getAttribute('aria-sort')
    // Both clicks inside one frame, on the button drawn before either: each sends
    // the column, and the update toggles it twice from the Model as it is.
    const frames = Frames.hold()
    click(sortPrice())
    click(sortPrice())
    frames.release()
    await vi.waitFor(() => expect(cell(dearest.id, 'upc')?.textContent).toBe(dearest.upc))
    expect(sorted()).toBe('descending')

    // More reads the next page of the same order.
    click(
      Array.from(document.querySelectorAll('#products button')).find(
        button => button.textContent === 'More',
      )!,
    )
    await vi.waitFor(() => expect(loaded(latest())).toBe(200))
  } finally {
    await dispose()
  }
})

test('an edit and a paste show at once, and the journal writes them to the table', async () => {
  const server = serve()
  const { dispose, exchange } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(2), 'cents')).not.toBeNull())

    // A paste its column refuses all of is no edit at all.
    await pasteAt(productId(5), 'cents', 'free\n')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(status()).toBe('')

    // Shown before any exchange, and waiting to be sent.
    await edit(productId(2), 'cents', '12.50')
    await vi.waitFor(() => expect(cell(productId(2), 'cents')?.textContent).toBe('12.50'))
    await vi.waitFor(() => expect(status()).toBe('Sending 1 edit…'))
    expect(server.backend.row(productId(2))).toMatchObject({ cents: seedOf(2).cents })

    // Two rows of description, line and status pasted at row 0's description:
    // line and status do not edit, so only the descriptions are one more edit.
    await pasteAt(
      productId(0),
      'description',
      'Brass anchor\tGarden\tActive\nSteel bolt\tGarden\tActive\n',
    )
    await vi.waitFor(() => expect(status()).toBe('Sending 2 edits…'))

    await exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(2))).toMatchObject({ cents: 1250 })
    expect(server.backend.row(productId(0))).toMatchObject({
      description: 'Brass anchor',
      line: seedOf(0).line,
    })
    expect(server.backend.row(productId(1))).toMatchObject({ description: 'Steel bolt' })
    expect(cell(productId(1), 'description')?.textContent).toBe('Steel bolt')
  } finally {
    await dispose()
  }
})

test('an edit made offline is kept on the device, through a remount, and sent when back', async () => {
  const server = serve()
  const storage = memoryStorage()
  const first = await mount(server, storage)
  await vi.waitFor(() => expect(cell(productId(3), 'cents')).not.toBeNull())
  server.setOnline(false)
  await edit(productId(3), 'cents', '7.00')
  await first.exchange()
  await vi.waitFor(() =>
    expect(status()).toBe('1 edit kept on this device; the server cannot be reached (offline).'),
  )
  expect(cell(productId(3), 'cents')?.textContent).toBe('7.00')
  await first.dispose()

  // A reload: the page again, over the replica the same storage holds.
  const second = await mount(server, storage)
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe('7.00'))
    expect(server.backend.row(productId(3))).toMatchObject({ cents: seedOf(3).cents })
    server.setOnline(true)
    await second.exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(3))).toMatchObject({ cents: 700 })
  } finally {
    await second.dispose()
  }
})

test('an edit another device made shows here after an exchange', async () => {
  const server = serve()
  const { dispose, exchange } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(4), 'description')).not.toBeNull())
    // Another device, with its own replica, edits and sends.
    const other = await Effect.runPromise(
      RegistrySync.openReplica(ReplicaId.make('tab-2'), memoryStorage()),
    )
    await Effect.runPromise(
      other.submit(
        Message.EditedProducts({
          changes: [
            {
              id: ProductId.make(productId(4)),
              description: Option.some('From the other tab'),
              cents: Option.none(),
            },
          ],
        }),
      ),
    )
    await Effect.runPromise(other.synchronize.pipe(Effect.provide(server.transport)))
    expect(cell(productId(4), 'description')?.textContent).toBe(seedOf(4).description)

    await exchange()
    await vi.waitFor(() =>
      expect(cell(productId(4), 'description')?.textContent).toBe('From the other tab'),
    )
  } finally {
    await dispose()
  }
})

test('a price is drawn from this device’s edit, not from what Remote last read', async () => {
  const server = serve()
  const { dispose } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(6), 'cents')?.textContent).toBe(priceOf(6)))
    await edit(productId(6), 'cents', '1.00')
    await vi.waitFor(() => expect(cell(productId(6), 'cents')?.textContent).toBe('1.00'))
    // The other columns of the row are still Remote's.
    expect(cell(productId(6), 'description')?.textContent).toBe(seedOf(6).description)
    // A second edit to the row keeps the first: each field's last edit wins.
    await edit(productId(6), 'description', 'Repriced')
    await vi.waitFor(() => expect(cell(productId(6), 'description')?.textContent).toBe('Repriced'))
    expect(cell(productId(6), 'cents')?.textContent).toBe('1.00')
    // And a price after it keeps the description.
    await edit(productId(6), 'cents', '2.00')
    await vi.waitFor(() => expect(cell(productId(6), 'cents')?.textContent).toBe('2.00'))
    expect(cell(productId(6), 'description')?.textContent).toBe('Repriced')
  } finally {
    await dispose()
  }
})

test('a committed edit shows until the table has it, then the table shows, whoever wrote it next', async () => {
  const server = serve()
  const { dispose, exchange, mounted } = await mount(server, memoryStorage())
  const reread = () => mounted.dispatch(Message.RetriedProducts())
  try {
    await vi.waitFor(() => expect(cell(productId(7), 'cents')?.textContent).toBe(priceOf(7)))
    await edit(productId(7), 'cents', '3.00')
    await vi.waitFor(() => expect(cell(productId(7), 'cents')?.textContent).toBe('3.00'))

    // Committed while the table cannot be written: the journal has it, the
    // table does not, and a read of the row still says the seed's price.
    server.setWritable(false)
    await exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(7))).toMatchObject({ cents: seedOf(7).cents, revision: 0 })
    reread()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(cell(productId(7), 'cents')?.textContent).toBe('3.00')

    // The next exchange writes it, at the sequence it committed at.
    server.setWritable(true)
    await exchange()
    expect(server.backend.row(productId(7))).toMatchObject({ cents: 300, revision: 1 })

    // A later change this page has not exchanged for: once Remote reads the
    // row at that revision, the table shows, not this device's older edit.
    const importer = await Effect.runPromise(
      RegistrySync.openReplica(ReplicaId.make('importer'), memoryStorage()),
    )
    await Effect.runPromise(
      importer.submit(
        Message.EditedProducts({
          changes: [
            {
              id: ProductId.make(productId(7)),
              description: Option.none(),
              cents: Option.some(999),
            },
          ],
        }),
      ),
    )
    await Effect.runPromise(importer.synchronize.pipe(Effect.provide(server.transport)))
    expect(server.backend.row(productId(7))).toMatchObject({ cents: 999, revision: 2 })
    expect(cell(productId(7), 'cents')?.textContent).toBe('3.00')
    reread()
    await vi.waitFor(() => expect(cell(productId(7), 'cents')?.textContent).toBe('9.99'))
  } finally {
    await dispose()
  }
})

test('an edit that says when it committed is refused, and the table keeps its price', async () => {
  const server = serve()
  const forger = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make('forger'), memoryStorage()),
  )
  await Effect.runPromise(
    forger.submit(
      Message.EditedProducts({
        changes: [
          { id: ProductId.make(productId(8)), description: Option.none(), cents: Option.some(1) },
        ],
        at: 1_000_000,
      }),
    ),
  )
  await Effect.runPromise(forger.synchronize.pipe(Effect.provide(server.transport)))
  expect((await Effect.runPromise(forger.status)).rejected).toHaveLength(1)
  expect(server.backend.row(productId(8))).toMatchObject({ cents: seedOf(8).cents, revision: 0 })
})
