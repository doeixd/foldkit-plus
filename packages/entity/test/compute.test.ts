/**
 * Computed assignments and the one row a write leaves: `Write.update`'s
 * `compute`, its data form, and `Write.apply`. expr-operations-DESIGN §9.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Computation, Entity, Expr, Operators, Write } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    label: Schema.String,
    views: Schema.NullOr(Schema.Int),
    score: Schema.Int,
    revision: Schema.Int,
  }),
)

/** Text after text. */
const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
})
/** Text with a mark, defined by `concat`: expanded where the write is declared. */
const marked = Expr.operator('acme.marked', {
  input: [Schema.String],
  output: Schema.String,
  definedAs: text => concat(text, '!'),
})
/** A sum, strict about null: a null argument makes it null. */
const plus = Expr.operator('acme.plus', { input: [Schema.Int, Schema.Int], output: Schema.Int })
const operators = Operators.memory(Operators.implement(concat, (left, right) => `${left}${right}`))

const Relabel = Entity.input(
  Post,
  Schema.Struct({ id: Schema.String, suffix: Schema.String, by: Schema.Int }),
  { suffix: Entity.unmapped, by: Entity.unmapped },
)
const relabel = Write.update(Relabel, {
  id: 'id',
  increment: { score: 'by' },
  compute: { label: ({ row, input }) => concat(row.title, input.suffix) },
})

describe('A computed assignment', () => {
  it('is a write of its field, reading what its expression reads', () => {
    expect(relabel.assignments.map(assignment => assignment.field.key)).toEqual(['label'])
    expect(Write.writes(relabel).map(field => field.key)).toEqual(['score', 'label'])
    expect(Write.reads(relabel).map(field => field.key)).toEqual(['score', 'title'])
  })

  it('binds to data: fields by key, the input encoded, operators by name', () => {
    expect(Write.bind(relabel, { id: 'p1', suffix: ' (draft)', by: 2 }).assignments).toEqual({
      label: Computation.Call({
        operator: 'acme.concat',
        args: [Computation.Field({ key: 'title' }), Computation.Value({ value: ' (draft)' })],
        collation: null,
      }),
    })
  })

  it('is expanded where declared, so a defined operator travels as what it means', () => {
    const write = Write.update(Relabel, {
      id: 'id',
      compute: { label: ({ row }) => marked(row.title) },
    })
    expect(Write.bind(write, { id: 'p1', suffix: '', by: 0 }).assignments.label).toEqual(
      Computation.Call({
        operator: 'acme.concat',
        args: [Computation.Field({ key: 'title' }), Computation.Value({ value: '!' })],
        collation: null,
      }),
    )
  })

  it.each([
    [
      'a field the Entity lacks',
      { nothing: () => concat('a', 'b') },
      '"nothing", which is not a field',
    ],
    ['the id', { id: () => concat('a', 'b') }, 'computes the id'],
    [
      'a field another key writes',
      { score: () => Expr.literal(1) },
      '"score", which the write also sets',
    ],
    [
      'the row after the write',
      { label: () => concat(Expr.next(Post.fields.title), 'x') },
      'from the row after the write',
    ],
    [
      "another Entity's field",
      { label: () => concat(Author.fields.name, 'x') },
      "from Author.name, another Entity's field",
    ],
    [
      'a value of a kind the field does not store',
      { label: () => Expr.literal(3) },
      'as number, which it does not store',
    ],
    [
      'a nullable field, into one that stores no null',
      { revision: () => Post.fields.views },
      '"revision" as possibly null',
    ],
    [
      'a strict operator over a nullable field, which answers it with null',
      { revision: () => plus(Post.fields.views, 1) },
      '"revision" as possibly null',
    ],
    ['a null', { label: () => Expr.literal(null) }, '"label" as possibly null'],
  ] as const)('is refused over %s', (_, compute, message) => {
    expect(() =>
      Write.update(Relabel, {
        id: 'id',
        increment: { score: 'by' },
        compute: compute as never,
      }),
    ).toThrow(message)
  })

  it('counts as setting something', () => {
    const OnlyId = Entity.input(Post, Schema.Struct({ id: Schema.String }))
    expect(() => Write.update(OnlyId, { id: 'id' })).toThrow('it sets no field')
    expect(
      Write.update(OnlyId, { id: 'id', compute: { label: ({ row }) => concat(row.title, '') } })
        .assignments,
    ).toHaveLength(1)
  })
})

describe('The row a write leaves', () => {
  const bound = (by: number) => Write.bind(relabel, { id: 'p1', suffix: '+', by })
  const row = { id: 'p1', title: 'T', label: 'old', views: null, score: 5, revision: 1 }

  it('sets, adds and computes over the row before', () => {
    expect(Write.apply(row, bound(2), { operators })).toEqual({
      row: { ...row, label: 'T+', score: 7 },
      unknown: [],
    })
  })

  it('keeps a null under an amount null, as SQL does', () => {
    // A declared increment is of a field stored as a number; a stored row may still hold null.
    const counted = { values: {}, increments: { views: 3 }, assignments: {} }
    // Known to be null, not left unworked out.
    expect(Write.apply(row, counted, { operators })).toMatchObject({
      row: { views: null },
      unknown: [],
    })
    expect(Write.apply({ ...row, views: 4 }, counted, { operators }).row.views).toBe(7)
  })

  it('names what it cannot work out, which keeps what the row holds', () => {
    // No title to compute from, and no score to add to.
    const { title: _title, score: _score, ...partial } = row
    expect(Write.apply(partial, bound(2), { operators })).toEqual({
      row: partial,
      unknown: ['score', 'label'],
    })
    // A table without the operator.
    expect(Write.apply(row, bound(2), { operators: Operators.kernel }).unknown).toEqual(['label'])
  })

  it('reads, of the row before, what its amounts and assignments need', () => {
    expect(Write.boundReads(bound(2))).toEqual(['score', 'title'])
  })

  it('runs a strict operator over a null as null', () => {
    const write = Write.update(Relabel, {
      id: 'id',
      compute: { label: ({ row: fields }) => concat(fields.title, 'x') },
    })
    expect(
      Write.apply({ ...row, title: null }, Write.bind(write, { id: 'p1', suffix: '', by: 0 }), {
        operators,
      }).row.label,
    ).toBe(null)
  })
})

describe('Computation', () => {
  it('is JSON, so a pending patch can hold it and work it out after', () => {
    const bound = Write.bind(relabel, { id: 'p1', suffix: '+', by: 1 })
    const carried = JSON.parse(JSON.stringify(bound.assignments))
    expect(carried).toEqual(bound.assignments)
    const row = { id: 'p1', title: 'Hi', label: 'old', views: null, score: 1, revision: 1 }
    expect(Write.apply(row, { ...bound, assignments: carried }, { operators }).row.label).toBe(
      'Hi+',
    )
  })
})
