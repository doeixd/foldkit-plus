/**
 * The `Rows` node over a list and over related rows: what every reader gives
 * for each fold, over the awkward lists (empty, null, holding null, a
 * duplicate id, a test that is null or refused), and the list operations a
 * write makes (`arr.append`, `arr.include`, `arr.exclude`).
 */
import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Abstract,
  Arr,
  Bool,
  Eq,
  Expr,
  Node,
  Num,
  Ord,
  Path,
  Str,
  Transition,
  Verdict,
} from 'metakit'
import * as Relation from 'metakit/relation'
import * as Sql from 'metakit/sql'

const Item = Schema.Struct({
  id: Schema.String,
  done: Schema.NullOr(Schema.Boolean),
  n: Schema.NullOr(Schema.Int),
  title: Schema.String,
})
type Item = typeof Item.Type

const State = Schema.Struct({ items: Schema.NullOr(Schema.Array(Item)), limit: Schema.Int })
type State = typeof State.Type

const { state } = Path.forEnv({ state: State })
type Env = { readonly state: State }

const item = (id: string, done: boolean | null, n: number | null, title = id): Item => ({
  id,
  done,
  n,
  title,
})

const at = (items: ReadonlyArray<Item> | null): Env => ({ state: { items, limit: 3 } })

const value = (expr: Expr.Expr<Env, unknown>, env: Env): unknown =>
  Result.match(Expr.evalResult(expr, env), {
    onSuccess: found => found,
    onFailure: refusal => refusal.reason,
  })

const listed = [item('a', true, 2), item('b', null, null), item('c', false, -5)]

describe('a fold over a list, evaluated', () => {
  it.each([
    ['any', Arr.any(state.items, each => each.done), [true, false, null]],
    ['every', Arr.every(state.items, each => each.done), [false, true, null]],
    ['count', Arr.count(state.items, each => each.done), [1, 0, null]],
    ['sum', Arr.sum(state.items, each => each.n), [-3, 0, null]],
    ['min', Arr.min(state.items, each => each.n), [-5, null, null]],
    ['max', Arr.max(state.items, each => each.n), [2, null, null]],
    [
      'find',
      Arr.find(
        state.items,
        each => Eq.is(each.id, 'c'),
        each => each.n,
      ),
      [-5, null, null],
    ],
  ] as const)('%s over some, none and a null list', (_, expr, [some, none, nothing]) => {
    expect(value(expr, at(listed))).toBe(some)
    expect(value(expr, at([]))).toBe(none)
    expect(value(expr, at(null))).toBe(nothing)
  })

  it('a test that is null does not pass: every is false, count skips it, keep leaves it out', () => {
    const nulls = [item('a', null, 1), item('b', true, 1)]
    expect(
      value(
        Arr.every(state.items, each => each.done),
        at(nulls),
      ),
    ).toBe(false)
    expect(
      value(
        Arr.count(state.items, each => each.done),
        at(nulls),
      ),
    ).toBe(1)
    expect(
      value(
        Arr.keep(state.items, each => each.done),
        at(nulls),
      ),
    ).toEqual([nulls[1]])
  })

  it('find gives the first that passes, and the element itself without a value', () => {
    const twice = [item('a', true, 1), item('a', true, 2)]
    expect(
      value(
        Arr.find(state.items, each => Eq.is(each.id, 'a')),
        at(twice),
      ),
    ).toBe(twice[0])
    expect(
      value(
        Arr.find(state.items, each => Eq.is(each.id, 'z')),
        at(twice),
      ),
    ).toBe(null)
  })

  it('keep gives back the list it was given where every element passes', () => {
    const all = [item('a', true, 1), item('b', true, 2)]
    expect(
      value(
        Arr.keep(state.items, each => each.done),
        at(all),
      ),
    ).toBe(all)
  })

  it('an integer total is exact, and refused past the safe range', () => {
    const max = Number.MAX_SAFE_INTEGER
    const around = [item('a', true, max), item('b', true, 1), item('c', true, -1)]
    expect(
      value(
        Arr.sum(state.items, each => each.n),
        at(around),
      ),
    ).toBe(max)
    const past = [item('a', true, max), item('b', true, 1)]
    expect(
      value(
        Arr.sum(state.items, each => each.n),
        at(past),
      ),
    ).toBe('unsafe-integer')
  })

  it('a refusal is a failure, but any is true once one passes and every false once one fails', () => {
    const refusing = Arr.any(state.items, each => Str.startsWith(each.title, 'x'))
    const nul = [item('a', true, 1, 'a\u0000'), item('b', true, 1, 'xb')]
    expect(value(refusing, at(nul))).toBe(true)
    expect(value(refusing, at([nul[0]!]))).toBe('unportable')
    const failing = Arr.every(state.items, each => Str.startsWith(each.title, 'x'))
    expect(value(failing, at([nul[0]!, item('c', true, 1, 'c')]))).toBe(false)
    expect(
      value(
        Arr.count(state.items, each => Str.startsWith(each.title, 'x')),
        at(nul),
      ),
    ).toBe('unportable')
  })

  it('a body holds no second Rows and no opaque term', () => {
    expect(() =>
      Arr.any(state.items, each => Arr.any(state.items, other => Eq.is(other.id, each.id))),
    ).toThrow('no second Rows')
    expect(() =>
      Arr.any(state.items, () => Expr.opaque({ name: 'secret', reads: [] }, () => true)),
    ).toThrow('no opaque term')
  })
})

describe('a fold over a list, read statically', () => {
  it('reads each field its body reads under every element, and the list where it reads none', () => {
    const fold = Arr.count(state.items, each => Bool.and(each.done, Ord.gt(each.n, state.limit)))
    expect(Expr.reads(fold)).toEqual(
      Option.some([
        ['state', 'items', '*', 'done'],
        ['state', 'items', '*', 'n'],
        ['state', 'limit'],
      ]),
    )
    expect(Expr.reads(Arr.find(state.items, () => true))).toEqual(Option.some([['state', 'items']]))
  })

  it('shows the fold, its source and its body', () => {
    expect(
      Expr.show(
        Arr.sum(
          state.items,
          each => each.n,
          each => each.done,
        ),
      ),
    ).toBe('sum(state.items where each.done of each.n)')
  })

  it('judge is Unknown while the list is not held, and folds it once it is', () => {
    const any = Arr.any(state.items, each => each.done)
    expect(Verdict.isUnknown(Expr.judge(any, {}))).toBe(true)
    expect(Verdict.isTrue(Expr.judge(any, at(listed)))).toBe(true)
  })

  it('judge decides any once a held element passes, though another answer is unknown', () => {
    const Env2 = { state: State, input: Schema.Struct({ id: Schema.String }) }
    const any = Expr.in(Env2, ({ state: s, input }) =>
      Arr.any(s.items, each => Bool.or(each.done, Eq.is(each.id, input.id))),
    )
    expect(
      Verdict.isTrue(Expr.judge(any, { state: { items: [item('a', true, 1)], limit: 1 } })),
    ).toBe(true)
    expect(
      Verdict.isUnknown(Expr.judge(any, { state: { items: [item('a', false, 1)], limit: 1 } })),
    ).toBe(true)
  })

  it('SQL refuses a list in a column, naming the fold', () => {
    const refused = Sql.toWhere(
      Arr.any(state.items, each => each.done),
      { rowPrefix: ['state'] },
    )
    expect(Result.isFailure(refused) && refused.failure.reason).toContain('rows.any over a list')
  })

  it('the checker leaves a fold Unknown, naming it', () => {
    const items = Path.forSchema(State).items
    const verdict = Abstract.checkInvariant(
      State,
      Arr.every(items, each => Eq.is(each.done, true)),
    )
    expect(Verdict.isUnknown(verdict) && verdict.reason).toContain('rows.every')
  })
})

describe('the list operations a write makes', () => {
  it.each([
    ['include keeps the order', 'arr.include', ['a', 'c'], 'b', ['a', 'b', 'c']],
    ['include of a value there gives the list back', 'arr.include', ['a', 'c'], 'c', 'same'],
    ['exclude takes it out', 'arr.exclude', ['a', 'b'], 'a', ['b']],
    ['exclude of a value not there gives the list back', 'arr.exclude', ['a'], 'z', 'same'],
    ['a null value changes nothing', 'arr.include', ['a'], null, 'same'],
    ['text holding a NUL is refused', 'arr.include', ['a'], 'b\u0000', 'unportable'],
  ] as const)('%s', (_, id, held, added, expected) => {
    const op = id === 'arr.include' ? Arr.includeOp : Arr.excludeOp
    const list = [...held]
    const result = Node.apply(op, [list, added])
    if (expected === 'same') expect(result).toBe(list)
    else if (expected === 'unportable')
      expect(Node.isRefusal(result) && result.reason).toBe(expected)
    else expect(result).toEqual(expected)
  })

  it('include orders text by code point, numbers by value, and refuses a mix', () => {
    expect(Node.apply(Arr.includeOp, [['￿'], '😀'])).toEqual(['￿', '😀'])
    expect(Node.apply(Arr.includeOp, [[1, 10], 2])).toEqual([1, 2, 10])
    const mixed = Node.apply(Arr.includeOp, [[1], 'a'])
    expect(Node.isRefusal(mixed) && mixed.reason).toBe('ill-typed')
  })

  it('append adds the element, or the record of fields to values, and null of a null list', () => {
    expect(Node.apply(Arr.appendOp, [['a'], null])).toEqual(['a', null])
    const fields = [
      ['id', false],
      ['note', true],
    ]
    expect(Node.apply(Arr.appendOp, [[], fields, 'x', null])).toEqual([
      { id: 'x', note: Option.none() },
    ])
    expect(Node.apply(Arr.appendOp, [[], fields, 'x', 'n'])).toEqual([
      { id: 'x', note: Option.some('n') },
    ])
    expect(Node.apply(Arr.appendOp, [null, 'a'])).toBe(null)
  })
})

describe('the checker knows a list length a write leaves', () => {
  const Todos = Schema.Struct({
    todos: Schema.Array(Item),
    cap: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 })),
  })
  const Added = Transition.make({
    state: Todos,
    input: Item,
    when: ({ state: s }) => Ord.lt(Arr.count(s.todos), 10),
    apply: ({ state: s, input }) => [Transition.append(s.todos, input)],
  })
  const Inserted = Transition.make({
    state: Todos,
    input: Item,
    apply: ({ state: s, input }) => [Transition.insert(s.todos, input)],
  })
  const Cleared = Transition.make({
    state: Todos,
    input: Schema.Struct({}),
    apply: ({ state: s }) => [Transition.removeWhere(s.todos, each => each.done)],
  })
  const Toggled = Transition.make({
    state: Todos,
    input: Schema.Struct({ id: Schema.String }),
    apply: ({ state: s, input }) => [
      Transition.patch(s.todos, input.id, each => ({ done: Bool.not(each.done) })),
    ],
  })
  /** The growth of the list, `after - before`, as the goal reads it. */
  const growth = Expr.in({ state: Todos, next: Todos }, ({ state: s, next }) =>
    Num.sub(Arr.count(next.todos), Arr.count(s.todos)),
  )

  it.each([
    ['one more after append', () => Abstract.checkGoal(Todos, Added, { goal: Eq.is(growth, 1) })],
    [
      'the same or one more after insert',
      () => Abstract.checkGoal(Todos, Inserted, { goal: Ord.between(growth, 0, 1) }),
    ],
    ['no more after keep', () => Abstract.checkGoal(Todos, Cleared, { goal: Ord.lte(growth, 0) })],
    ['the same after patch', () => Abstract.checkGoal(Todos, Toggled, { goal: Eq.is(growth, 0) })],
  ] as const)('%s', (_, decide) => {
    expect(Verdict.isTrue(decide())).toBe(true)
  })

  it('does not claim one more after insert, where the key may be there', () => {
    const decided = Abstract.checkGoal(Todos, Inserted, {
      goal: Expr.in({ state: Todos, next: Todos }, ({ state: s, next }) =>
        Eq.is(Arr.count(next.todos), Num.add(Arr.count(s.todos), 1)),
      ),
    })
    expect(Verdict.isTrue(decided)).toBe(false)
  })
})

describe('rows related to a row', () => {
  const Owner = Schema.Struct({ id: Schema.String })
  const Line = Schema.Struct({ id: Schema.String, amount: Schema.Int, open: Schema.Boolean })
  const Lines = Relation.make('Line.owner', Line)
  const Input = Schema.Struct({ least: Schema.Int })
  const { row, input } = Path.forEnv({ row: Owner, input: Input })
  type RelatedEnv = { readonly row: typeof Owner.Type; readonly input: typeof Input.Type }
  const holding = (rows: ReadonlyArray<typeof Line.Type>, whole: boolean) => ({
    row: { id: 'o', '<Line.owner': { rows, whole } },
    input: { least: 2 },
  })
  const lines = [
    { id: 'l1', amount: 5, open: true },
    { id: 'l2', amount: -1, open: false },
  ]

  it.each([
    ['any', Relation.any(row, Lines, each => each.open), true],
    ['every', Relation.every(row, Lines, each => each.open), false],
    ['count', Relation.count(row, Lines, each => Ord.gte(each.amount, input.least)), 1],
    ['sum', Relation.sum(row, Lines, each => each.amount), 4],
    ['min', Relation.min(row, Lines, each => each.amount), -1],
    [
      'max',
      Relation.max(
        row,
        Lines,
        each => each.amount,
        each => each.open,
      ),
      5,
    ],
  ] as const)('%s folds the rows held under the row', (_, expr, expected) => {
    const folded = (over: Expr.Expr<RelatedEnv, unknown>) =>
      Expr.evaluate(over, holding(lines, true))
    expect(folded(expr)).toBe(expected)
  })

  it('evaluation refuses rows held only in part; judge answers what they decide', () => {
    const partial = holding([lines[0]!], false)
    const any = Relation.any(row, Lines, each => each.open)
    const every = Relation.every(row, Lines, each => each.open)
    expect(Result.isFailure(Expr.evalResult(any, partial))).toBe(true)
    expect(Verdict.isTrue(Expr.judge(any, partial))).toBe(true)
    expect(Verdict.isUnknown(Expr.judge(every, partial))).toBe(true)
    expect(Verdict.isFalse(Expr.judge(every, holding([lines[1]!], false)))).toBe(true)
    expect(Verdict.isUnknown(Expr.judge(any, holding([lines[1]!], false)))).toBe(true)
  })

  it('reads the row, the relation and the body under every related row', () => {
    expect(
      Expr.reads(Relation.count(row, Lines, each => Ord.gte(each.amount, input.least))),
    ).toEqual(
      Option.some([
        ['row', '<Line.owner', '*', 'amount'],
        ['input', 'least'],
      ]),
    )
  })

  it('refuses a body that reads the row it is asked of', () => {
    expect(() => Relation.any(row, Lines, each => Eq.is(each.id, row.id))).toThrow(
      'in the slice of the row it is asked of',
    )
  })
})
