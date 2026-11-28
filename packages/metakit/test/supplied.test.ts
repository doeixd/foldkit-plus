/**
 * What a transition cannot make it is given: `supplied` values bound once by
 * whoever runs the step. `Transition.add`, `Transition.opaque` and the
 * checker's entry for one goal about one step.
 */
import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Eq, Expr, Num, Ord, Path, Transition, Verdict } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import * as Prove from '@doeixd/metakit/prove'
import * as Sql from '@doeixd/metakit/sql'

const State = Schema.Struct({
  lastId: Schema.NullOr(Schema.String),
  lastAt: Schema.NullOr(Schema.Int),
  title: Schema.String,
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
type State = typeof State.Type

const Submitted = Transition.make({
  state: State,
  input: Schema.Struct({ title: Schema.String }),
  supplied: { id: Schema.String, now: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
  apply: ({ state, input, supplied }) => [
    Transition.set(state.lastId, supplied.id),
    Transition.set(state.lastAt, supplied.now),
    Transition.set(state.title, input.title),
    Transition.add(state.count, 1),
  ],
})

const empty: State = { lastId: null, lastAt: null, title: '', count: 0 }

describe('supplied values', () => {
  it('are passed to the step and read as any other slice', () => {
    const next = Result.getOrThrow(
      Transition.run(Submitted, empty, { title: 'milk' }, { id: 't1', now: 5 }),
    )
    expect(next).toEqual({ lastId: 't1', lastAt: 5, title: 'milk', count: 1 })
  })

  it('make a step a function of its arguments: the same values, the same state', () => {
    const run = () => Transition.run(Submitted, empty, { title: 'a' }, { id: 'x', now: 1 })
    expect(run()).toEqual(run())
  })

  it('are refused where their Schema refuses them', () => {
    const stepped = Transition.run(Submitted, empty, { title: 'a' }, { id: 'x', now: -1 })
    expect(Result.isFailure(stepped) && stepped.failure.reason).toContain('supplied')
  })

  it('are in the footprint, and a partial environment may leave them out', () => {
    const reads = Option.getOrThrow(Transition.footprint(Submitted).reads).map(Path.format)
    expect(reads).toEqual(expect.arrayContaining(['supplied.id', 'supplied.now']))
    expect(Verdict.isTrue(Transition.can(Submitted, { state: empty }))).toBe(true)
  })

  it('travel in the message a machine runs', () => {
    const machine = Machine.make({ state: State, transitions: { Submitted } })
    const [next] = machine.update(empty, {
      _tag: 'Submitted',
      input: { title: 'b' },
      supplied: { id: 't2', now: 9 },
    })
    expect([next.lastId, next.lastAt]).toEqual(['t2', 9])
  })

  it('are any value their Schema admits to a proof, and a replay passes the ones it found', async () => {
    const Capped = Transition.make({
      state: Schema.Struct({ at: Schema.Int.check(Schema.isLessThanOrEqualTo(100)) }),
      input: Schema.Struct({}),
      supplied: { now: Schema.Int },
      apply: ({ state, supplied }) => [Transition.set(state.at, supplied.now)],
    })
    const proof = await Effect.runPromise(
      Prove.transition(
        Schema.Struct({ at: Schema.Int.check(Schema.isLessThanOrEqualTo(100)) }),
        Capped,
      ),
    )
    expect(Verdict.isFalse(proof)).toBe(true)
  }, 30_000)
})

describe('Transition.add', () => {
  const Counter = Schema.Struct({ n: Schema.NullOr(Schema.Int) })
  const Bump = Transition.make({
    state: Counter,
    input: Schema.Struct({ by: Schema.Int }),
    apply: ({ state, input }) => [Transition.add(state.n, input.by)],
  })

  it('adds, gives null over null, and refuses past the safe range', () => {
    expect(Transition.run(Bump, { n: 2 }, { by: -3 })).toEqual(Result.succeed({ n: -1 }))
    expect(Transition.run(Bump, { n: null }, { by: 1 })).toEqual(Result.succeed({ n: null }))
    expect(Result.isFailure(Transition.run(Bump, { n: Number.MAX_SAFE_INTEGER }, { by: 1 }))).toBe(
      true,
    )
  })

  it('is a write of the sum, which the checker reads', () => {
    const Grow = Transition.make({
      state: State,
      input: Schema.Struct({ by: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
      apply: ({ state, input }) => [Transition.add(state.count, input.by)],
    })
    expect(Verdict.isTrue(Abstract.checkTransition(State, Grow))).toBe(true)
  })
})

describe('Transition.opaque', () => {
  const Route = Schema.Struct({ url: Schema.String, page: Schema.String, seen: Schema.Int })
  const UrlChanged = Transition.opaque({
    name: 'UrlChanged',
    state: Route,
    input: Schema.Struct({ url: Schema.String }),
    reads: ({ input }) => [input.url],
    writes: ({ state }) => [state.url, state.page],
    run: (state, input) => ({ ...state, url: input.url, page: input.url.split('/')[1] ?? '' }),
  })
  const route = { url: '/', page: '', seen: 0 }

  it('runs its body once and writes what it declares', () => {
    expect(Transition.run(UrlChanged, route, { url: '/about' })).toEqual(
      Result.succeed({ url: '/about', page: 'about', seen: 0 }),
    )
  })

  it('has the footprint it declares', () => {
    const footprint = Transition.footprint(UrlChanged)
    expect(Option.getOrThrow(footprint.reads).map(Path.format)).toEqual([
      'input.url',
      'state.url',
      'state.page',
    ])
    expect(footprint.writes.map(Path.format)).toEqual(['url', 'page'])
  })

  it('throws where its body writes a path it does not declare', () => {
    const Sloppy = Transition.opaque({
      name: 'Sloppy',
      state: Route,
      input: Schema.Struct({}),
      reads: () => [],
      writes: ({ state }) => [state.url],
      run: state => ({ ...state, seen: state.seen + 1 }),
    })
    expect(() => Transition.run(Sloppy, route, {})).toThrow(/wrote "seen"/)
  })

  it('leaves every rule over what it writes undecided, and SQL refuses it', () => {
    const Ruled = Route.pipe(Expr.refine(r => Eq.isNot(r.page, 'admin')))
    expect(Abstract.checkTransition(Ruled, UrlChanged)._tag).toBe('Unknown')
    const after = Path.forEnv({ state: Route, next: Route })
    const written = Eq.is(after.next.page, after.state.page)
    expect(Abstract.checkGoal(Route, UrlChanged, { goal: written })._tag).toBe('Unknown')
    const untouched = Eq.is(after.next.seen, after.state.seen)
    expect(Verdict.isTrue(Abstract.checkGoal(Route, UrlChanged, { goal: untouched }))).toBe(true)
    expect(Result.isFailure(Sql.toUpdate('routes', UrlChanged, { url: '/x' }))).toBe(true)
  })
})

describe('Abstract.checkGoal', () => {
  const Account = Schema.Struct({ balance: Schema.Int, hold: Schema.Int })
  const Deposit = Transition.make({
    state: Account,
    input: Schema.Struct({ amount: Schema.Int }),
    when: ({ input }) => Ord.gte(input.amount, 0),
    apply: ({ state, input }) => [Transition.add(state.balance, input.amount)],
  })
  const Amount = Schema.Struct({ amount: Schema.Int })
  const over = Path.forEnv({ state: Account, next: Account, input: Amount })
  const before = Path.forEnv({ state: Account, input: Amount })

  it('decides a goal over the state before and the state after', () => {
    const grows = Ord.gte(over.next.balance, over.state.balance)
    expect(Verdict.isTrue(Abstract.checkGoal(Account, Deposit, { goal: grows }))).toBe(true)
    const keeps = Eq.is(over.next.hold, over.state.hold)
    expect(Verdict.isTrue(Abstract.checkGoal(Account, Deposit, { goal: keeps }))).toBe(true)
    const strict = Ord.gt(over.next.balance, over.state.balance)
    expect(Verdict.isTrue(Abstract.checkGoal(Account, Deposit, { goal: strict }))).toBe(false)
  })

  it('takes what it is told to assume', () => {
    const strict = Ord.gt(over.next.balance, over.state.balance)
    const positive = Ord.gt(before.input.amount, 0)
    expect(
      Verdict.isTrue(Abstract.checkGoal(Account, Deposit, { assume: [positive], goal: strict })),
    ).toBe(true)
    const held = Ord.gte(over.next.hold, 0)
    expect(Verdict.isTrue(Abstract.checkGoal(Account, Deposit, { goal: held }))).toBe(false)
    expect(
      Verdict.isTrue(
        Abstract.checkGoal(Account, Deposit, {
          assume: [Ord.gte(before.state.hold, 0)],
          goal: held,
        }),
      ),
    ).toBe(true)
  })

  it('reads the supplied values, as any value their Schema admits', () => {
    const Stamped = Schema.Struct({ at: Schema.Int })
    const Stamp = Transition.make({
      state: Stamped,
      input: Schema.Struct({}),
      supplied: { now: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
      apply: ({ state, supplied }) => [Transition.set(state.at, supplied.now)],
    })
    const after = Path.forEnv({ next: Stamped })
    expect(
      Verdict.isTrue(Abstract.checkGoal(Stamped, Stamp, { goal: Ord.gte(after.next.at, 0) })),
    ).toBe(true)
    expect(
      Verdict.isTrue(Abstract.checkGoal(Stamped, Stamp, { goal: Ord.gte(after.next.at, 1) })),
    ).toBe(false)
  })
})
