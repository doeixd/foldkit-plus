import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { IDBFactory } from 'fake-indexeddb'
import { Agent } from 'foldkit-agent'
import {
  DocumentId,
  LocalSequence,
  OpId,
  ReplicaId,
  Sequence,
  StorageError,
  type Exchange,
  type Operation,
  type Storage,
} from 'foldkit-sync'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Message, type Shared } from '../src/app.js'
import { openJournal, type Principal } from '../src/journal.js'
import { serverAgentHost } from '../src/serverAgent.js'
import { closeStorages, openReplica, openStorage, type PromiseReplica } from './helpers.js'

const principal = { actorId: 'owner', documentId: 'todos', canWrite: true }
const created = (id: string, title = id) => Message.CreatedTodo({ id, title })
const operation = (
  replica: string,
  local: number,
  message: Message = created(replica),
): Operation => ({
  protocolVersion: 1,
  schemaVersion: 1,
  documentId: DocumentId.make('todos'),
  replicaId: ReplicaId.make(replica),
  localSequence: LocalSequence.make(local),
  opId: OpId.make(`${replica}:${local}`),
  baseCursor: Sequence.make(0),
  message,
})
let factory: IDBFactory
let server: ReturnType<typeof openJournal>
let replicas: Array<PromiseReplica>
const open = async (id: string, storage?: Storage): Promise<PromiseReplica> => {
  const replica = await openReplica(
    id,
    storage ?? (await Effect.runPromise(openStorage(id, factory))),
  )
  replicas.push(replica)
  return replica
}
beforeEach(() => {
  factory = new IDBFactory()
  server = openJournal(':memory:')
  replicas = []
})
afterEach(async () => {
  await Promise.all(replicas.map(replica => replica.close()))
  server.close()
  await closeStorages()
})

// Generic durable-journal and replica behavior lives in packages/durable and
// packages/sync; these cover how this application's contract is wired to them.
describe('the journal adapter', () => {
  it('persists app operations across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'foldkit-journal-'))
    const path = join(directory, 'journal.sqlite')
    const journal = openJournal(path)
    try {
      const first = journal.append(operation('a', 1), principal)
      expect(journal.append(operation('a', 1), principal)).toEqual(first)
      // Key order in the encoded Message must not affect idempotency.
      expect(
        journal.append(
          {
            ...Object.fromEntries(Object.entries(operation('a', 1)).reverse()),
            message: { title: 'a', id: 'a', _tag: 'CreatedTodo' },
          },
          principal,
        ),
      ).toEqual(first)
      journal.append(operation('b', 1), principal)
    } finally {
      journal.close()
    }
    const reopened = openJournal(path)
    try {
      expect(reopened.read('todos', 1).map(op => op.opId)).toEqual(['b:1'])
      expect(reopened.snapshot('todos')).toEqual({
        cursor: 2,
        model: {
          todos: [
            { id: 'a', title: 'a' },
            { id: 'b', title: 'b' },
          ],
        },
      })
      expect(reopened.append(operation('a', 1), principal).serverSequence).toBe(1)
      expect(reopened.snapshot('other').cursor).toBe(0)
    } finally {
      reopened.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    ['schema version', { ...operation('a', 1), schemaVersion: 2 }],
    ['protocol version', { ...operation('a', 1), protocolVersion: 2 }],
    ['forged actor', { ...operation('a', 1), actorId: 'admin' }],
    ['document', { ...operation('a', 1), documentId: 'other' }],
    ['identity', { ...operation('a', 1), opId: 'b:9' }],
    ['payload', { ...operation('a', 1), message: { _tag: 'CreatedTodo', id: 'a', title: 42 } }],
    ['local Message', { ...operation('a', 1), message: Message.SelectedTodo({ id: 'a' }) }],
    ['future cursor', { ...operation('a', 1), baseCursor: 1 }],
  ])('refuses invalid %s before committing', (_, input) => {
    expect(() => server.append(input, principal)).toThrow()
    expect(server.snapshot('todos').cursor).toBe(0)
    expect(server.read('todos', 0)).toEqual([])
  })

  it('refuses unauthorized writes and unauthenticated reads', async () => {
    expect(() => server.append(operation('a', 1), { ...principal, canWrite: false })).toThrow(
      'Unauthorized',
    )
    await expect(
      server.transport({ ...principal, actorId: '' }).exchange(Sequence.make(0), []),
    ).rejects.toThrow('Unauthenticated')
    expect(server.snapshot('todos').cursor).toBe(0)
  })

  it('applies the app policy against the authoritative Model', () => {
    const guarded = openJournal(':memory:', {
      authorize: ({ message, model }) =>
        message._tag !== 'RenamedTodo' || model.todos.some(todo => todo.id === message.id),
    })
    try {
      // Nothing to rename yet, so the Model refuses it even though the input is
      // well-formed.
      expect(() =>
        guarded.append(
          operation('a', 1, Message.RenamedTodo({ id: 'a', title: 'renamed' })),
          principal,
        ),
      ).toThrow('refused by authorization')

      guarded.append(operation('a', 1, created('a')), principal)
      guarded.append(
        operation('a', 2, Message.RenamedTodo({ id: 'a', title: 'renamed' })),
        principal,
      )
      expect(guarded.snapshot('todos').model).toEqual({ todos: [{ id: 'a', title: 'renamed' }] })
    } finally {
      guarded.close()
    }
  })

  it('rejects an operation that does not decode, and commits the rest of the exchange', async () => {
    const malformed = {
      ...operation('a', 1),
      // @ts-expect-error a client that does not speak the schema: an id that is not a string
      message: { _tag: 'CreatedTodo', id: 5, title: 'x' } as Message,
    }
    // Retrying would fail the same way, so it is rejected rather than failing the exchange.
    await expect(
      server
        .transport(principal)
        .exchange(Sequence.make(0), [malformed, operation('a', 2, created('b'))]),
    ).resolves.toMatchObject({ rejected: ['a:1'], acknowledged: ['a:2'] })
    expect(server.snapshot('todos').model).toEqual({ todos: [{ id: 'b', title: 'b' }] })
  })

  it('refuses a cursor ahead of the server before committing anything', async () => {
    // A client that synced with a server since reset: its edits must not commit only to
    // have their acknowledgements lost with the failed read.
    await expect(
      server.transport(principal).exchange(Sequence.make(5), [operation('a', 1, created('b'))]),
    ).rejects.toThrow('Cursor 5 is ahead of the server')
    expect(server.snapshot('todos')).toEqual({ cursor: 0, model: { todos: [] } })
  })

  it('answers a replica that saw another epoch from the start, committing its outbox', async () => {
    const a = await open('a')
    await a.submit(created('old'))
    await a.synchronize(server.transport(principal))
    await a.submit(created('waiting'))
    // A new server behind the replica's cursor: it has another epoch and other history.
    const other = openJournal(':memory:')
    other.append(operation('b', 1, created('theirs')), principal)
    await a.synchronize(other.transport(principal))
    expect(a.shared().todos.map(todo => todo.id)).toEqual(['theirs', 'waiting'])
    expect(other.snapshot('todos').model.todos.map(todo => todo.id)).toEqual(['theirs', 'waiting'])
    other.close()
  })

  it('refuses an operation from a replica another actor committed from first', async () => {
    const transport = server.transport(principal)
    await transport.exchange(Sequence.make(0), [operation('a', 1, created('first'))])
    await expect(
      server
        .transport({ ...principal, actorId: 'intruder' })
        .exchange(Sequence.make(1), [operation('a', 2, created('second'))]),
    ).resolves.toMatchObject({ rejected: ['a:2'], acknowledged: [] })
  })

  it('catches a replica far behind up in pages, within one synchronize', async () => {
    const paged = openJournal(':memory:', { page: 2 })
    for (let index = 1; index <= 5; index++)
      paged.append(operation('seed', index, created(`t${index}`)), principal)
    const reader = await open('reader')
    await reader.synchronize(paged.transport(principal))
    expect(reader.shared().todos.map(todo => todo.id)).toEqual(['t1', 't2', 't3', 't4', 't5'])
    paged.close()
  })

  it('rejects an id reused for other content, as a client whose storage was wiped sends', async () => {
    const transport = server.transport(principal)
    await transport.exchange(Sequence.make(0), [operation('a', 1, created('first'))])
    await expect(
      transport.exchange(Sequence.make(1), [operation('a', 1, created('second'))]),
    ).resolves.toMatchObject({ rejected: ['a:1'], acknowledged: [] })
    expect(server.snapshot('todos').model).toEqual({ todos: [{ id: 'first', title: 'first' }] })
  })

  it('sends a checkpoint only below the compaction floor', async () => {
    server.append(operation('seed', 1, created('a')), principal)
    server.append(operation('seed', 2, created('b')), principal)
    server.compact('todos', 1)
    const transport = server.transport(principal)

    // At the floor the retained tail still covers the range.
    await expect(transport.exchange(Sequence.make(1), [])).resolves.not.toHaveProperty('checkpoint')
    // Below it the log cannot, so the snapshot is sent instead.
    await expect(transport.exchange(Sequence.make(0), [])).resolves.toMatchObject({
      checkpoint: { cursor: 2 },
    })
  })

  it('sequences server-authored operations from the cursor', () => {
    const guarded = openJournal(':memory:')
    try {
      const first = guarded.appendAsServer(created('a'), principal, 'server')
      const second = guarded.appendAsServer(created('b'), principal, 'server')

      expect([first.opId, second.opId]).toEqual(['server:1', 'server:2'])
      expect([first.serverSequence, second.serverSequence]).toEqual([1, 2])
      expect(guarded.snapshot('todos').model.todos.map(todo => todo.id)).toEqual(['a', 'b'])
    } finally {
      guarded.close()
    }
  })

  it('runs a server-authority effect once per committed operation', async () => {
    let notifications = 0
    const guarded = openJournal(':memory:', {
      effects: message =>
        message._tag === 'RenamedTodo'
          ? [
              {
                name: 'notify',
                run: async () => {
                  notifications += 1
                },
              },
            ]
          : [],
    })
    try {
      guarded.append(operation('seed', 1, created('todo')), principal)
      const a = await open('a')
      await a.submit(Message.RenamedTodo({ id: 'todo', title: 'renamed' }))

      // The commit lands and the effect runs, but the reply is lost.
      await expect(
        a.synchronize({
          exchange: async (cursor, pending) => {
            await guarded.transport(principal).exchange(cursor, pending)
            throw new Error('connection lost')
          },
        }),
      ).rejects.toThrow('connection lost')
      expect(notifications).toBe(1)

      // The resend is idempotent, and the recorded effect is not run again.
      await a.synchronize(guarded.transport(principal))
      expect(notifications).toBe(1)
      expect(a.pending()).toEqual([])
    } finally {
      guarded.close()
    }
  })

  it('keys server effects per document, not just per operation', async () => {
    let notifications = 0
    const guarded = openJournal(':memory:', {
      effects: message =>
        message._tag === 'RenamedTodo'
          ? [
              {
                name: 'notify',
                run: async () => {
                  notifications += 1
                },
              },
            ]
          : [],
    })
    const a = { actorId: 'owner', documentId: 'a', canWrite: true }
    const b = { actorId: 'owner', documentId: 'b', canWrite: true }
    try {
      guarded.appendAsServer(created('x'), a, 'seed')
      guarded.appendAsServer(created('x'), b, 'seed')

      // The same replica sequence in two documents: only the document differs.
      const first = guarded.append(
        { ...operation('r', 1, Message.RenamedTodo({ id: 'x', title: 'one' })), documentId: 'a' },
        a,
      )
      const second = guarded.append(
        { ...operation('r', 1, Message.RenamedTodo({ id: 'x', title: 'two' })), documentId: 'b' },
        b,
      )

      await guarded.settle(first)
      await guarded.settle(second)
      expect(notifications).toBe(2)
    } finally {
      guarded.close()
    }
  })

  it('does not repeat an effect when a compacted operation is retransmitted', async () => {
    let notifications = 0
    const guarded = openJournal(':memory:', {
      effects: message =>
        message._tag === 'RenamedTodo'
          ? [
              {
                name: 'notify',
                run: async () => {
                  notifications += 1
                },
              },
            ]
          : [],
    })
    try {
      guarded.append(operation('seed', 1, created('todo')), principal)
      const a = await open('a')
      await a.submit(Message.RenamedTodo({ id: 'todo', title: 'renamed' }))

      // The commit lands and the effect runs, but the reply is lost.
      await expect(
        a.synchronize({
          exchange: async (cursor, pending) => {
            await guarded.transport(principal).exchange(cursor, pending)
            throw new Error('connection lost')
          },
        }),
      ).rejects.toThrow('connection lost')
      // Compaction folds both operations into the snapshot and drops payloads.
      guarded.compact('todos', 2)
      expect(notifications).toBe(1)

      // The resend is acknowledged from the identity row, and the effect is not
      // repeated, even though the payload is gone.
      await a.synchronize(guarded.transport(principal))
      expect(notifications).toBe(1)
      expect(a.pending()).toEqual([])
    } finally {
      guarded.close()
    }
  })

  it('refuses a compacted identity reused with a different payload without settling', async () => {
    let notifications = 0
    const guarded = openJournal(':memory:', {
      effects: message =>
        message._tag === 'RenamedTodo'
          ? [
              {
                name: 'notify',
                run: async () => {
                  notifications += 1
                },
              },
            ]
          : [],
    })
    try {
      guarded.append(operation('seed', 1, created('todo')), principal)
      const a = await open('a')
      await a.submit(Message.RenamedTodo({ id: 'todo', title: 'renamed' }))
      await expect(
        a.synchronize({
          exchange: async (cursor, pending) => {
            await guarded.transport(principal).exchange(cursor, pending)
            throw new Error('connection lost')
          },
        }),
      ).rejects.toThrow('connection lost')
      guarded.compact('todos', 2)
      expect(notifications).toBe(1)

      // a:1 is committed and compacted. Reusing that opId with a different
      // payload must conflict, which rejects it, and must not settle an effect
      // for the replacement payload that never entered the state machine.
      await expect(
        guarded
          .transport(principal)
          .exchange(Sequence.make(0), [
            operation('a', 1, Message.RenamedTodo({ id: 'todo', title: 'malicious' })),
          ]),
      ).resolves.toMatchObject({ rejected: ['a:1'], acknowledged: [] })
      expect(notifications).toBe(1)
      expect(guarded.snapshot('todos').model).toEqual({
        todos: [{ id: 'todo', title: 'renamed' }],
      })
    } finally {
      guarded.close()
    }
  })
})

describe('the wired replica', () => {
  it('restores the offline outbox and sequence without persisting local Model fields', async () => {
    const a = await open('a')
    await a.submit(created('first'))
    await a.close()
    const restored = await open('a')
    expect(restored.shared().todos).toEqual([{ id: 'first', title: 'first' }])
    await restored.submit(created('second'))
    expect(restored.pending().map(op => op.opId)).toEqual(['a:1', 'a:2'])
    const store = await Effect.runPromise(openStorage('a', factory))
    const saved = await Effect.runPromise(store.load())
    await Effect.runPromise(store.close)
    expect(saved).toMatchObject({ protocolVersion: 1, schemaVersion: 1, nextLocalSequence: 3 })
    expect(JSON.stringify(saved)).not.toMatch(/selectedTodoId|lastError/)
  })

  /** What the database holds, read with IndexedDB itself rather than the storage under test. */
  const stored = (name: string, version?: number) =>
    new Promise<{ state: unknown; outbox: ReadonlyArray<unknown> }>((resolve, reject) => {
      const request = factory.open(name, version)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const stores = [...database.objectStoreNames]
        const transaction = database.transaction(stores, 'readonly')
        const state = transaction.objectStore('replica').get('state')
        const outbox = stores.includes('outbox')
          ? transaction.objectStore('outbox').getAll()
          : undefined
        transaction.oncomplete = () => {
          database.close()
          resolve({ state: state.result, outbox: outbox?.result ?? [] })
        }
      }
    })

  it('appends a submitted operation, leaving the saved state for an exchange to rewrite', async () => {
    const a = await open('a')
    await a.submit(created('first'))
    await a.submit(created('second'))
    const written = await stored('a')
    // The state is still the one written when the replica was made; each submit added a row.
    expect(written.state).toMatchObject({ revision: 0, pending: [] })
    expect(written.outbox).toHaveLength(2)

    await a.synchronize(server.transport(principal))
    const exchanged = await stored('a')
    expect(exchanged.outbox).toEqual([])
    expect(exchanged.state).toMatchObject({ pending: [], cursor: 2 })
  })

  it('rewrites a merged rename in place, wherever the unsent rename was stored', async () => {
    const a = await open('a')
    await a.submit(created('t'))
    const rename = (title: string) => Message.RenamedTodo({ id: 't', title })
    // Submitted while an exchange is out, so the exchange's save stores it in the state,
    // unsent; the next rename merges into it with a row of its own.
    await a.synchronize({
      exchange: async (cursor, pending) => {
        await a.submit(rename('one'))
        return server.transport(principal).exchange(cursor, pending)
      },
    })
    expect(await stored('a')).toMatchObject({ state: { pending: [{ opId: 'a:2' }] }, outbox: [] })
    await a.submit(rename('two'))
    // Merged again, into the row the last merge wrote: still one row.
    await a.submit(rename('three'))
    expect((await stored('a')).outbox).toHaveLength(1)
    await a.close()

    const reopened = await open('a')
    expect(reopened.pending().map(op => [op.opId, op.message])).toEqual([['a:2', rename('three')]])
  })

  it('opens a database written before the outbox existed, and appends to it', async () => {
    // A replica's state as version 1 wrote it: one record, with its revision inside.
    const first = await open('v1-source')
    await first.submit(created('first'))
    await first.synchronize(server.transport(principal))
    const { state } = await stored('v1-source')
    await first.close()
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('legacy', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('replica')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('replica', 'readwrite')
        transaction
          .objectStore('replica')
          .put({ ...(state as object), replicaId: 'legacy' }, 'state')
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
      }
    })

    const legacy = await open('legacy')
    expect(legacy.shared().todos).toEqual([{ id: 'first', title: 'first' }])
    await legacy.submit(created('second'))
    await legacy.close()
    const reopened = await open('legacy')
    expect(reopened.pending().map(op => op.message)).toEqual([created('second')])
  })

  it('publishes nothing on failed persistence and can retry without losing its sequence', async () => {
    const store = await Effect.runPromise(openStorage('a', factory))
    let fail = false
    const a = await open('a', {
      ...store,
      save: (state, revision) =>
        fail
          ? Effect.fail(new StorageError({ message: 'disk full' }))
          : store.save(state, revision),
      append: (entry, revision) =>
        fail
          ? Effect.fail(new StorageError({ message: 'disk full' }))
          : store.append(entry, revision),
    })
    fail = true
    await expect(a.submit(created('a'))).rejects.toThrow('disk full')
    expect(a.shared()).toEqual({ todos: [] })
    expect(a.pending()).toEqual([])
    fail = false
    await a.submit(created('a'))
    expect(a.pending().map(op => op.opId)).toEqual(['a:1'])
  })

  it('prevents simultaneous handles from overwriting one replica identity', async () => {
    const first = await open('a')
    const second = await open('a')
    await first.submit(created('first'))
    await expect(second.submit(created('second'))).rejects.toThrow('another writer')
    expect(second.shared()).toEqual({ todos: [] })
    const restored = await open('a')
    expect(restored.pending().map(op => op.message)).toEqual([created('first')])
  })

  it('converges conflicting offline renames by authoritative order and clears acknowledgements', async () => {
    server.append(operation('seed', 1, created('todo')), principal)
    const a = await open('a')
    const b = await open('b')
    const transport = server.transport(principal)
    await Promise.all([a.synchronize(transport), b.synchronize(transport)])
    await a.submit(Message.RenamedTodo({ id: 'todo', title: 'Alice' }))
    await b.submit(Message.RenamedTodo({ id: 'todo', title: 'Bob' }))
    await b.synchronize(transport)
    await a.synchronize(transport)
    await b.synchronize(transport)
    expect(a.shared()).toEqual({ todos: [{ id: 'todo', title: 'Alice' }] })
    expect(b.shared()).toEqual(a.shared())
    expect(server.snapshot('todos').model).toEqual(a.shared())
    expect([a.cursor(), b.cursor()]).toEqual([3, 3])
    expect([a.pending(), b.pending()]).toEqual([[], []])
  })

  it('resends after a lost acknowledgement without duplicating a commit', async () => {
    const a = await open('a')
    await a.submit(created('todo'))
    await expect(
      a.synchronize({
        exchange: async (cursor, pending) => {
          await server.transport(principal).exchange(cursor, pending)
          throw new Error('connection lost')
        },
      }),
    ).rejects.toThrow('connection lost')
    expect(a.pending()).toHaveLength(1)
    await a.synchronize(server.transport(principal))
    expect(server.read('todos', 0).map(op => op.opId)).toEqual(['a:1'])
    expect(a.pending()).toEqual([])
  })

  it('keeps edits made during a pull and rebases them onto remote changes', async () => {
    const a = await open('a')
    let release!: (value: Exchange<Shared>) => void
    let started!: () => void
    const ready = new Promise<void>(resolve => {
      started = resolve
    })
    const response = new Promise<Exchange<Shared>>(resolve => {
      release = resolve
    })
    const running = a.synchronize({
      exchange: () => {
        started()
        return response
      },
    })
    await ready
    await a.submit(created('local'))
    const remote = server.append(operation('remote', 1), principal)
    release({ operations: [remote], rejected: [] })
    await running
    expect(a.shared().todos.map(todo => todo.id)).toEqual(['remote', 'local'])
    expect(a.pending().map(op => op.opId)).toEqual(['a:1'])
  })

  it('ignores retransmitted committed operations and refuses work after close', async () => {
    const a = await open('a')
    const committed = server.append(operation('a', 1), principal)
    const transport = { exchange: async () => ({ operations: [committed], rejected: [] }) }
    await a.synchronize(transport)
    await a.synchronize(transport)
    expect(a.cursor()).toBe(1)
    expect(a.shared().todos).toEqual([{ id: 'a', title: 'a' }])
    await a.close()
    await a.close()
    await expect(a.submit(created('b'))).rejects.toThrow('closed')
  })

  it.each([
    ['malformed rejection', { operations: [], rejected: 'a:1' }],
    ['unknown committed shape', { operations: [{ nope: true }], rejected: [] }],
  ])('refuses a response with %s without changing durable state', async (_, response) => {
    const a = await open('a')
    await a.submit(created('local'))
    await expect(a.synchronize({ exchange: async () => response })).rejects.toThrow()
    expect(a.cursor()).toBe(0)
    expect(a.shared().todos).toEqual([{ id: 'local', title: 'local' }])
    expect(a.pending().map(op => op.opId)).toEqual(['a:1'])
  })

  it('catches a new replica up from a checkpoint after history is compacted', async () => {
    server.append(operation('seed', 1, created('a')), principal)
    server.append(
      operation('seed', 2, Message.RenamedTodo({ id: 'a', title: 'renamed' })),
      principal,
    )
    server.append(operation('seed', 3, created('b')), principal)
    const expected = server.snapshot('todos').model
    server.compact('todos', 2)

    const a = await open('a')
    await a.synchronize(server.transport(principal))

    // The retained tail starts at sequence 3, so replaying it alone fails the
    // contiguity check; the checkpoint is what makes this converge.
    expect(a.cursor()).toBe(3)
    expect(a.shared()).toEqual(expected)
    expect(a.pending()).toEqual([])
  })

  it('acknowledges a pending operation that compaction already folded in', async () => {
    const a = await open('a')
    await a.submit(created('todo'))
    await expect(
      a.synchronize({
        exchange: async (cursor, pending) => {
          await server.transport(principal).exchange(cursor, pending)
          throw new Error('connection lost')
        },
      }),
    ).rejects.toThrow('connection lost')
    // The server committed a:1 before the reply was lost, then compacted it, so
    // the replica cannot rediscover the acknowledgement from the log.
    server.compact('todos', 1)

    await a.synchronize(server.transport(principal))

    expect(a.cursor()).toBe(1)
    expect(a.pending()).toEqual([])
    expect(a.shared()).toEqual(server.snapshot('todos').model)
  })
})

describe('a server agent', () => {
  const SyncAgent = Agent.forModel<Shared, Principal>()
  const rename = { name: 'rename_todo', description: 'Rename a shared todo' } as const

  it('commits a dispatch as an operation a replica converges on', async () => {
    server.append(operation('seed', 1, created('a')), principal)
    const agent = Agent.bind({
      definition: SyncAgent.make({
        messages: SyncAgent.expose(Message, { RenamedTodo: rename }),
      }),
      host: serverAgentHost({ journal: server, principal }),
    })

    await Effect.runPromise(agent.messages.dispatch('rename_todo', { id: 'a', title: 'renamed' }))

    // The agent is a producer with its own replica identity and the caller's
    // actor, not a second mutation path.
    expect(server.read('todos', 0).at(-1)).toMatchObject({
      replicaId: 'agent-owner',
      actorId: 'owner',
    })

    const replica = await open('replica')
    await replica.synchronize(server.transport(principal))
    expect(replica.shared()).toEqual(server.snapshot('todos').model)
  })

  it('lets agents acting for different callers each commit to one document', async () => {
    server.append(operation('seed', 1, created('a')), principal)
    for (const actorId of ['owner', 'alice']) {
      const agent = Agent.bind({
        definition: SyncAgent.make({
          messages: SyncAgent.expose(Message, { RenamedTodo: rename }),
        }),
        host: serverAgentHost({ journal: server, principal: { ...principal, actorId } }),
      })
      await Effect.runPromise(agent.messages.dispatch('rename_todo', { id: 'a', title: actorId }))
    }
    expect(server.snapshot('todos').model.todos).toEqual([{ id: 'a', title: 'alice' }])
  })

  it('refuses a capability the principal may not invoke, appending nothing', async () => {
    const agent = Agent.bind({
      definition: SyncAgent.make({
        messages: SyncAgent.expose(Message, {
          RenamedTodo: {
            ...rename,
            authorize: ({ principal }) => principal.actorId === 'owner',
          },
        }),
      }),
      host: serverAgentHost({ journal: server, principal: { ...principal, actorId: 'guest' } }),
    })

    const result = await Effect.runPromise(
      Effect.result(agent.messages.dispatch('rename_todo', { id: 'a', title: 'x' })),
    )

    expect(result._tag).toBe('Failure')
    if (result._tag === 'Failure') expect(result.failure._tag).toBe('AgentAuthorizationError')
    expect(server.snapshot('todos').cursor).toBe(0)
  })

  it('cannot bypass the journal policy', async () => {
    const guarded = openJournal(':memory:', {
      authorize: ({ principal }) => principal.actorId === 'owner',
    })
    try {
      const host = serverAgentHost({
        journal: guarded,
        principal: { ...principal, actorId: 'guest' },
      })

      // The agent runtime turns a host failure into a defect, so a diverging
      // policy fails loudly rather than committing. The contract's typed
      // `authorize` is the refusal path a caller should see.
      await expect(host.dispatch(Message.RenamedTodo({ id: 'a', title: 'x' }))).rejects.toThrow(
        'refused by authorization',
      )
      expect(guarded.snapshot('todos').cursor).toBe(0)
    } finally {
      guarded.close()
    }
  })

  it('settles server-authority effects once for an agent dispatch', async () => {
    let notifications = 0
    const guarded = openJournal(':memory:', {
      effects: message =>
        message._tag === 'RenamedTodo'
          ? [
              {
                name: 'notify',
                run: async () => {
                  notifications += 1
                },
              },
            ]
          : [],
    })
    try {
      guarded.appendAsServer(created('a'), principal, 'seed')
      const agent = Agent.bind({
        definition: SyncAgent.make({
          messages: SyncAgent.expose(Message, { RenamedTodo: rename }),
        }),
        host: serverAgentHost({ journal: guarded, principal }),
      })

      await Effect.runPromise(agent.messages.dispatch('rename_todo', { id: 'a', title: 'renamed' }))
      expect(notifications).toBe(1)

      // Settling the same operation again does not repeat the effect.
      await guarded.settle(guarded.read('todos', 0).at(-1)!)
      expect(notifications).toBe(1)
    } finally {
      guarded.close()
    }
  })
})
