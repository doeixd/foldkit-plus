import { Effect, Option, Result, Schema } from 'effect'
import { expect, it } from 'vitest'
import { Bool, Eq, Expr, Num, Transition, Verdict } from 'metakit'
import * as Machine from 'metakit/machine'
import * as Prove from 'metakit/prove'
import { memoryLayer } from 'foldkit-successor/journal'
import { uncovered } from 'foldkit-successor/surface'
import { prepareToggle, requireToggle } from './fixtures/todoProof.js'
import {
  completionDelta,
  freshCount,
  initial,
  invariant,
  invertedDelta,
  Stamp,
  target,
  todos,
  toggle,
} from './fixtures/todos.js'
import { reachability, todoSurface } from './fixtures/todoSurface.js'

it('pins the finite composed commit, then replays the broken parent fold through the same dispatcher', () => {
  const { report } = prepareToggle()
  requireToggle(report)
  expect(report).toMatchObject({
    transition: 'Todos.rows.TodoRow.Toggle',
    domain: 'keys 7 and 8, each absent, incomplete, or complete',
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
  const unavailable = {
    ...report,
    verdict: Verdict.Unknown('Composition needs an external operation'),
  }
  expect(() => requireToggle(unavailable)).toThrow('Pinned obligation')
  expect(
    Result.getOrThrow(prepareToggle(invertedDelta, () => unavailable).toggle(before, key)).state
      .remaining,
  ).toBe(freshCount(after))
})

it('uses MetaKit proof pins on the scalar count law and reports a solver verdict', async () => {
  const State = Schema.Struct({
    done: Schema.Boolean,
    others: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
    remaining: Schema.Int,
  }).pipe(
    Expr.refine(({ done, others, remaining }) =>
      Eq.equals(remaining, Num.add(others, Expr.when(done, { then: 0, else: 1 }))),
    ),
  )
  const check = (sign: 1 | -1) =>
    Transition.make({
      state: State,
      input: Schema.Undefined,
      apply: ({ state }) => [
        Transition.set(state.done, Bool.not(state.done)),
        Transition.add(state.remaining, completionDelta(Bool.not(state.done), sign)),
      ],
    })
  const prove = (sign: 1 | -1) =>
    Effect.runPromise(
      Effect.provide(
        Prove.machine(Machine.make({ state: State, transitions: { Toggle: check(sign) } }), {
          pin: ['Toggle'],
        }),
        Prove.z3SolverLayer,
      ),
    )
  const good = await prove(1)
  const bad = await prove(-1)
  expect(good.format()).toContain('PROVED')
  expect(good.entries[0]).toMatchObject({ tag: 'Toggle', status: 'proved', pinned: true })
  expect(bad.entries[0]).toMatchObject({ tag: 'Toggle', status: 'refuted', pinBroken: true })
  expect(Option.isSome(bad.entries[0]!.witness)).toBe(true)
}, 25_000)

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
