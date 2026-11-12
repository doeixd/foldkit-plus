/**
 * `X.step(...rest)(subject)` is `X(subject, ...rest)`: the same node, so the
 * same dependencies, the same text and the same answers. Every check a call
 * runs still runs through a step.
 */
import { Schema, flow, pipe } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Collation,
  Entity,
  Expr,
  Query,
  Text,
  dependenciesOf,
  evaluate,
  type Predicate,
} from '../src/index.js'

const Task = Entity.define(
  'Task',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    rank: Schema.Number,
    title: Schema.String,
  }),
).pipe(Entity.annotateMembers({ title: Collation.of(Collation.binary) }))
const { fields } = Task

const rows = [
  { id: 'a', status: 'open', rank: 1, title: 'Alpha' },
  { id: 'b', status: 'closed', rank: 3, title: 'abc' },
  { id: 'c', status: 'open', rank: 5, title: 'Zed' },
]
const input = { t: 'abc', ids: ['a', 'c'] }
const answers = (predicate: Predicate) =>
  evaluate(Query.from(Task).pipe(Query.where(predicate)), input, rows).map(row => row['id'])

const trim = Expr.operator('acme.trim', {
  input: [Schema.String],
  output: Schema.String,
  definedAs: text => text,
})
const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  definedAs: (a, b) => a,
})
const rankedAtLeast = Expr.operator('acme.rankedAtLeast', {
  input: [Schema.Number, Schema.Number],
  output: Schema.Boolean,
  definedAs: (rank, floor) => Expr.gte(rank, floor),
})
const t = Expr.input('t', Schema.String)
const ids = Expr.input('ids', Schema.Array(Schema.String))

// The step's node beside the data-first node it must equal; each pair differs by where the subject goes.
const predicates = [
  ['eq', () => pipe(fields.status, Expr.eq.step('open')), Expr.eq(fields.status, 'open')],
  ['eq with an input', () => pipe(fields.title, Expr.eq.step(t)), Expr.eq(fields.title, t)],
  ['lt', () => pipe(fields.rank, Expr.lt.step(3)), Expr.lt(fields.rank, 3)],
  ['lte', () => pipe(fields.rank, Expr.lte.step(3)), Expr.lte(fields.rank, 3)],
  ['gt', () => pipe(fields.rank, Expr.gt.step(3)), Expr.gt(fields.rank, 3)],
  ['gte', () => pipe(fields.rank, Expr.gte.step(3)), Expr.gte(fields.rank, 3)],
  [
    'lt with a collation',
    () => pipe(fields.title, Expr.lt.step('b', { collation: Collation.asciiFold })),
    Expr.lt(fields.title, 'b', { collation: Collation.asciiFold }),
  ],
  [
    'contains',
    () => pipe(fields.title, Expr.contains.step('ph')),
    Expr.contains(fields.title, 'ph'),
  ],
  ['in', () => pipe(fields.id, Expr.in.step(['a', 'b'])), Expr.in(fields.id, ['a', 'b'])],
  ['in an input', () => pipe(fields.id, Expr.in.step(ids)), Expr.in(fields.id, ids)],
  [
    'a defined boolean operator',
    () => pipe(fields.rank, rankedAtLeast.step(3)),
    rankedAtLeast(fields.rank, 3),
  ],
  [
    'a primitive operator',
    () => pipe(fields.title, Text.startsWith.step('Al')),
    Text.startsWith(fields.title, 'Al'),
  ],
] as const

describe('A step', () => {
  it.each(predicates)('%s builds the node the data-first call builds', (_, step, call) => {
    expect(step()).toEqual(call)
    expect(dependenciesOf(step())).toEqual(dependenciesOf(call))
    expect(Expr.show(step())).toBe(Expr.show(call))
  })

  it('answers as the data-first call does, over rows where the answer differs by the subject', () => {
    // A swapped subject and value would compare 3 with the rank, so the rows separate them.
    expect(answers(pipe(fields.rank, Expr.lt.step(3)))).toEqual(['a'])
    expect(answers(pipe(fields.rank, Expr.gte.step(3)))).toEqual(['b', 'c'])
    expect(answers(pipe(fields.title, Expr.contains.step('ph')))).toEqual(['a'])
    expect(answers(pipe(fields.id, Expr.in.step(ids)))).toEqual(['a', 'c'])
    expect(answers(pipe(fields.title, Expr.eq.step(t)))).toEqual(['b'])
    expect(answers(pipe(fields.rank, rankedAtLeast.step(3)))).toEqual(['b', 'c'])
  })

  it.each([
    ['unary', () => pipe(fields.title, trim.step()), trim(fields.title)],
    ['binary', () => pipe(fields.title, concat.step('-')), concat(fields.title, '-')],
    [
      'a chain written with flow',
      () => flow(trim.step(), concat.step('-'))(fields.title),
      concat(trim(fields.title), '-'),
    ],
    [
      'the other side a field',
      () => pipe(fields.title, concat.step(Expr.field(fields.title))),
      concat(fields.title, Expr.field(fields.title)),
    ],
  ] as const)('an operator made with Expr.operator: %s equals the nested call', (_, step, call) => {
    expect(step()).toEqual(call)
    expect(dependenciesOf(step())).toEqual(dependenciesOf(call))
  })

  it("keeps the checks a call runs, with the call's own message", () => {
    const message = (run: () => unknown) => {
      try {
        run()
      } catch (error) {
        return (error as Error).message
      }
      return 'did not throw'
    }
    // Past what the types allow, which is what the checks are for.
    const loose = (f: unknown) => f as (...args: ReadonlyArray<unknown>) => never
    const refused = [
      [
        () => pipe(fields.title, loose(concat.step)('a', 'b')),
        () => (concat as (...args: ReadonlyArray<unknown>) => unknown)(fields.title, 'a', 'b'),
      ],
      [
        () => pipe(fields.title, (trim.step as (x: string) => never)('a')),
        () => (trim as (...args: ReadonlyArray<unknown>) => unknown)(fields.title, 'a'),
      ],
      [
        () => pipe(fields.title, Expr.contains.step(fields.title as never)),
        () => Expr.contains(fields.title, fields.title as never),
      ],
      [
        () =>
          pipe(
            fields.title,
            loose(Text.startsWith.step)('a', { collation: Collation.locale('en') }),
          ),
        () =>
          (Text.startsWith as (...args: ReadonlyArray<unknown>) => unknown)(fields.title, 'a', {
            collation: Collation.locale('en'),
          }),
      ],
    ] as const
    for (const [viaStep, viaCall] of refused) {
      expect(message(viaCall)).not.toBe('did not throw')
      expect(message(viaStep)).toBe(message(viaCall))
    }
  })

  it('does not build the node until the subject is given', () => {
    const later = Expr.eq.step('open')
    expect(typeof later).toBe('function')
    expect(later(fields.status)).toEqual(Expr.eq(fields.status, 'open'))
    // Applying it again is a second, equal node.
    expect(later(fields.status)).toEqual(later(fields.status))
  })
})
