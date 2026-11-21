/**
 * The ways of writing a list, the records a step emits, and
 * `Transition.commutes`: each rule of the note's six, and a seeded run of
 * both orders of every pair it calls commuting.
 */
import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Arr, Bool, Eq, Expr, Num, Ord, Path, Str, Transition, Verdict } from 'metakit'
import * as Machine from 'metakit/machine'

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
  note: Schema.OptionFromNullOr(Schema.String),
})
type Todo = typeof Todo.Type

const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  tags: Schema.Array(Schema.String),
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  loose: Schema.Int,
  ratio: Schema.Finite,
  title: Schema.String,
})
type Model = typeof Model.Type

const ById = Schema.Struct({ id: Schema.String })
const None = Schema.Struct({})

const todo = (id: string, completed = false, title = id): Todo => ({
  id,
  title,
  completed,
  note: Option.none(),
})

const model = (todos: ReadonlyArray<Todo>, tags: ReadonlyArray<string> = []): Model => ({
  todos,
  tags,
  count: 3,
  loose: 0,
  ratio: 0.5,
  title: 't',
})

const Toggled = Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [
    Transition.patch(state.todos, input.id, todo => ({ completed: Bool.not(todo.completed) })),
  ],
})
const Renamed = Transition.make({
  state: Model,
  input: Schema.Struct({ id: Schema.String, title: Schema.String }),
  apply: ({ state, input }) => [
    Transition.patch(state.todos, input.id, () => ({ title: input.title })),
  ],
})
const Noted = Transition.make({
  state: Model,
  input: Schema.Struct({ id: Schema.String, note: Schema.NullOr(Schema.String) }),
  apply: ({ state, input }) => [
    Transition.patch(state.todos, input.id, () => ({ note: input.note })),
  ],
})
const Deleted = Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [Transition.remove(state.todos, input.id)],
})
const Cleared = Transition.make({
  state: Model,
  input: None,
  apply: ({ state }) => [Transition.removeWhere(state.todos, todo => todo.completed)],
})
const Submitted = Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [
    Transition.insert(state.todos, { id: input.id, title: 'new', completed: false, note: null }),
  ],
})
const Restored = Transition.make({
  state: Model,
  input: Schema.Struct({ todo: Todo }),
  apply: ({ state, input }) => [Transition.insert(state.todos, input.todo)],
})
const Appended = Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [
    Transition.append(state.todos, { id: input.id, title: 'a', completed: true, note: null }),
  ],
})
const Tagged = Transition.make({
  state: Model,
  input: Schema.Struct({ tag: Schema.String }),
  apply: ({ state, input }) => [Transition.include(state.tags, input.tag)],
})
const Untagged = Transition.make({
  state: Model,
  input: Schema.Struct({ tag: Schema.String }),
  apply: ({ state, input }) => [Transition.exclude(state.tags, input.tag)],
})
const step = Schema.Int.check(Schema.isBetween({ minimum: -5, maximum: 5 }))
const Counted = Transition.make({
  state: Model,
  input: Schema.Struct({ by: step }),
  apply: ({ state, input }) => [Transition.add(state.count, input.by)],
})

describe('the ways of writing a list', () => {
  it('patch changes every element with the key, and gives back the state where none has it', () => {
    const twice = model([todo('a'), todo('b'), todo('a')])
    const toggled = Result.getOrThrow(Transition.run(Toggled, twice, { id: 'a' }))
    expect(toggled.todos.map(each => each.completed)).toEqual([true, false, true])
    expect(toggled.todos[1]).toBe(twice.todos[1])
    expect(Result.getOrThrow(Transition.run(Toggled, twice, { id: 'z' }))).toBe(twice)
  })

  it('patch stores a value into an Option field as some, and null as none', () => {
    const start = model([todo('a')])
    const noted = Result.getOrThrow(Transition.run(Noted, start, { id: 'a', note: 'x' }))
    expect(noted.todos[0]!.note).toEqual(Option.some('x'))
    expect(Result.getOrThrow(Transition.run(Noted, start, { id: 'a', note: null }))).toBe(start)
  })

  it('remove takes out every element with the key, and is a no-op for a key none has', () => {
    const twice = model([todo('a'), todo('b'), todo('a')])
    expect(Result.getOrThrow(Transition.run(Deleted, twice, { id: 'a' })).todos).toEqual([
      todo('b'),
    ])
    expect(Result.getOrThrow(Transition.run(Deleted, twice, { id: 'z' }))).toBe(twice)
  })

  it('insert appends a new key and leaves a list holding the key as it was', () => {
    const start = model([todo('a')])
    const added = Result.getOrThrow(Transition.run(Submitted, start, { id: 'b' }))
    expect(added.todos.map(each => each.id)).toEqual(['a', 'b'])
    expect(added.todos[1]!.note).toEqual(Option.none())
    expect(Result.getOrThrow(Transition.run(Submitted, start, { id: 'a' }))).toBe(start)
    expect(Result.getOrThrow(Transition.run(Restored, start, { todo: todo('a', true) }))).toBe(
      start,
    )
  })

  it('append adds even a key already there, and removeWhere keeps what does not pass', () => {
    const start = model([todo('a', true), todo('b')])
    expect(Result.getOrThrow(Transition.run(Appended, start, { id: 'a' })).todos).toHaveLength(3)
    expect(Result.getOrThrow(Transition.run(Cleared, start, {})).todos).toEqual([todo('b')])
    const none = model([todo('b')])
    expect(Result.getOrThrow(Transition.run(Cleared, none, {}))).toBe(none)
    // A test that is null does not pass: the todo stays.
    const Unsure = Transition.make({
      state: Model,
      input: None,
      apply: ({ state }) => [
        Transition.removeWhere(state.todos, each =>
          Expr.when(each.completed, { then: null, else: false }),
        ),
      ],
    })
    expect(Result.getOrThrow(Transition.run(Unsure, start, {}))).toBe(start)
  })

  it('include and exclude keep a sorted set, and give it back unchanged', () => {
    const start = model([], ['a', 'c'])
    expect(Result.getOrThrow(Transition.run(Tagged, start, { tag: 'b' })).tags).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(Result.getOrThrow(Transition.run(Tagged, start, { tag: 'c' }))).toBe(start)
    expect(Result.getOrThrow(Transition.run(Untagged, start, { tag: 'a' })).tags).toEqual(['c'])
    expect(Result.getOrThrow(Transition.run(Untagged, start, { tag: 'z' }))).toBe(start)
  })

  it('a patch writes each field it sets of every element, and reads the key and its set', () => {
    expect(Transition.footprint(Toggled)).toEqual({
      reads: Option.some([
        ['state', 'todos', '*', 'id'],
        ['input', 'id'],
        ['state', 'todos', '*', 'completed'],
      ]),
      stateReads: Option.some([
        ['todos', '*', 'id'],
        ['todos', '*', 'completed'],
      ]),
      writes: [['todos', '*', 'completed']],
    })
    expect(Transition.footprint(Cleared).writes).toEqual([['todos']])
  })

  it('a write names its way, and a lifted write keeps it, its nodes moved under the path', () => {
    expect(Toggled.writes.map(write => write.way._tag)).toEqual(['patch'])
    const at = Path.field<{ readonly inner: Model }, 'inner'>('inner')
    const lifted = Transition.lift(at, Toggled)
    expect(lifted.writes.map(write => write.way._tag)).toEqual(['patch'])
    expect(Transition.footprint(lifted).writes).toEqual([['inner', 'todos', '*', 'completed']])
    // The lift's guard reads whether the child is there, which every write under it meets.
    expect(Verdict.isUnknown(Transition.commutes(lifted, Transition.lift(at, Renamed)))).toBe(true)
  })
})

describe('the records a step emits', () => {
  const Undone = Transition.make({
    state: Model,
    input: ById,
    apply: ({ state, input }) => [Transition.remove(state.todos, input.id)],
    emits: ({ state, input }) => [
      Transition.emit('Removed', { id: input.id, left: state.title }),
      Transition.emit('WasLast', { id: input.id }, { when: Eq.is(state.count, 1) }),
      Transition.emit('Odd', { id: input.id }, { when: Ord.gt(Num.neg(state.loose), 0) }),
    ],
  })

  it('gives each entry whose condition is true, read over the state before the step', () => {
    const start = model([todo('a')])
    const stepped = Result.getOrThrow(Transition.step(Undone, start, { id: 'a' }))
    expect(stepped.emitted).toEqual([{ _tag: 'Removed', id: 'a', left: 't' }])
    const last = Result.getOrThrow(
      Transition.step(Undone, { ...start, count: 1, loose: -1 }, { id: 'a' }),
    )
    expect(last.emitted.map(record => record._tag)).toEqual(['Removed', 'WasLast', 'Odd'])
  })

  it('a refused field refuses the step', () => {
    const Refusing = Transition.make({
      state: Model,
      input: None,
      apply: () => [],
      emits: ({ state }) => [Transition.emit('Long', { long: Str.len(state.title) })],
    })
    expect(
      Result.isFailure(Transition.step(Refusing, { ...model([]), title: 'a\u0000' }, {})),
    ).toBe(true)
  })

  it('reads what each entry reads, its condition too', () => {
    expect(Transition.footprint(Undone).reads).toEqual(
      Option.some([
        ['state', 'todos', '*', 'id'],
        ['input', 'id'],
        ['state', 'title'],
        ['state', 'count'],
        ['state', 'loose'],
      ]),
    )
  })

  it('Machine.update gives the records, and none for a refused step', () => {
    const machine = Machine.make({ state: Model, transitions: { Undone } })
    const start = model([todo('a')])
    expect(machine.update(start, { _tag: 'Undone', input: { id: 'a' } })[1]).toHaveLength(1)
  })
})

const opaqueReadingAll = Transition.make({
  state: Model,
  input: None,
  apply: ({ state }) => [
    Transition.set(
      state.title,
      Expr.opaque({ name: 'any' }, () => 'x'),
    ),
  ],
})
const SetTitle = (value: string) =>
  Transition.make({
    state: Model,
    input: None,
    apply: ({ state }) => [Transition.set(state.title, value)],
  })
const Loosened = Transition.make({
  state: Model,
  input: Schema.Struct({ by: Schema.Int }),
  apply: ({ state, input }) => [Transition.add(state.loose, input.by)],
})
const Scaled = Transition.make({
  state: Model,
  input: Schema.Struct({ by: Schema.Finite }),
  apply: ({ state, input }) => [Transition.add(state.ratio, input.by)],
})
const Guarded = Transition.make({
  state: Model,
  input: None,
  when: ({ state }) => Arr.any(state.todos, todo => todo.completed),
  apply: ({ state }) => [Transition.set(state.title, 'done')],
})
const Doubled = Transition.make({
  state: Model,
  input: None,
  apply: ({ state }) => [Transition.add(state.count, state.count)],
})
const RenamedFromCompleted = Transition.make({
  state: Model,
  input: ById,
  apply: ({ state, input }) => [
    Transition.patch(state.todos, input.id, todo => ({
      title: Expr.when(todo.completed, { then: 'done', else: 'open' }),
    })),
  ],
})

describe('Transition.commutes', () => {
  it.each([
    ['a toggle and a rename', () => Transition.commutes(Toggled, Renamed), true],
    ['a rename and a clear of the completed', () => Transition.commutes(Renamed, Cleared), true],
    ['a toggle and a clear of the completed', () => Transition.commutes(Toggled, Cleared), false],
    ['a removal by id and a toggle', () => Transition.commutes(Deleted, Toggled), true],
    ['two removals', () => Transition.commutes(Deleted, Cleared), true],
    ['two inserts: the order shows', () => Transition.commutes(Submitted, Restored), false],
    ['two appends', () => Transition.commutes(Appended, Appended), false],
    ['an insert and a toggle', () => Transition.commutes(Submitted, Toggled), false],
    ['two includes', () => Transition.commutes(Tagged, Tagged), true],
    [
      'an include and an exclude of input values',
      () => Transition.commutes(Tagged, Untagged),
      false,
    ],
    ['two adds to a bounded total', () => Transition.commutes(Counted, Counted), true],
    ['two adds to an unbounded total', () => Transition.commutes(Loosened, Loosened), false],
    ['two adds to a fraction', () => Transition.commutes(Scaled, Scaled), false],
    ['two sets of one literal', () => Transition.commutes(SetTitle('x'), SetTitle('x')), true],
    [
      'two sets of different literals',
      () => Transition.commutes(SetTitle('x'), SetTitle('y')),
      false,
    ],
    [
      'an opaque term that may read anything',
      () => Transition.commutes(opaqueReadingAll, Tagged),
      false,
    ],
    ['a guard reading what the other writes', () => Transition.commutes(Guarded, Toggled), false],
    ['an amount reading the total', () => Transition.commutes(Doubled, Counted), false],
    [
      'a set reading a field the other patch sets',
      () => Transition.commutes(RenamedFromCompleted, Toggled),
      false,
    ],
    ['writes to different paths', () => Transition.commutes(Tagged, Counted), true],
  ] as const)('%s', (_, decide, commuting) => {
    const verdict = decide()
    expect(Verdict.isTrue(verdict)).toBe(commuting)
    expect(Verdict.isFalse(verdict)).toBe(false)
    if (!commuting) {
      expect(Verdict.isUnknown(verdict) && Option.getOrNull(verdict.obligation)?.kind).toBe('walk')
    }
  })

  it('an include and an exclude of different literals commute; of one, they do not decide', () => {
    const include = (tag: string) =>
      Transition.make({
        state: Model,
        input: None,
        apply: ({ state }) => [Transition.include(state.tags, tag)],
      })
    const exclude = (tag: string) =>
      Transition.make({
        state: Model,
        input: None,
        apply: ({ state }) => [Transition.exclude(state.tags, tag)],
      })
    expect(Verdict.isTrue(Transition.commutes(include('a'), exclude('b')))).toBe(true)
    expect(Verdict.isTrue(Transition.commutes(include('a'), exclude('a')))).toBe(false)
  })
})

/** mulberry32: the states are the same on every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

type Outcome = Result.Result<
  { readonly state: Model; readonly emitted: ReadonlyArray<unknown> },
  Transition.Refused
>

/** A transition with the inputs it is run with, its own type kept inside. */
interface Entry {
  readonly name: string
  readonly runs: ReadonlyArray<(state: Model) => Outcome>
  readonly commutesWith: (other: Entry) => Verdict.Verdict<never>
  readonly against: <R>(visit: <I, E>(transition: Transition.Transition<Model, I, E>) => R) => R
}

const entry = <I, E>(
  name: string,
  transition: Transition.Transition<Model, I, E>,
  inputs: ReadonlyArray<I>,
): Entry => ({
  name,
  runs: inputs.map(input => (state: Model) => Transition.step(transition, state, input)),
  commutesWith: other => other.against(theirs => Transition.commutes(transition, theirs)),
  against: visit => visit(transition),
})

const ids = ['a', 'b', 'z']
const entries: ReadonlyArray<Entry> = [
  entry(
    'Toggled',
    Toggled,
    ids.map(id => ({ id })),
  ),
  entry(
    'Renamed',
    Renamed,
    ids.map(id => ({ id, title: `t-${id}` })),
  ),
  entry(
    'Noted',
    Noted,
    ids.map(id => ({ id, note: id === 'b' ? null : 'n' })),
  ),
  entry(
    'Deleted',
    Deleted,
    ids.map(id => ({ id })),
  ),
  entry('Cleared', Cleared, [{}]),
  entry(
    'Submitted',
    Submitted,
    ids.map(id => ({ id })),
  ),
  entry(
    'Appended',
    Appended,
    ids.map(id => ({ id })),
  ),
  entry(
    'Tagged',
    Tagged,
    ['a', 'x'].map(tag => ({ tag })),
  ),
  entry(
    'Untagged',
    Untagged,
    ['a', 'x'].map(tag => ({ tag })),
  ),
  entry(
    'Counted',
    Counted,
    [-5, 0, 4].map(by => ({ by })),
  ),
  entry('SetX', SetTitle('x'), [{}]),
  entry('Guarded', Guarded, [{}]),
  entry(
    'RenamedFromCompleted',
    RenamedFromCompleted,
    ids.map(id => ({ id })),
  ),
]

const states: ReadonlyArray<Model> = (() => {
  const random = seeded(23)
  const pick = <A>(pool: ReadonlyArray<A>): A => pool[Math.floor(random() * pool.length)]!
  return Array.from({ length: 40 }, () => ({
    todos: Array.from({ length: pick([0, 1, 2, 3]) }, () =>
      todo(pick(['a', 'b', 'c']), pick([true, false]), pick(['a', 'x'])),
    ),
    tags: pick([[], ['a'], ['a', 'x'], ['b']]),
    count: pick([0, 3, 997, 1000]),
    loose: 0,
    ratio: 0.5,
    title: pick(['t', 'x']),
  }))
})()

const then = (first: Outcome, next: (state: Model) => Outcome): Outcome =>
  Result.flatMap(first, done =>
    Result.map(next(done.state), after => ({
      state: after.state,
      emitted: [...done.emitted, ...after.emitted],
    })),
  )

/** One outcome: both refused, or one state and one set of records. */
const alike = (left: Outcome, right: Outcome): boolean =>
  Result.match(left, {
    onFailure: () => Result.isFailure(right),
    onSuccess: ({ state, emitted }) =>
      Result.match(right, {
        onFailure: () => false,
        onSuccess: other =>
          JSON.stringify(state) === JSON.stringify(other.state) &&
          JSON.stringify(emitted.map(each => JSON.stringify(each)).sort()) ===
            JSON.stringify(other.emitted.map(each => JSON.stringify(each)).sort()),
      }),
  })

describe('every pair Transition.commutes calls commuting gives one outcome in either order', () => {
  const pairs = entries.flatMap(a => entries.map(b => [a, b] as const))
  const commuting = () => pairs.filter(([a, b]) => Verdict.isTrue(a.commutesWith(b)))

  it('calls some pairs commuting and leaves others to a walk', () => {
    expect(commuting().length).toBeGreaterThan(15)
    expect(commuting().length).toBeLessThan(pairs.length)
  })

  // One test over every pair, so a change to what commutes changes no test's name.
  it('runs both orders of each, over seeded states and inputs', () => {
    const parted: Array<string> = []
    for (const [a, b] of commuting()) {
      for (const state of states) {
        for (const runA of a.runs) {
          for (const runB of b.runs) {
            if (!alike(then(runA(state), runB), then(runB(state), runA))) {
              parted.push(`${a.name} then ${b.name}`)
            }
          }
        }
      }
    }
    expect([...new Set(parted)]).toEqual([])
  })

  it('a walk finds a pair left Unknown that does not commute: a toggle and a clear', () => {
    const start = model([todo('a')])
    const toggledFirst = then(Transition.step(Toggled, start, { id: 'a' }), state =>
      Transition.step(Cleared, state, {}),
    )
    const clearedFirst = then(Transition.step(Cleared, start, {}), state =>
      Transition.step(Toggled, state, { id: 'a' }),
    )
    expect(alike(toggledFirst, clearedFirst)).toBe(false)
  })
})
