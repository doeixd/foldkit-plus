import { mkdtempSync, rmdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Deferred, Effect, Fiber, Layer, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Journal as Durable, actorId, opId } from 'foldkit-durable'
import { recover } from 'foldkit-successor/commands'
import {
  client,
  commitTogether,
  serve,
  streamId,
  type TransportOf,
} from 'foldkit-successor/event-sourced'
import {
  AtomicJournal,
  Journal,
  JournalFailure,
  memory,
  memoryLayer,
  type WireCommit,
} from 'foldkit-successor/journal'
import { sqliteLayer } from 'foldkit-successor/sqlite'
import { initial, invariant, rows, Stamp, target, todos } from './fixtures/todos.js'

const toggle = (owner: string, id: string, key = '7', expectedRevision = 0) => ({
  type: 'ToggleTodo' as const,
  id,
  expectedRevision,
  input: { target: target(initial(owner), key) },
})
const stamp = Layer.succeed(Stamp, { allocate: Effect.succeed(77) })
const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> => Effect.runPromise(effect)

const pair = (key = '7', expected = 0) =>
  [
    todos.member('work', toggle('work', 'shared-click', key, expected)),
    todos.member('home', toggle('home', 'shared-click', '7', expected)),
  ] as const

const histories = (journal: typeof Journal.Service) =>
  Effect.forEach(['work', 'home'], name => journal.read(streamId('Todos', name), 'initial'))

describe('cross-stream commits', () => {
  it('recovers the original ordered receipt and commands after a lost SQLite acknowledgement', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'successor-transaction-'))
    const file = join(directory, 'todos.db')
    let allocations = 0
    const work = commitTogether('toggle both', pair())
    try {
      const failed = await run(
        Effect.gen(function* () {
          const journal = yield* AtomicJournal
          const lost = new JournalFailure({ operation: 'acknowledge', cause: 'connection closed' })
          return yield* work.pipe(
            Effect.provideService(AtomicJournal, {
              ...journal,
              appendTransaction: (id, entries) =>
                Effect.andThen(journal.appendTransaction(id, entries), Effect.fail(lost)),
            }),
            Effect.result,
          )
        }).pipe(
          Effect.provideService(Stamp, { allocate: Effect.sync(() => ++allocations) }),
          Effect.provide(sqliteLayer(file)),
        ),
      )
      expect(Result.getFailure(failed)).toMatchObject({ value: { operation: 'acknowledge' } })
      const recovered = await run(
        Effect.gen(function* () {
          const journal = yield* AtomicJournal
          const first = yield* work
          const repeated = yield* commitTogether('toggle both', pair('7', 1))
          const altered = yield* Effect.result(commitTogether('toggle both', pair('8')))
          const saved = yield* histories(journal)
          const replayed = saved.map((history, index) =>
            todos.replay(index === 0 ? 'work' : 'home', history),
          )
          return { first, repeated, altered, saved, replayed }
        }).pipe(
          Effect.provideService(Stamp, {
            allocate: Effect.die(new Error('Acknowledgement retry allocated a new stamp')),
          }),
          Effect.provide(sqliteLayer(file)),
        ),
      )
      expect(allocations).toBe(2)
      expect(recovered.first).toEqual(recovered.repeated)
      expect(Result.getFailure(recovered.altered)).toMatchObject({
        value: { transactionId: 'toggle both' },
      })
      expect(recovered.saved.map(({ commits }) => commits.length)).toEqual([1, 1])
      expect(recovered.replayed.map(({ state }) => state.remaining)).toEqual([1, 1])
      const accepted = recovered.first.map(answer => {
        if (answer.kind !== 'accepted') throw new Error('Expected the committed Toggle')
        return answer
      })
      expect(accepted.map(answer => answer.events[0]?.payload.stamp)).toEqual([1, 2])
      expect(accepted.map(answer => answer.commands[0]?.id)).toEqual(
        ['work', 'home'].map(name => JSON.stringify([streamId('Todos', name), 'shared-click', 0])),
      )
    } finally {
      rmSync(file, { force: true })
      rmdirSync(directory)
    }
  })

  it.each(['memory', 'SQLite'] as const)(
    'rolls back the first stream if a competing writer advances the second on %s',
    async adapter => {
      const directory = mkdtempSync(join(tmpdir(), 'successor-contention-'))
      const file = join(directory, 'todos.db')
      try {
        const checked = await run(
          Effect.gen(function* () {
            const readers = adapter === 'SQLite' ? sqliteLayer(file) : memoryLayer
            const first = Context.get(yield* Layer.build(readers), AtomicJournal)
            const competing =
              adapter === 'SQLite'
                ? Context.get(yield* Layer.build(sqliteLayer(file)), Journal)
                : first
            const ready = yield* Deferred.make<void>()
            const release = yield* Deferred.make<void>()
            let decisions = 0
            const attempt = yield* commitTogether('winner or rollback', pair()).pipe(
              Effect.provideService(AtomicJournal, first),
              Effect.provideService(Stamp, {
                allocate: Effect.suspend(() => {
                  decisions++
                  if (decisions === 1) return Effect.succeed(20)
                  return Effect.andThen(
                    Deferred.succeed(ready, undefined),
                    Deferred.await(release),
                  ).pipe(Effect.as(21))
                }),
              }),
              Effect.result,
              Effect.forkScoped,
            )
            yield* Deferred.await(ready)
            const during = yield* histories(competing)
            const home = yield* Effect.provideService(todos.open('home'), Journal, competing)
            yield* Effect.provide(home.dispatch(toggle('home', 'competing', '8')), stamp)
            yield* Deferred.succeed(release, undefined)
            const outcome = yield* Fiber.join(attempt)
            return {
              during,
              outcome,
              after: yield* histories(competing),
              receipt: yield* first.findTransaction('winner or rollback'),
            }
          }).pipe(Effect.scoped),
        )
        expect(checked.during.map(history => history.commits.length)).toEqual([0, 0])
        expect(Result.getFailure(checked.outcome)).toMatchObject({
          value: { expected: 0, actual: 1 },
        })
        expect(
          checked.after.map(history => history.commits.map(entry => entry.dispatchId)),
        ).toEqual([[], ['competing']])
        expect(Option.isNone(checked.receipt)).toBe(true)
      } finally {
        rmSync(file, { force: true })
        rmdirSync(directory)
      }
    },
  )

  it('refuses duplicate streams and incapable hosts before executing decisions', async () => {
    const failures = await run(
      Effect.gen(function* () {
        const original = yield* AtomicJournal
        const incapable = {
          ...original,
          capabilities: { ...original.capabilities, isolates: 'statement' as const },
        }
        const [first] = pair()
        const duplicate = yield* Effect.result(commitTogether('duplicate', [first, first]))
        const refused = yield* Effect.result(
          Effect.provideService(commitTogether('wrong host', pair()), AtomicJournal, incapable),
        )
        return { duplicate, refused, saved: yield* histories(original) }
      }).pipe(
        Effect.provideService(Stamp, { allocate: Effect.die(new Error('Unexpected decision')) }),
        Effect.provide(memoryLayer),
      ),
    )
    expect(Result.getFailure(failures.duplicate)).toMatchObject({
      value: { operation: 'transaction' },
    })
    expect(Result.getFailure(failures.refused)).toMatchObject({
      value: { refused: [{ rule: 'atomic event streams' }] },
    })
    expect(failures.saved.map(history => history.commits.length)).toEqual([0, 0])
  })

  it('does not adopt an existing single-stream dispatch as part of a new transaction', async () => {
    const result = await run(
      Effect.gen(function* () {
        const journal = yield* AtomicJournal
        const home = yield* todos.open('home')
        yield* home.dispatch(toggle('home', 'shared-click'))
        const [work] = pair()
        const attempt = yield* Effect.result(
          commitTogether('new transaction', [
            work,
            todos.member('home', toggle('home', 'shared-click', '7', 1)),
          ]),
        )
        return {
          attempt,
          saved: yield* histories(journal),
          receipt: yield* journal.findTransaction('new transaction'),
        }
      }).pipe(Effect.scoped, Effect.provide(stamp), Effect.provide(memoryLayer)),
    )
    expect(Result.getFailure(result.attempt)).toMatchObject({
      value: { dispatchId: 'shared-click' },
    })
    expect(result.saved.map(history => history.commits.length)).toEqual([0, 1])
    expect(Option.isNone(result.receipt)).toBe(true)
  })
})

describe('the successor event-sourced machine', () => {
  it('recovers every parent revision from events and from a checkpoint after closing SQLite', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'successor-journal-'))
    const file = join(directory, 'todos.db')
    const owner = 'work'
    try {
      const live = await run(
        Effect.gen(function* () {
          const first = yield* todos.open(owner)
          const second = yield* todos.open('home')
          const before = yield* first.read
          const work = yield* first.dispatch(toggle(owner, 'click'))
          const after = yield* first.checkpoint
          const foreign = yield* second.dispatch(toggle(owner, 'click'))
          const homeBefore = yield* second.read
          const home = yield* second.dispatch(toggle('home', 'another click', '7', 1))
          const homeAfter = yield* second.read
          yield* first.dispatch(toggle(owner, 'click again', '8', 1))
          const final = yield* first.read
          return { before, work, after, foreign, homeBefore, home, homeAfter, final }
        }).pipe(Effect.scoped, Effect.provide(stamp), Effect.provide(sqliteLayer(file))),
      )

      expect(live.work).toMatchObject({ kind: 'accepted', revision: 1 })
      expect(live.foreign).toMatchObject({
        kind: 'rejected',
        revision: 1,
        reason: { type: 'TodoMissing' },
      })
      expect(live.homeBefore.state).toEqual(initial('home'))
      expect(live.homeAfter.state).toMatchObject({ owner: 'home', remaining: 1 })
      expect(live.after.state).toMatchObject({ owner, remaining: 1 })
      expect(live.final.state).toMatchObject({ owner, remaining: 0 })
      const replayed = await run(
        Effect.gen(function* () {
          const journal = yield* Journal
          const stream = streamId('Todos', owner)
          const fromStart = yield* journal.read(stream, 'initial')
          const history = yield* journal.read(stream)
          const published = [live.before, live.after, live.final]
          return {
            all: published.map(({ revision }) =>
              todos.replay(owner, { ...fromStart, commits: fromStart.commits.slice(0, revision) }),
            ),
            checkpoint: todos.replay(owner, { ...history, commits: [] }),
            tail: todos.replay(owner, history),
            reopened: yield* (yield* todos.open(owner)).read,
          }
        }).pipe(Effect.scoped, Effect.provide(sqliteLayer(file))),
      )
      expect(replayed.all).toEqual([live.before, live.after, live.final])
      expect(replayed.checkpoint).toEqual(live.after)
      expect(replayed.tail).toEqual(live.final)
      expect(replayed.reopened).toEqual(live.final)
      expect(replayed.all.every(({ state }) => invariant(state))).toBe(true)

      const delivered: Array<string> = []
      const drain = Effect.gen(function* () {
        const ledger = yield* Durable.make({
          file,
          operation: Schema.String,
          snapshot: Schema.String,
          empty: () => '',
          reduce: (_snapshot, operation) => operation,
          opId,
          actorId: () => actorId('successor'),
        })
        yield* recover(streamId('Todos', owner), command =>
          ledger.runEffect(
            command.id,
            Effect.sync(() => {
              delivered.push(command.id)
              return command.fact.payload
            }),
          ),
        )
      }).pipe(Effect.scoped, Effect.provide(sqliteLayer(file)))
      await run(drain)
      expect(delivered).toEqual([
        JSON.stringify([streamId('Todos', owner), 'click', 0]),
        JSON.stringify([streamId('Todos', owner), 'click again', 0]),
      ])
      await run(drain)
      expect(delivered).toHaveLength(2)
    } finally {
      rmSync(file, { force: true })
      rmdirSync(directory)
    }
  })

  it('returns the saved outcome after losing an acknowledgement and never resolves inputs during replay', async () => {
    const owner = 'work'
    let allocations = 0
    const result = await run(
      Effect.gen(function* () {
        const underlying = yield* memory
        let lose = true
        const journal = {
          ...underlying,
          append: (stream, expected, commit) =>
            Effect.flatMap(underlying.append(stream, expected, commit), record => {
              if (!lose) return Effect.succeed(record)
              lose = false
              return Effect.fail(
                new JournalFailure({ operation: 'acknowledge', cause: 'connection lost' }),
              )
            }),
        } satisfies typeof underlying
        const machine = yield* Effect.provideService(todos.open(owner), Journal, journal)
        const request = toggle(owner, 'same click')
        const first = yield* Effect.result(machine.dispatch(request))
        const second = yield* machine.dispatch(request)
        const changedInput = yield* Effect.result(machine.dispatch(toggle(owner, request.id, '8')))
        const history = yield* underlying.read(streamId('Todos', owner))
        return { first, second, changedInput, history, replayed: todos.replay(owner, history) }
      }).pipe(
        Effect.scoped,
        Effect.provideService(Stamp, { allocate: Effect.sync(() => ++allocations) }),
      ),
    )
    expect(Result.getFailure(result.first)).toMatchObject({ value: { operation: 'acknowledge' } })
    expect(Result.getFailure(result.changedInput)).toMatchObject({
      value: { dispatchId: 'same click' },
    })
    expect(result.second).toMatchObject({
      kind: 'accepted',
      revision: 1,
      events: [{ payload: { stamp: 1 } }],
      commands: [{ id: expect.any(String) }],
    })
    expect(allocations).toBe(1)
    expect(result.history.commits).toHaveLength(1)
    expect(result.history.commits[0]?.disposition).toEqual({
      kind: 'accepted',
      events: result.second.kind === 'accepted' ? result.second.events : [],
      commands: result.second.kind === 'accepted' ? result.second.commands : [],
    })
    expect(result.replayed.state.remaining).toBe(1)
  })

  it('rejects a delayed input for a removed occurrence even if its key has been reused', async () => {
    const owner = 'work'
    const after = await run(
      Effect.gen(function* () {
        const machine = yield* todos.open(owner)
        const stale = toggle(owner, 'old click', '7', 2)
        yield* machine.dispatch({ ...stale, type: 'RemoveTodo', id: 'remove', expectedRevision: 0 })
        yield* machine.dispatch({
          type: 'AddTodo',
          id: 'add',
          expectedRevision: 1,
          input: { key: '7', label: 'Restock tea' },
        })
        return { delayed: yield* machine.dispatch(stale), after: yield* machine.read }
      }).pipe(Effect.scoped, Effect.provide(stamp), Effect.provide(memoryLayer)),
    )
    expect(after.delayed).toMatchObject({ kind: 'rejected', reason: { type: 'TodoMissing' } })
    expect(Option.getOrThrow(rows.get(after.after.state, '7'))).toMatchObject({
      incarnation: '3',
      model: { label: 'Restock tea', done: false },
    })
  })

  it('allows only one SQLite writer to commit against the same revision', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'successor-contention-'))
    const file = join(directory, 'todos.db')
    try {
      const result = await run(
        Effect.gen(function* () {
          const firstStore = Context.get(yield* Layer.build(sqliteLayer(file)), Journal)
          const secondStore = Context.get(yield* Layer.build(sqliteLayer(file)), Journal)
          const first = yield* Effect.provideService(todos.open('work'), Journal, firstStore)
          const second = yield* Effect.provideService(todos.open('work'), Journal, secondStore)
          const firstReady = yield* Deferred.make<void>()
          const secondReady = yield* Deferred.make<void>()
          const waitFor = (ready: typeof firstReady, other: typeof firstReady) =>
            Effect.andThen(Deferred.succeed(ready, undefined), Effect.as(Deferred.await(other), 10))
          const firstDispatch = Effect.provideService(
            first.dispatch(toggle('work', 'first')),
            Stamp,
            {
              allocate: waitFor(firstReady, secondReady),
            },
          )
          const secondDispatch = Effect.provideService(
            second.dispatch(toggle('work', 'second', '8')),
            Stamp,
            {
              allocate: waitFor(secondReady, firstReady),
            },
          )
          const outcomes = yield* Effect.all(
            [Effect.result(firstDispatch), Effect.result(secondDispatch)],
            { concurrency: 'unbounded' },
          )
          return { outcomes, history: yield* firstStore.read(streamId('Todos', 'work')) }
        }).pipe(Effect.scoped),
      )
      expect(result.outcomes.filter(Result.isSuccess)).toHaveLength(1)
      const rejected = result.outcomes.find(Result.isFailure)
      expect(rejected?.failure).toMatchObject({ expected: 0, actual: 1 })
      expect(result.history.commits.map(commit => commit.revision)).toEqual([1])
      expect(todos.replay('work', result.history).state.remaining).toBe(1)
    } finally {
      rmSync(file, { force: true })
      rmdirSync(directory)
    }
  })

  it('migrates an old event payload and refuses incompatible records, gaps, and stores', async () => {
    const input = toggle('work', 'legacy').input
    const old: WireCommit = {
      version: 1,
      dispatchId: 'legacy',
      revision: 1,
      input: { type: 'ToggleTodo', payload: input },
      disposition: {
        kind: 'accepted',
        events: [
          { type: 'TodoCompletionChanged', payload: { target: input.target, mark: true, seq: 42 } },
        ],
        commands: [],
      },
    }
    expect(todos.replay('work', { snapshot: Option.none(), commits: [old] }).state.remaining).toBe(
      1,
    )
    expect(() =>
      todos.replay('work', { snapshot: Option.none(), commits: [{ ...old, version: 3 }] }),
    ).toThrow()
    expect(() =>
      todos.replay('work', { snapshot: Option.none(), commits: [{ ...old, revision: 2 }] }),
    ).toThrow('Expected revision 1')
    const fail = await run(
      Effect.gen(function* () {
        const store = yield* memory
        return yield* Effect.result(
          Effect.provideService(todos.open('work'), Journal, {
            ...store,
            capabilities: { ...store.capabilities, isolation: 'eventual' },
          }),
        )
      }).pipe(Effect.scoped),
    )
    expect(Result.getFailure(fail)).toMatchObject({
      value: { refused: [{ rule: 'atomic event batch' }] },
    })
  })

  it('routes the same typed intent through a client with only its transport service', async () => {
    class Link extends Context.Service<Link, TransportOf<typeof todos, Error>>()(
      'successor/test/loopback',
    ) {}
    const received: Array<string> = []
    const state = await run(
      Effect.gen(function* () {
        const authority = serve(
          yield* todos.open('work'),
          Context.make(Stamp, { allocate: Effect.succeed(13) }),
        )
        const network: TransportOf<typeof todos, Error> = {
          read: authority.read,
          dispatch: request =>
            Effect.andThen(
              Effect.sync(() => {
                received.push(request.type)
              }),
              Effect.mapError(
                authority.dispatch(request),
                () => new Error('The authoritative Todo machine failed'),
              ),
            ),
        }
        const connected = client(Link)
        const input = toggle('work', 'terminal-space')
        const remote = yield* Effect.gen(function* () {
          yield* connected.dispatch(input)
          return yield* connected.read
        }).pipe(Effect.provideService(Link, network))
        return { remote, authority: yield* authority.read }
      }).pipe(Effect.scoped, Effect.provide(memoryLayer)),
    )
    expect(received).toEqual(['ToggleTodo'])
    expect(state.remote).toEqual(state.authority)
    expect(Option.getOrThrow(rows.get(state.authority.state, '7')).model.done).toBe(true)
  })
})
