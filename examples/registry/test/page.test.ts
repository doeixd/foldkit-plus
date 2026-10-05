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
import { GridCrud } from 'foldkit-data-grid/crud'
import { Frames } from 'foldkit-mixins/testing'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { ReplicaId, Sync, type Operation, type Storage, type TransportClient } from 'foldkit-sync'
import { afterEach, expect, test, vi } from 'vitest'
import { Message, Products, type Model } from '../src/app.js'
import { ProductId } from '../src/domain.js'
import { memoryJournal } from '../src/journalNode.js'
import { openServer, productId, seedOf } from '../src/server.js'
import { memorySqlite } from '../src/sqliteNode.js'
import { RegistrySync, mountRegistry, pausable } from '../src/sync.js'

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
  const backend = openServer(memorySqlite(), { count })
  let writable = true
  const journal = memoryJournal((change, at) => {
    if (!writable) throw new Error('the table cannot be written')
    backend.apply(change, at)
  })
  let online = true
  // A client between the page and the server that says its edits committed:
  // what the journal refuses, as a page's own edit never is.
  let tampering = false
  const forged = (operation: Operation): Operation => ({
    ...operation,
    message: Object.assign({}, operation.message, { at: 1 }),
  })
  /** The page's way to the server, as one device: it commits as `device`. */
  const transportFor = (device: string) => {
    const as = journal.transportAs({ actorId: device })
    const client: TransportClient = {
      exchange: (cursor, pending, epoch) =>
        online
          ? as.exchange(cursor, tampering ? pending.map(forged) : pending, epoch)
          : Promise.reject(new Error('offline')),
    }
    return Sync.transport.fromPromise(client)
  }
  return {
    backend,
    journal,
    setOnline: (value: boolean) => (online = value),
    setWritable: (value: boolean) => (writable = value),
    setTampering: (value: boolean) => (tampering = value),
    resources: Remote.clientLayer(RemoteServer.handlers(backend.server, null)).pipe(
      Layer.provide(backend.layer),
    ),
    transportFor,
    /** Another device's way to the server. */
    transport: transportFor('elsewhere'),
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
    device: name,
  })
  const transport = server.transportFor(name)
  const exchange = () =>
    Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport), Effect.ignore))
  return { replica, mounted, dispose, exchange, transport, latest: (): Model => mounted.model() }
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
/** A frame later: what the last transition drew is on the page (frames are timeouts here). */
const drawn = () => new Promise(resolve => setTimeout(resolve, 20))
/** Another device's price for product `index`, committed. */
const commitElsewhere = async (
  server: ReturnType<typeof serve>,
  index: number,
  cents: number,
  device = 'tab-2',
) => {
  const other = await Effect.runPromise(
    RegistrySync.openReplica(ReplicaId.make(`${device}:${index}:${cents}`), memoryStorage()),
  )
  await Effect.runPromise(
    other.submit(
      Message.EditedProducts({
        changes: [
          {
            id: ProductId.make(productId(index)),
            description: Option.none(),
            cents: Option.some(cents),
            line: Option.none(),
            status: Option.none(),
          },
        ],
      }),
    ),
  )
  await Effect.runPromise(other.synchronize.pipe(Effect.provide(server.transportFor(device))))
}
/** The revision of a row as Remote last read it. */
const revisionOf = (model: Model, id: string) => {
  const rows = GridCrud.rows(Products.page(model), row => row.id)
  return Option.map(Option.flatMap(rows.indexOf(id), rows.rowAt), row => row.revision)
}

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

    // Every column the server can order sorts: Line, A to Z, puts Electrical first,
    // ties by id, so product 3, the first of that line.
    const sortBy = (header: string) =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>('#products [role="columnheader"] button'),
      ).find(button => button.textContent === header)!
    click(sortBy('Line'))
    await vi.waitFor(() =>
      expect(
        document.querySelector('#products [role="row"][aria-rowindex="2"]')?.textContent,
      ).toContain(seedOf(3).upc),
    )
    expect(seedOf(3).line).toBe('Electrical')

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

    // Two rows of description, price and line pasted at row 0's description:
    // what each column decodes is one more edit, and a price it refuses is left.
    await pasteAt(
      productId(0),
      'description',
      'Brass anchor\tfree\tGarden\nSteel bolt\t4.00\tTools\n',
    )
    await vi.waitFor(() => expect(status()).toBe('Sending 2 edits…'))

    await exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(2))).toMatchObject({ cents: 1250 })
    expect(server.backend.row(productId(0))).toMatchObject({
      description: 'Brass anchor',
      cents: seedOf(0).cents,
      line: 'Garden',
    })
    expect(server.backend.row(productId(1))).toMatchObject({
      description: 'Steel bolt',
      cents: 400,
      line: 'Tools',
    })
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
              line: Option.none(),
              status: Option.none(),
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
              line: Option.none(),
              status: Option.none(),
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
          {
            id: ProductId.make(productId(8)),
            description: Option.none(),
            cents: Option.some(1),
            line: Option.none(),
            status: Option.none(),
          },
        ],
        at: 1_000_000,
      }),
    ),
  )
  await Effect.runPromise(forger.synchronize.pipe(Effect.provide(server.transport)))
  expect((await Effect.runPromise(forger.status)).rejected).toHaveLength(1)
  expect(server.backend.row(productId(8))).toMatchObject({ cents: seedOf(8).cents, revision: 0 })
})

test('an edit the journal absorbed keeps showing until the row is read at its revision', async () => {
  const server = serve()
  const { dispose, exchange, mounted, latest } = await mount(server, memoryStorage())
  /** Another device's price for product `index`, sent: a reinstall on this page's next exchange. */
  const elsewhere = async (name: string, index: number) => {
    const other = await Effect.runPromise(
      RegistrySync.openReplica(ReplicaId.make(name), memoryStorage()),
    )
    await Effect.runPromise(
      other.submit(
        Message.EditedProducts({
          changes: [
            {
              id: ProductId.make(productId(index)),
              description: Option.none(),
              cents: Option.some(index),
              line: Option.none(),
              status: Option.none(),
            },
          ],
        }),
      ),
    )
    await Effect.runPromise(other.synchronize.pipe(Effect.provide(server.transport)))
    await exchange()
  }
  try {
    await vi.waitFor(() => expect(cell(productId(9), 'cents')?.textContent).toBe(priceOf(9)))
    await edit(productId(9), 'cents', '4.40')
    await vi.waitFor(() => expect(cell(productId(9), 'cents')?.textContent).toBe('4.40'))
    // Committed, then written by the next exchange; the cached row is still the seed's.
    await exchange()
    await exchange()
    expect(server.backend.row(productId(9))).toMatchObject({ cents: 440, revision: 1 })

    // The journal records what the table holds; the exchange drops the edit,
    // and in the same transition this page keeps it, for its row is older.
    await Effect.runPromise(server.journal.absorb)
    await exchange()
    // The mount reinstalls on its own fiber; then a frame draws it.
    await vi.waitFor(() => expect(latest().edits).toEqual([]))
    expect(latest().retired.map(kept => kept.id)).toEqual([productId(9)])
    await drawn()
    expect(cell(productId(9), 'cents')?.textContent).toBe('4.40')

    // Another reinstall before the row is read again keeps it still.
    await elsewhere('tab-2', 8)
    await vi.waitFor(() => expect(latest().edits.map(kept => kept.id)).toEqual([productId(8)]))
    expect(latest().retired.map(kept => kept.id)).toEqual([productId(9)])
    await drawn()
    expect(cell(productId(9), 'cents')?.textContent).toBe('4.40')

    // Read again, the row has it at its revision, and the price is the table's.
    mounted.dispatch(Message.RetriedProducts())
    await vi.waitFor(() => expect(revisionOf(latest(), productId(9))).toEqual(Option.some(1)))
    expect(cell(productId(9), 'cents')?.textContent).toBe('4.40')

    // The next reinstall lets it go.
    await elsewhere('tab-3', 7)
    await vi.waitFor(() => expect(latest().retired).toEqual([]))
  } finally {
    await dispose()
  }
})

const markOf = (row: string, column: string) => cell(row, column)?.getAttribute('data-mark') ?? null

test('a cell says where its edit is: not yet sent, saved but not in the table, then nothing', async () => {
  const server = serve()
  const { dispose, exchange, mounted } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(5), 'cents')?.textContent).toBe(priceOf(5)))
    expect(markOf(productId(5), 'cents')).toBeNull()
    await edit(productId(5), 'cents', '5.55')
    await vi.waitFor(() => expect(markOf(productId(5), 'cents')).toBe('pending'))
    expect(cell(productId(5), 'cents')!.getAttribute('aria-description')).toBe('Not yet sent')
    expect(markOf(productId(5), 'description')).toBeNull()

    server.setWritable(false)
    await exchange()
    await vi.waitFor(() => expect(markOf(productId(5), 'cents')).toBe('saved'))
    expect(cell(productId(5), 'cents')!.getAttribute('aria-description')).toBe(
      'Saved, not yet in the table',
    )

    server.setWritable(true)
    await exchange()
    mounted.dispatch(Message.RetriedProducts())
    await vi.waitFor(() => expect(markOf(productId(5), 'cents')).toBeNull())
    expect(cell(productId(5), 'cents')?.textContent).toBe('5.55')
  } finally {
    await dispose()
  }
})

test('a refused edit marks its cell and says why, until it is dismissed', async () => {
  const server = serve()
  const { dispose, exchange } = await mount(server, memoryStorage())
  const lines = () =>
    Array.from(document.querySelectorAll('#refused li'), line => line.firstChild?.textContent)
  try {
    await vi.waitFor(() => expect(cell(productId(6), 'cents')?.textContent).toBe(priceOf(6)))
    await edit(productId(6), 'cents', '6.66')
    await vi.waitFor(() => expect(markOf(productId(6), 'cents')).toBe('pending'))
    server.setTampering(true)
    await exchange()
    // Back to the server's price, edged as refused, with the reason the journal gave.
    await vi.waitFor(() => expect(markOf(productId(6), 'cents')).toBe('refused'))
    expect(cell(productId(6), 'cents')?.textContent).toBe(priceOf(6))
    expect(cell(productId(6), 'cents')!.getAttribute('aria-description')).toBe(
      'Not saved: Not a valid operation',
    )
    expect(lines()).toEqual([`Price of ${productId(6)} not saved: Not a valid operation. `])

    click(document.querySelector('#refused button')!)
    await vi.waitFor(() => expect(lines()).toEqual([]))
    expect(markOf(productId(6), 'cents')).toBeNull()
  } finally {
    await dispose()
  }
})

test('working offline keeps edits on the device, and going back online sends them', async () => {
  const server = serve()
  const { dispose, replica, latest, transport } = await mount(server, memoryStorage())
  const paused = pausable(transport, () => latest().offline)
  const exchange = () =>
    Effect.runPromise(replica.synchronize.pipe(Effect.provide(paused), Effect.ignore))
  const offline = () => document.querySelector<HTMLInputElement>('main input[type="checkbox"]')!
  try {
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(4)))
    offline().click()
    await vi.waitFor(() => expect(status()).toBe('Working offline.'))
    await edit(productId(4), 'cents', '4.04')
    // In the outbox first, so the exchange has it to send, and does not.
    await vi.waitFor(() => expect(Effect.runSync(replica.pending)).toHaveLength(1))
    await exchange()
    expect(Effect.runSync(replica.pending)).toHaveLength(1)
    expect(status()).toBe('Working offline: 1 edit kept on this device.')
    expect(server.backend.row(productId(4))).toMatchObject({ cents: seedOf(4).cents })

    offline().click()
    await vi.waitFor(() => expect(latest().offline).toBe(false))
    await exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    await exchange()
    expect(server.backend.row(productId(4))).toMatchObject({ cents: 404 })
  } finally {
    await dispose()
  }
})

test('an edit another device committed later replaces this one, and the page says so', async () => {
  const server = serve()
  const { dispose, exchange, latest } = await mount(server, memoryStorage())
  const tab2 = (index: number, cents: number, device = 'tab-2') =>
    commitElsewhere(server, index, cents, device)
  const lines = () =>
    Array.from(document.querySelectorAll('#replaced li'), line => line.firstChild?.textContent)
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))

    // This page commits first; the other device's edit of the same price after.
    await edit(productId(3), 'cents', '3.33')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await tab2(3, 444)
    await exchange()
    await vi.waitFor(() => expect(markOf(productId(3), 'cents')).toBe('replaced'))
    expect(cell(productId(3), 'cents')?.textContent).toBe('4.44')
    expect(cell(productId(3), 'cents')!.getAttribute('aria-description')).toBe(
      'Replaced by tab-2’s edit (was 3.33)',
    )
    expect(lines()).toEqual([
      `Price of ${productId(3)}: tab-2’s later edit replaced yours (3.33). `,
    ])
    click(document.querySelector('#replaced button')!)
    await vi.waitFor(() => expect(lines()).toEqual([]))

    // The other way round, this page's edit is the later one and nothing is replaced.
    await tab2(2, 222)
    await exchange()
    await edit(productId(2), 'cents', '2.23')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await vi.waitFor(() => expect(markOf(productId(2), 'cents')).not.toBe('pending'))
    expect(markOf(productId(2), 'cents')).not.toBe('replaced')

    // Another device's edit over a third's is none of this page's business.
    await tab2(5, 555, 'tab-3')
    await exchange()
    await tab2(5, 556)
    await exchange()
    await vi.waitFor(() => expect(cell(productId(5), 'cents')?.textContent).toBe('5.56'))

    // A later commit of the very value this page wrote replaces nothing.
    await edit(productId(6), 'cents', '6.06')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await tab2(6, 606)
    await exchange()
    await drawn()
    expect(latest().replaced).toEqual([])

    // A refused edit over this page's own commit goes back to that commit:
    // refused, not replaced by itself.
    await edit(productId(7), 'cents', '7.00')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    server.setTampering(true)
    await edit(productId(7), 'cents', '7.77')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    server.setTampering(false)
    await vi.waitFor(() => expect(markOf(productId(7), 'cents')).toBe('refused'))
    expect(latest().replaced).toEqual([])
  } finally {
    await dispose()
  }
})

test('a line and a status are edited too, the status as a choice of the Product’s own', async () => {
  const server = serve()
  const { dispose, exchange } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(4), 'status')).not.toBeNull())
    await edit(productId(4), 'line', 'Lighting')
    await vi.waitFor(() => expect(cell(productId(4), 'line')?.textContent).toBe('Lighting'))

    await focusOn(productId(4), 'status')
    press(grid(), 'Enter')
    const choice = () => document.querySelector<HTMLSelectElement>('#products select')
    await vi.waitFor(() => expect(choice()).not.toBeNull())
    expect(Array.from(choice()!.options, option => option.value)).toEqual([
      'Active',
      'Discontinued',
      'Pending',
    ])
    choice()!.value = 'Discontinued'
    choice()!.dispatchEvent(new Event('change', { bubbles: true }))
    press(choice()!, 'Enter')
    await vi.waitFor(() => expect(cell(productId(4), 'status')?.textContent).toBe('Discontinued'))
    expect(markOf(productId(4), 'status')).toBe('pending')

    await exchange()
    await vi.waitFor(() =>
      expect(server.backend.row(productId(4))).toMatchObject({
        line: 'Lighting',
        status: 'Discontinued',
      }),
    )
  } finally {
    await dispose()
  }
})

test('an editor left unchanged sends nothing, though another device changed the cell meanwhile', async () => {
  const server = serve()
  const { dispose, exchange, latest } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(4)))
    await focusOn(productId(4), 'cents')
    press(grid(), 'Enter')
    await vi.waitFor(() => expect(editor()?.value).toBe(priceOf(4)))
    // While the editor is open, another device's price arrives beneath it.
    await commitElsewhere(server, 4, 444)
    await exchange()
    await vi.waitFor(() => expect(latest().edits).not.toEqual([]))
    // Committed as it opened: this device changed nothing, so it sends nothing.
    press(editor()!, 'Enter')
    await vi.waitFor(() => expect(editor()).toBeNull())
    await drawn()
    expect(latest().exchange.pending).toBe(0)
    await exchange()
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe('4.44'))
  } finally {
    await dispose()
  }
})

test('a cell committed with the value it already shows is no edit', async () => {
  const server = serve()
  const { dispose, latest } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(2), 'cents')?.textContent).toBe(priceOf(2)))
    // The same price, typed as it shows, and the same price written otherwise.
    await edit(productId(2), 'cents', priceOf(2))
    await edit(productId(2), 'cents', `0${priceOf(2)}`)
    await edit(productId(2), 'description', seedOf(2).description)
    await edit(productId(2), 'line', seedOf(2).line)
    // The status it has, chosen again.
    await focusOn(productId(2), 'status')
    press(grid(), 'Enter')
    await vi.waitFor(() => expect(document.querySelector('#products select')).not.toBeNull())
    press(document.querySelector('#products select')!, 'Enter')
    await vi.waitFor(() => expect(document.querySelector('#products select')).toBeNull())
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(latest().edits).toEqual([])
    expect(latest().exchange.pending).toBe(0)
    expect(markOf(productId(2), 'cents')).toBeNull()
    // A different one is an edit, as ever.
    await edit(productId(2), 'cents', '9.87')
    await vi.waitFor(() => expect(markOf(productId(2), 'cents')).toBe('pending'))
  } finally {
    await dispose()
  }
})
