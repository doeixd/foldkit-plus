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
import { Effect, Option, Stream } from 'effect'
import { GridFocus } from 'foldkit-data-grid'
import { Entity } from 'foldkit-entity'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Frames } from 'foldkit-mixins/testing'
import { Remote, type RemoteRpcClient } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import {
  ReplicaId,
  Sync,
  type Operation,
  type ReplicaStatus,
  type Storage,
  type TransportClient,
} from 'foldkit-sync'
import { afterEach, expect, test, vi } from 'vitest'
import { Data, Message, Products, Shown, type Model } from '../src/app.js'
import { Product, ProductId } from '../src/domain.js'
import { memoryJournal } from '../src/journalNode.js'
import { openServer, productId, seedOf } from '../src/server.js'
import { memorySqlite } from '../src/sqliteNode.js'
import { RegistrySync, manifest, mountRegistry, pausable } from '../src/sync.js'

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

/**
 * The server, its journal, and a transport to it that can be cut, over a
 * table that can fail; `restart` starts it over, a fresh table and journal,
 * as a dev server restarting does, behind the same transport and reads.
 */
const serve = () => {
  let writable = true
  const start = () => {
    const backend = openServer(memorySqlite(), { count })
    const journal = memoryJournal({
      ...backend,
      apply: (change, at) =>
        writable
          ? backend.apply(change, at)
          : Effect.fail(new Error('the table cannot be written')),
    })
    return { backend, journal, handlers: RemoteServer.handlers(backend.server, null) }
  }
  let current = start()
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
    const client: TransportClient = {
      exchange: (cursor, pending, epoch) =>
        online
          ? current.journal
              .transportAs({ actorId: device })
              .exchange(cursor, tampering ? pending.map(forged) : pending, epoch)
          : Promise.reject(new Error('offline')),
    }
    return Sync.transport.fromPromise(client)
  }
  // Remote's reads, which a test can hold to see the page between a reinstall and its next read.
  let gate: Promise<void> = Promise.resolve()
  let reads = 0
  const waited = Effect.suspend(() => Effect.promise(() => gate)).pipe(
    Effect.tap(() => Effect.sync(() => reads++)),
  )
  // Each call reaches the server running now, over its own table.
  const gated: RemoteRpcClient = {
    FoldkitRemoteRead: payload =>
      Effect.andThen(
        waited,
        Effect.suspend(() =>
          current.handlers.FoldkitRemoteRead(payload).pipe(Effect.provide(current.backend.layer)),
        ),
      ),
    FoldkitRemoteQuery: payload =>
      Effect.andThen(
        waited,
        Effect.suspend(() =>
          current.handlers.FoldkitRemoteQuery(payload).pipe(Effect.provide(current.backend.layer)),
        ),
      ),
    FoldkitRemoteMutate: payload =>
      Effect.suspend(() =>
        current.handlers.FoldkitRemoteMutate(payload).pipe(Effect.provide(current.backend.layer)),
      ),
    FoldkitRemoteLive: payload =>
      Stream.suspend(() =>
        current.handlers.FoldkitRemoteLive(payload).pipe(Stream.provide(current.backend.layer)),
      ),
  }
  return {
    get backend() {
      return current.backend
    },
    get journal() {
      return current.journal
    },
    /** A fresh table and journal, as a restarted server has: a new epoch. */
    restart: () => {
      current = start()
    },
    setOnline: (value: boolean) => (online = value),
    setWritable: (value: boolean) => (writable = value),
    setTampering: (value: boolean) => (tampering = value),
    /** How many reads and queries the server has answered so far. */
    reads: () => reads,
    /** Holds every read until the returned function is called. */
    holdReads: () => {
      let release = () => {}
      gate = new Promise(resolve => (release = resolve))
      return () => {
        gate = Promise.resolve()
        release()
      }
    },
    resources: Remote.clientLayer(gated),
    transportFor,
    /** Another device's way to the server. */
    transport: transportFor('elsewhere'),
  }
}

/** The page over a replica on `storage`, on the runtime, with the last Model it drew. */
const mount = async (
  server: ReturnType<typeof serve>,
  storage: Storage,
  name = 'tab-1',
  // What the page hears of the replica's status: as it is, or later.
  statuses: (changes: Stream.Stream<ReplicaStatus>) => Stream.Stream<ReplicaStatus> = changes =>
    changes,
) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const frames = Frames.track()
  // jsdom lays nothing out: a 1,000 by 356 box is a 36px header over ten 32px rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(356)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  const replica = await Effect.runPromise(RegistrySync.openReplica(ReplicaId.make(name), storage))
  document.body.innerHTML = ''
  const container = document.createElement('div')
  container.id = 'registry-page'
  document.body.appendChild(container)
  const { mounted, dispose } = mountRegistry(
    { ...replica, statusChanges: statuses(replica.statusChanges) },
    {
      container,
      resources: server.resources,
      device: name,
    },
  )
  const transport = server.transportFor(name)
  const exchange = () =>
    Effect.runPromise(replica.synchronize.pipe(Effect.provide(transport), Effect.ignore))
  return {
    replica,
    mounted,
    dispose: async () => {
      await dispose()
      frames.dispose()
    },
    exchange,
    transport,
    latest: (): Model => mounted.model(),
    /** The page caught up with its replica and drawn, without a sleep. */
    settle: () => frames.settle(mounted),
  }
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
        changes: [{ id: ProductId.make(productId(index)), member: 'cents', value: cents }],
      }),
    ),
  )
  await Effect.runPromise(other.synchronize.pipe(Effect.provide(server.transportFor(device))))
}
/** The products whose absorbed edits the page still shows, held until their rows are read. */
const heldOf = (model: Model) =>
  Shown.shown(model).flatMap(({ edit, held }) => (held ? [edit.id] : []))

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
    // Ten 32px rows in view and six more below; none above the first.
    expect(document.getElementById('counts')!.textContent).toBe(
      '100 read, more to come · 16 rows drawn',
    )
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
    const frames = Frames.track()
    frames.hold()
    click(sortPrice())
    click(sortPrice())
    frames.release()
    frames.dispose()
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
  const { dispose, exchange, settle } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(2), 'cents')).not.toBeNull())

    // A paste its column refuses all of is no edit at all.
    await pasteAt(productId(5), 'cents', 'free\n')
    await settle()
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
              member: 'description',
              value: 'From the other tab',
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

test('another read of an edited product shows the edit too, not only the grid', async () => {
  const server = serve()
  const { dispose, latest } = await mount(server, memoryStorage())
  // Another view's Selection of the product: a price alone, not the grid's row.
  const price = (model: Model) => {
    const read = Data.get(
      Entity.select(Product, { id: true, cents: true }),
      ProductId.make(productId(5)),
    ).read(model)
    return read._tag === 'Ready' ? read.value.cents : read._tag
  }
  try {
    await vi.waitFor(() => expect(cell(productId(5), 'cents')?.textContent).toBe(priceOf(5)))
    expect(price(latest())).toBe(seedOf(5).cents)
    await edit(productId(5), 'cents', '5.55')
    await vi.waitFor(() => expect(price(latest())).toBe(555))
  } finally {
    await dispose()
  }
})

test('a committed edit shows until the table has it, then the table shows, whoever wrote it next', async () => {
  const server = serve()
  const { dispose, exchange, mounted, settle } = await mount(server, memoryStorage())
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
    const before = server.reads()
    reread()
    await vi.waitFor(() => expect(server.reads()).toBeGreaterThan(before))
    await settle()
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
          changes: [{ id: ProductId.make(productId(7)), member: 'cents', value: 999 }],
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
        changes: [{ id: ProductId.make(productId(8)), member: 'cents', value: 1 }],
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
  const { dispose, exchange, latest, settle } = await mount(server, memoryStorage())
  /** Another device's price for product `index`, sent: a reinstall on this page's next exchange. */
  const elsewhere = async (name: string, index: number) => {
    const other = await Effect.runPromise(
      RegistrySync.openReplica(ReplicaId.make(name), memoryStorage()),
    )
    await Effect.runPromise(
      other.submit(
        Message.EditedProducts({
          changes: [{ id: ProductId.make(productId(index)), member: 'cents', value: index }],
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
    // It asks for the row again at once; held here, to see the page meanwhile.
    const release = server.holdReads()
    await Effect.runPromise(server.journal.absorb)
    await exchange()
    // The mount reinstalls on its own fiber; then a frame draws it.
    await vi.waitFor(() => expect(latest().edits).toEqual([]))
    expect(heldOf(latest())).toEqual([productId(9)])
    await settle()
    expect(cell(productId(9), 'cents')?.textContent).toBe('4.40')

    // Another reinstall before the row is read again keeps it still.
    await elsewhere('tab-2', 8)
    await vi.waitFor(() => expect(latest().edits.map(kept => kept.id)).toEqual([productId(8)]))
    expect(heldOf(latest())).toEqual([productId(9)])
    await settle()
    expect(cell(productId(9), 'cents')?.textContent).toBe('4.40')

    // Read again, the row has it at its revision: the price is the table's,
    // and the held edit goes in the same transition.
    release()
    await vi.waitFor(() => expect(revisionOf(latest(), productId(9))).toEqual(Option.some(1)))
    expect(heldOf(latest())).toEqual([])
    expect(latest().replaced).toEqual([])
    await settle()
    expect(cell(productId(9), 'cents')?.textContent).toBe('4.40')
  } finally {
    await dispose()
  }
})

test('an edit replaced while this device was away is said, though the journal absorbed the later one first', async () => {
  const server = serve()
  const { dispose, exchange, latest } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    await edit(productId(3), 'cents', '3.33')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    // This page also hears of another device's price, which it did not write.
    await commitElsewhere(server, 8, 888, 'tab-3')
    await exchange()
    await vi.waitFor(() => expect(cell(productId(8), 'cents')?.textContent).toBe('8.88'))
    // This device is away now. Another commits the same price later, the
    // table takes it, and the journal absorbs both edits before this device
    // hears of the later one: its slice comes back without the price. The
    // other device's price is overwritten meanwhile too.
    await commitElsewhere(server, 3, 444)
    await commitElsewhere(server, 8, 889, 'tab-4')
    expect(server.backend.row(productId(3))).toMatchObject({ cents: 444 })
    await Effect.runPromise(server.journal.absorb)
    await exchange()
    await vi.waitFor(() => expect(latest().edits).toEqual([]))
    // The page reads the row again rather than go on showing its own price
    // as saved, and says a later edit replaced it.
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe('4.44'))
    await vi.waitFor(() => expect(cell(productId(8), 'cents')?.textContent).toBe('8.89'))
    // Only this device's price is said as replaced; the other's was not its own.
    await vi.waitFor(() =>
      expect(latest().replaced).toEqual([
        { id: productId(3), column: 'cents', by: Option.none(), was: '3.33' },
      ]),
    )
    expect(heldOf(latest())).toEqual([])
  } finally {
    await dispose()
  }
})

test('a server restarted under the page drops what it held of the old history', async () => {
  const server = serve()
  const { dispose, exchange, latest } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(4)))
    await edit(productId(4), 'cents', '4.40')
    await exchange()
    await exchange()
    // Absorbed while the cached row is older: held, and the row is asked for.
    const release = server.holdReads()
    await Effect.runPromise(server.journal.absorb)
    await exchange()
    await vi.waitFor(() => expect(heldOf(latest())).toEqual([productId(4)]))

    // The new server's table is the seed, at revision 0, below the held
    // edit's commit in a history that is gone: nothing is held over it.
    server.restart()
    await exchange()
    await vi.waitFor(() => expect(heldOf(latest())).toEqual([]))
    release()
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(4)))
  } finally {
    await dispose()
  }
})

test('a server restarted under the page starts its rows over, so a new edit is not taken as read', async () => {
  const server = serve()
  const { dispose, exchange, mounted, latest } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(2), 'cents')?.textContent).toBe(priceOf(2)))
    // Three commits, read back: the row as the page holds it is at revision 3.
    for (const cents of [201, 202, 203]) await commitElsewhere(server, 2, cents)
    await exchange()
    mounted.dispatch(Message.RetriedProducts())
    await vi.waitFor(() => expect(revisionOf(latest(), productId(2))).toEqual(Option.some(3)))

    // The server starts over: a fresh table, and a journal counting from 1.
    server.restart()
    await commitElsewhere(server, 2, 777)
    await exchange()
    // The new edit committed at 1, below the old revision; the page reads the
    // rows of the new history rather than take it as already in them.
    await vi.waitFor(() => expect(cell(productId(2), 'cents')?.textContent).toBe('7.77'))
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

test('a refusal says which cells it undid, though the page heard of the edit only after', async () => {
  const server = serve()
  // The page hears nothing of the replica's status until the edit is sent
  // and refused: it never sees the edit pending at all.
  let open = () => {}
  const opened = new Promise<void>(resolve => (open = resolve))
  const { dispose, replica, exchange } = await mount(server, memoryStorage(), 'tab-1', changes =>
    changes.pipe(
      Stream.mapEffect(status =>
        Effect.as(
          Effect.promise(() => opened),
          status,
        ),
      ),
    ),
  )
  try {
    await vi.waitFor(() => expect(cell(productId(6), 'cents')?.textContent).toBe(priceOf(6)))
    await edit(productId(6), 'cents', '6.66')
    await vi.waitFor(() => expect(Effect.runSync(replica.pending)).toHaveLength(1))
    server.setTampering(true)
    await exchange()
    expect(Effect.runSync(replica.pending)).toEqual([])
    open()
    await vi.waitFor(() => expect(markOf(productId(6), 'cents')).toBe('refused'))
  } finally {
    open()
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
  const { dispose, exchange, latest, settle } = await mount(server, memoryStorage())
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

    // The same person in another tab is another replica: its later edit
    // replaces this page's, and the page says so, by the person's name.
    await edit(productId(8), 'cents', '8.08')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await tab2(8, 818, 'tab-1')
    await exchange()
    await vi.waitFor(() => expect(markOf(productId(8), 'cents')).toBe('replaced'))
    expect(lines()).toContain(
      `Price of ${productId(8)}: tab-1’s later edit replaced yours (8.08). `,
    )
    click(document.querySelector('#replaced button')!)
    await vi.waitFor(() => expect(lines()).toEqual([]))

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
    await settle()
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
    const options = () =>
      Array.from(document.querySelectorAll<HTMLElement>('#products [role="option"]'))
    await vi.waitFor(() => expect(options()).not.toEqual([]))
    expect(options().map(option => option.textContent)).toEqual([
      'Active',
      'Discontinued',
      'Pending',
    ])
    click(options().find(option => option.textContent === 'Discontinued')!)
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
  const { dispose, exchange, latest, settle } = await mount(server, memoryStorage())
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
    await settle()
    expect(latest().exchange.pending).toBe(0)
    await exchange()
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe('4.44'))
  } finally {
    await dispose()
  }
})

test('a cell committed with the value it already shows is no edit', async () => {
  const server = serve()
  const { dispose, latest, settle } = await mount(server, memoryStorage())
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
    const combobox = () => document.querySelector('#products [role="combobox"]')
    await vi.waitFor(() => expect(combobox()).not.toBeNull())
    press(combobox()!, 'Enter')
    await vi.waitFor(() => expect(combobox()).toBeNull())
    await settle()
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

const undo = () =>
  grid().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
  )
const redo = () =>
  grid().dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Z',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
const heldBack = () =>
  Array.from(document.querySelectorAll('#held-back li'), line => line.firstChild?.textContent)

test('an undo is a new edit that puts the cell back, and a redo another', async () => {
  const server = serve()
  const { dispose, exchange, latest, settle } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    await edit(productId(3), 'cents', '7.00')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(3))).toMatchObject({ cents: 700 })

    // Committed, and so not rewound: the old price goes as an edit of its own.
    undo()
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(3))).toMatchObject({ cents: seedOf(3).cents })

    redo()
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe('7.00'))
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await vi.waitFor(() => expect(server.backend.row(productId(3))).toMatchObject({ cents: 700 }))

    // A new edit after an undo leaves nothing to redo.
    undo()
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    expect(latest().redo).toHaveLength(1)
    await edit(productId(4), 'cents', '4.40')
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe('4.40'))
    expect(latest().redo).toEqual([])
    redo()
    await settle()
    expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3))
  } finally {
    await dispose()
  }
})

test('an undo leaves a cell another device changed since, and says so', async () => {
  const server = serve()
  const { dispose, exchange, latest } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    await pasteAt(productId(3), 'description', 'Mine\t3.33\n')
    await vi.waitFor(() => expect(latest().exchange.pending).toBe(1))
    await exchange()
    await commitElsewhere(server, 3, 444)
    await exchange()
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe('4.44'))

    // The description is still this page's, and goes back; the price is theirs.
    undo()
    await vi.waitFor(() =>
      expect(cell(productId(3), 'description')?.textContent).toBe(seedOf(3).description),
    )
    expect(cell(productId(3), 'cents')?.textContent).toBe('4.44')
    expect(heldBack()).toEqual([`Price of ${productId(3)} changed since; not undone. `])
    await exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(3))).toMatchObject({
      description: seedOf(3).description,
      cents: 444,
    })
    click(document.querySelector('#held-back button')!)
    await vi.waitFor(() => expect(heldBack()).toEqual([]))
  } finally {
    await dispose()
  }
})

test('a paste undoes as one step', async () => {
  const server = serve()
  const { dispose, latest } = await mount(server, memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(5), 'cents')).not.toBeNull())
    await pasteAt(productId(5), 'description', 'Alpha\t1.00\nBeta\t2.00\n')
    await vi.waitFor(() => expect(cell(productId(6), 'cents')?.textContent).toBe('2.00'))

    undo()
    await vi.waitFor(() =>
      expect(cell(productId(5), 'description')?.textContent).toBe(seedOf(5).description),
    )
    expect(cell(productId(5), 'cents')?.textContent).toBe(priceOf(5))
    expect(cell(productId(6), 'description')?.textContent).toBe(seedOf(6).description)
    expect(cell(productId(6), 'cents')?.textContent).toBe(priceOf(6))
    expect(latest().undo).toEqual([])
  } finally {
    await dispose()
  }
})

test('an undo made offline waits on the device, through a reload, like any edit', async () => {
  const server = serve()
  const storage = memoryStorage()
  const first = await mount(server, storage)
  await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
  await edit(productId(3), 'cents', '7.00')
  await vi.waitFor(() => expect(first.latest().exchange.pending).toBe(1))
  await first.exchange()
  await vi.waitFor(() => expect(status()).toBe(''))

  server.setOnline(false)
  undo()
  await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
  await first.exchange()
  await vi.waitFor(() =>
    expect(status()).toBe('1 edit kept on this device; the server cannot be reached (offline).'),
  )
  await first.dispose()

  const second = await mount(server, storage)
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    // The history is the tab's: a reload starts with none.
    expect(second.latest().redo).toEqual([])
    server.setOnline(true)
    await second.exchange()
    await vi.waitFor(() => expect(status()).toBe(''))
    expect(server.backend.row(productId(3))).toMatchObject({ cents: seedOf(3).cents })
  } finally {
    await second.dispose()
  }
})

test('two undos inside one frame take back two steps, not one twice', async () => {
  const { dispose, latest } = await mount(serve(), memoryStorage())
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')).not.toBeNull())
    await edit(productId(3), 'cents', '3.00')
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe('3.00'))
    await edit(productId(4), 'cents', '4.00')
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe('4.00'))

    const frames = Frames.track()
    frames.hold()
    undo()
    undo()
    frames.release()
    frames.dispose()
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(4))
    expect(latest().redo).toHaveLength(2)
  } finally {
    await dispose()
  }
})

test('the panel names each owner the manifest lists, and what each holds now', async () => {
  const server = serve()
  const { dispose, exchange } = await mount(server, memoryStorage())
  const sections = () =>
    Array.from(document.querySelectorAll('#ownership section'), section =>
      section.getAttribute('aria-label'),
    )
  const fact = (field: string) =>
    Array.from(document.querySelectorAll('#ownership dt')).find(term => term.textContent === field)
      ?.nextElementSibling?.textContent
  try {
    await vi.waitFor(() => expect(cell(productId(3), 'cents')?.textContent).toBe(priceOf(3)))
    // The contracts own three fields between them; every other field is the page's.
    expect(sections()).toEqual([
      'Remote · remote',
      'This page',
      'Sync · registry-edits-4',
      'Bundle · DataGrid@grid',
    ])
    // Every field once, grouped by its owner.
    expect(
      Array.from(document.querySelectorAll('#ownership dt'), term => term.textContent).sort(),
    ).toEqual([...manifest.fields].sort())
    expect(fact('remote')).toBe('100 products cached · 1 page list cached · 0 reads in flight')
    expect(fact('edits')).toBe('No edits the table has not written')

    // Committed: in the journal, and still here until the table says it has it.
    await edit(productId(2), 'cents', '2.00')
    await vi.waitFor(() => expect(fact('edits')).toContain('1 edit not yet sent'))
    await exchange()
    await vi.waitFor(() =>
      expect(fact('edits')).toBe('0 edits not yet sent · 1 committed edit not yet in the table'),
    )
    server.setOnline(false)
    await edit(productId(3), 'cents', '7.00')
    await vi.waitFor(() =>
      expect(fact('edits')).toBe(
        `1 edit not yet sent (Price of ${productId(3)}) · 1 committed edit not yet in the table`,
      ),
    )

    // Scrolled to row 50: ten rows in view and six either side are drawn.
    grid().scrollTop = 1600
    grid().dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(fact('grid')).toContain('rows 45 to 66 drawn'))
    expect(document.getElementById('counts')!.textContent).toBe(
      '100 read, more to come · 22 rows drawn',
    )
  } finally {
    await dispose()
  }
})

test('a fill is one edit of the cells it writes, and one step to undo', async () => {
  const { dispose, latest } = await mount(serve(), memoryStorage())
  const fill = () =>
    grid().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }),
    )
  try {
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(4)))
    // Product 3's price, carried down to product 4 from the cell above.
    await focusOn(productId(4), 'cents')
    fill()
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(3)))
    expect(latest().undo).toHaveLength(1)
    undo()
    await vi.waitFor(() => expect(cell(productId(4), 'cents')?.textContent).toBe(priceOf(4)))
  } finally {
    await dispose()
  }
})

test('a search is the query’s input: the server filters every product, case folded', async () => {
  const { dispose, latest } = await mount(serve(), memoryStorage())
  const search = (text: string) => {
    const box = document.querySelector<HTMLInputElement>('#search')!
    box.value = text
    box.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const descriptions = () =>
    Array.from(
      document.querySelectorAll('#products [role="gridcell"][id$=":description"]'),
      element => element.textContent ?? '',
    )
  try {
    await vi.waitFor(() => expect(cell(productId(0), 'upc')?.textContent).toBe(seedOf(0).upc))
    search('DOWEL')
    await vi.waitFor(() => expect(cell(productId(0), 'upc')).toBeNull())
    await vi.waitFor(() => expect(descriptions().length).toBeGreaterThan(5))
    expect(descriptions().every(text => text.includes('Dowel'))).toBe(true)
    // Read from the server's filter, not the page loaded: a page of matches.
    expect(loaded(latest())).toBe(100)
    search('')
    await vi.waitFor(() => expect(cell(productId(0), 'upc')?.textContent).toBe(seedOf(0).upc))
  } finally {
    await dispose()
  }
})
