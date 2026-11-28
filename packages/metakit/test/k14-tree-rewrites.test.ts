import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Eq from '../src/ops/eq.js'
import * as Expr from '../src/expr.js'
import * as Machine from '../src/machine.js'
import * as Node from '../src/node.js'
import * as Num from '../src/ops/num.js'
import * as Ord from '../src/ops/ord.js'
import { loadRows } from '../src/ops/rowsLoad.js'
import * as Path from '../src/path.js'
import * as Relation from '../src/relation.js'
import * as Transition from '../src/transition.js'

loadRows()

const Item = Schema.Struct({ active: Schema.Boolean, weight: Schema.Int })
const Child = Schema.Struct({
  count: Schema.Int,
  minWeight: Schema.Int,
  items: Schema.Array(Item),
})
type Child = typeof Child.Type

const Profile = Schema.Struct({ userId: Schema.String, active: Schema.Boolean })
const UserProfile = Relation.make('Profile.user', Profile, { cardinality: 'one' })

const Bump = Transition.make({
  state: Child,
  input: Schema.Struct({}),
  apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
})

const ChildMachine = Machine.make({
  state: Child,
  transitions: { Bump },
})

describe('K14: tree rewrites preserve metadata, respect binders, and refuse Option lifts', () => {
  it('Node.mapRows preserves Related.cardinality across rewrites and Transition.lift', () => {
    const related = Node.Rows({
      fold: 'count',
      over: Node.RowsOver.Related({
        of: Node.Path({ segments: ['state'], ast: Option.none() }),
        relation: 'Profile.user',
        cardinality: 'one',
      }),
      where: Option.none(),
      value: Option.none(),
      set: [],
    })

    const mapped = Node.mapRows(
      related,
      node => node,
      node => node,
    )
    expect(
      Node.RowsOver.$match(mapped.over, {
        List: () => undefined,
        Related: ({ cardinality }) => cardinality,
      }),
    ).toBe('one')

    const optionalRelated = Node.Rows({
      fold: 'any',
      over: Node.RowsOver.Related({
        of: Node.Path({ segments: ['state'], ast: Option.none() }),
        relation: 'Profile.user',
        cardinality: 'optional',
      }),
      where: Option.none(),
      value: Option.none(),
      set: [],
    })
    const mappedOptional = Node.mapRows(
      optionalRelated,
      node => node,
      node => node,
    )
    expect(
      Node.RowsOver.$match(mappedOptional.over, {
        List: () => undefined,
        Related: ({ cardinality }) => cardinality,
      }),
    ).toBe('optional')

    const WithRelGuard = Transition.make({
      state: Child,
      input: Schema.Struct({}),
      when: ({ state }) => Eq.is(Relation.count(state, UserProfile), 1),
      apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
    })
    const Outer = Schema.Struct({ child: Child })
    const lifted = Transition.lift(Path.from(Outer).child, WithRelGuard)

    const findRelatedCardinality = (node: Node.Node): string | undefined =>
      Node.$match(node, {
        Lit: () => undefined,
        Path: () => undefined,
        Opaque: () => undefined,
        Call: ({ args }) => args.map(findRelatedCardinality).find(c => c !== undefined),
        If: ({ cond, then: t, otherwise }) =>
          findRelatedCardinality(cond) ??
          findRelatedCardinality(t) ??
          findRelatedCardinality(otherwise),
        Match: ({ on, cases, otherwise }) =>
          findRelatedCardinality(on) ??
          cases.map(([, b]) => findRelatedCardinality(b)).find(c => c !== undefined) ??
          Option.match(otherwise, { onNone: () => undefined, onSome: findRelatedCardinality }),
        Rows: rows =>
          Node.RowsOver.$match(rows.over, {
            List: ({ list }) => findRelatedCardinality(list),
            Related: ({ cardinality }) => cardinality,
          }),
      })

    expect(findRelatedCardinality(lifted.when.node)).toBe('one')
  })

  it('Transition.lift does not rewrite paths bound by a Rows binder named "state"', () => {
    const anyActiveWithStateBinder = Expr.fromNode<
      Transition.TransitionEnv<Child, Record<string, never>>,
      boolean | null
    >(
      Node.Rows({
        fold: 'any',
        over: Node.RowsOver.List({
          list: Node.Path({ segments: ['state', 'items'], ast: Option.none() }),
        }),
        where: Option.some(Node.Path({ segments: ['state', 'active'], ast: Option.none() })),
        value: Option.none(),
        set: [],
        each: 'state',
      }),
    )

    const GuardedByStateBinder = Transition.make({
      state: Child,
      input: Schema.Struct({}),
      when: () => anyActiveWithStateBinder,
      apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
    })

    const Outer = Schema.Struct({ child: Child })
    const lifted = Transition.lift(Path.from(Outer).child, GuardedByStateBinder)

    const next = Transition.run(
      lifted,
      { child: { count: 0, minWeight: 0, items: [{ active: true, weight: 5 }] } },
      {},
    )
    expect(next).toEqual(
      Result.succeed({ child: { count: 1, minWeight: 0, items: [{ active: true, weight: 5 }] } }),
    )

    const refused = Transition.run(
      lifted,
      { child: { count: 0, minWeight: 0, items: [{ active: false, weight: 5 }] } },
      {},
    )
    expect(Result.isFailure(refused)).toBe(true)
  })

  it('Transition.lift still rewrites free "state" reads inside a Rows body with another binder', () => {
    const anyHeavy = Expr.fromNode<
      Transition.TransitionEnv<Child, Record<string, never>>,
      boolean | null
    >(
      Node.Rows({
        fold: 'any',
        over: Node.RowsOver.List({
          list: Node.Path({ segments: ['state', 'items'], ast: Option.none() }),
        }),
        where: Option.some(
          Ord.gte(
            Expr.fromNode<unknown, number>(
              Node.Path({ segments: [Node.EACH, 'weight'], ast: Option.none() }),
            ),
            Expr.fromNode<unknown, number>(
              Node.Path({ segments: ['state', 'minWeight'], ast: Option.none() }),
            ),
          ).node,
        ),
        value: Option.none(),
        set: [],
      }),
    )

    const Guarded = Transition.make({
      state: Child,
      input: Schema.Struct({}),
      when: () => anyHeavy,
      apply: ({ state }) => [Transition.set(state.count, Num.add(state.count, 1))],
    })

    const Outer = Schema.Struct({ child: Child })
    const lifted = Transition.lift(Path.from(Outer).child, Guarded)

    expect(
      Result.isSuccess(
        Transition.run(
          lifted,
          { child: { count: 0, minWeight: 5, items: [{ active: false, weight: 5 }] } },
          {},
        ),
      ),
    ).toBe(true)
    expect(
      Result.isFailure(
        Transition.run(
          lifted,
          { child: { count: 0, minWeight: 10, items: [{ active: false, weight: 5 }] } },
          {},
        ),
      ),
    ).toBe(true)
  })

  it('Transition.lift and Machine.lift throw at definition time on an Option-held child path', () => {
    const OptOuter = Schema.Struct({ child: Schema.Option(Child) })
    const $opt = Path.from(OptOuter)
    const optPath = Path.make<typeof OptOuter.Type, Child>(['child'], $opt.child.ast)

    expect(() => Transition.lift(optPath, Bump)).toThrow(/nullable/i)
    expect(() => Machine.lift($opt.child, ChildMachine)).toThrow(/nullable/i)

    const OptFromNullOuter = Schema.Struct({ child: Schema.OptionFromNullOr(Child) })
    const $optNull = Path.from(OptFromNullOuter)
    const optNullPath = Path.make<typeof OptFromNullOuter.Type, Child>(
      ['child'],
      $optNull.child.ast,
    )

    expect(() => Transition.lift(optNullPath, Bump)).toThrow(/nullable/i)
    expect(() => Machine.lift($optNull.child, ChildMachine)).toThrow(/nullable/i)

    const OptionalOptOuter = Schema.Struct({ child: Schema.optional(Schema.Option(Child)) })
    const $optionalOpt = Path.from(OptionalOptOuter)
    expect(() => Machine.lift($optionalOpt.child, ChildMachine)).toThrow(/nullable/i)

    const EmptyMachine = Machine.make({ state: Child, transitions: {} })
    expect(() => Machine.lift($opt.child, EmptyMachine)).toThrow(/nullable/i)

    // Nullable (NullOr) remains allowed
    const NullableOuter = Schema.Struct({ child: Schema.NullOr(Child) })
    const $nullable = Path.from(NullableOuter)
    expect(() => Machine.lift($nullable.child, ChildMachine)).not.toThrow()
  })
})
