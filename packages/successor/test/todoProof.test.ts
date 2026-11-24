import { Effect, Option, Result, Schema } from 'effect'
import { expect, it } from 'vitest'
import { Eq, Expr, Node, Num, Transition, Verdict } from 'metakit'
import { wrap } from 'metakit/build'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import { memoryLayer } from 'foldkit-successor/journal'
import { uncovered } from 'foldkit-successor/surface'
import { keySegment } from 'foldkit-successor/block'
import { countTerms, prepareToggle, requireToggle } from './fixtures/todoProof.js'
import {
  countedToggle,
  freshCount,
  initial,
  invariant,
  invertedDelta,
  Model,
  Stamp,
  target,
  todos,
  toggle,
} from './fixtures/todos.js'
import { reachability, todoSurface } from './fixtures/todoSurface.js'

it('pins the keyed count law and replays a broken parent fold through the same dispatcher', () => {
  const { report } = prepareToggle()
  requireToggle(report)
  expect(report).toMatchObject({
    transition: 'Todos.rows.TodoRow.Toggle',
    domain: 'any key in a valid list of at most Number.MAX_SAFE_INTEGER rows',
    checked: 12,
    verdict: { _tag: 'True', evidence: { value: { tier: 'concrete' } } },
  })
  const failedPlan = prepareToggle(invertedDelta)
  const broken = failedPlan.report
  expect(() => requireToggle(broken)).toThrow('Pinned obligation Todos.rows.TodoRow.Toggle')
  if (!Verdict.isFalse(broken.verdict)) throw new Error('Expected a counterexample')
  const { before, key, after } = Option.getOrThrow(broken.verdict.witness)
  expect(invariant(before)).toBe(true)
  expect(
    Result.getOrThrow(toggle(before, target(before, key), 'incremental', invertedDelta)).state,
  ).toEqual(after)
  expect(invariant(after)).toBe(false)
  expect(Result.getOrThrow(failedPlan.toggle(before, key)).state.remaining).toBe(freshCount(after))
  const unsupported = Transition.make({
    state: Model,
    input: Schema.Boolean,
    apply: ({ state }) => [Transition.set(state.remaining, 0)],
  })
  const fallback = prepareToggle(unsupported)
  expect(Verdict.isUnknown(fallback.report.verdict)).toBe(true)
  expect(() => requireToggle(fallback.report)).toThrow('Pinned obligation')
  expect(invariant(Result.getOrThrow(fallback.toggle(before, key)).state)).toBe(true)
})

it('pins the actual composed equations over every supported untouched-row count', async () => {
  const State = Schema.Struct({
    done: Schema.Boolean,
    others: Schema.Int.check(
      Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 }),
    ),
    remaining: Schema.Int,
  }).pipe(
    Expr.refine(({ done, others, remaining }) =>
      Eq.equals(remaining, Num.add(others, Expr.when(done, { then: 0, else: 1 }))),
    ),
  )
  const check = (delta: typeof countedToggle) => {
    const terms = Option.getOrThrow(countTerms(delta))
    return Transition.make({
      state: State,
      input: Schema.Undefined,
      apply: ({ state }) => {
        const nextDone = Node.substitutePaths(terms.nextDone, path =>
          path[0] === 'state' && path[1] === 'done' ? Option.some(state.done.node) : Option.none(),
        )
        const nextRemaining = Node.substitutePaths(terms.nextRemaining, path => {
          if (path[0] === 'input') return Option.some(nextDone)
          if (path[0] === 'state' && path[1] === 'remaining')
            return Option.some(state.remaining.node)
          return Option.none()
        })
        return [
          Transition.set(state.done, wrap(nextDone)),
          Transition.set(state.remaining, wrap(nextRemaining)),
        ]
      },
    })
  }
  const prove = (delta: typeof countedToggle) =>
    Effect.runPromise(
      Effect.provide(
        Prove.machine(Machine.make({ state: State, transitions: { Toggle: check(delta) } }), {
          pin: ['Toggle'],
        }),
        Prove.z3SolverLayer,
      ),
    )
  const good = await prove(countedToggle)
  const bad = await prove(invertedDelta)
  expect(good.format()).toContain('PROVED')
  expect(good.entries[0]).toMatchObject({ tag: 'Toggle', status: 'proved', pinned: true })
  expect(bad.entries[0]).toMatchObject({ tag: 'Toggle', status: 'refuted', pinBroken: true })
  expect(Option.isSome(bad.entries[0]!.witness)).toBe(true)
}, 25_000)

it('uses the incremental equation for arbitrary keys without evaluating sibling contributions', () => {
  const base = initial('work')
  const occurrences = Object.fromEntries(
    Array.from({ length: 150 }, (_, i) => [
      keySegment(`row-${i}`),
      { incarnation: String(i), model: { label: String(i), done: i % 2 === 0 } },
    ]),
  )
  let siblingReads = 0
  const rows = {
    ...occurrences,
    [keySegment('constructor')]: {
      incarnation: 'new',
      model: { label: 'Constructor', done: false },
    },
    [keySegment('*')]: {
      incarnation: 'other',
      model: {
        label: 'Wildcard',
        get done() {
          siblingReads++
          return true
        },
      },
    },
  }
  const before = { ...base, rows, remaining: 76 }
  const machine = prepareToggle()
  const completed = Result.getOrThrow(machine.toggle(before, 'constructor')).state
  const toggledBack = Result.getOrThrow(machine.toggle(completed, 'constructor')).state
  expect(siblingReads).toBe(0)
  expect(completed.remaining).toBe(75)
  expect(toggledBack.remaining).toBe(76)
  expect(invariant(completed) && invariant(toggledBack)).toBe(true)
})

it('checks resume read coverage for the binding and every admitted intent', () => {
  const graph = todoSurface(['7', '8']).graph
  const local = reachability({ ...initial('work'), draft: '' })
  expect(uncovered(graph, [['owner'], ['rows'], ['remaining'], ['draft']], local)).toEqual([])
  expect(uncovered(graph, [['owner'], ['remaining'], ['draft'], ['rows', '"7"']], local)).toEqual([
    'todo:8:done',
    'ClearCompleted',
    'ToggleTodo(7)',
    'RemoveTodo(7)',
    'ToggleTodo(8)',
    'RemoveTodo(8)',
  ])
})

it('agrees with a fresh fold after adds, two directions of toggle, and removals', async () => {
  const states = await Effect.runPromise(
    Effect.gen(function* () {
      const machine = yield* todos.open('work')
      const start = yield* machine.read
      yield* machine.dispatch({
        id: 'one',
        expectedRevision: 0,
        type: 'AddTodo',
        input: { key: '*', label: 'Milk' },
      })
      const added = yield* machine.read
      const request = (revision: number, id: string) =>
        ({
          id,
          expectedRevision: revision,
          type: 'ToggleTodo',
          input: { target: target(added.state, '*') },
        }) as const
      yield* machine.dispatch(request(1, 'two'))
      const completed = yield* machine.read
      yield* machine.dispatch(request(2, 'three'))
      const incomplete = yield* machine.read
      yield* machine.dispatch({ ...request(3, 'four'), type: 'RemoveTodo' })
      return [start, added, completed, incomplete, yield* machine.read]
    }).pipe(
      Effect.scoped,
      Effect.provideService(Stamp, { allocate: Effect.succeed(31) }),
      Effect.provide(memoryLayer),
    ),
  )
  expect(states.map(({ state }) => state.remaining)).toEqual([2, 3, 2, 3, 2])
  expect(states.every(({ state }) => invariant(state))).toBe(true)
})
