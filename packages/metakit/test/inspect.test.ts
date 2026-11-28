import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Expr, Num, Str } from 'metakit'
import { CalendarDay } from 'metakit/domain'
import * as Inspect from 'metakit/inspect'

const object = (
  properties: Readonly<Record<string, unknown>>,
  required: ReadonlyArray<string>,
) => ({ type: 'object', properties, required, additionalProperties: false })

const { isGreaterThan: gt, isGreaterThanOrEqualTo: gte, isLessThan: lt } = Schema
const { isLessThanOrEqualTo: lte } = Schema

describe('Inspect bounds keep the tightest of two on a side', () => {
  const cases = [
    { checks: [gt(0), gt(5)], json: { exclusiveMinimum: 5 } },
    { checks: [gt(5), gt(0)], json: { exclusiveMinimum: 5 } },
    { checks: [gte(5), gt(3)], json: { minimum: 5 } },
    { checks: [gt(3), gte(5)], json: { minimum: 5 } },
    { checks: [gte(3), gt(5)], json: { exclusiveMinimum: 5 } },
    { checks: [gte(5), gt(5)], json: { exclusiveMinimum: 5 } },
    { checks: [lt(10), lt(4)], json: { exclusiveMaximum: 4 } },
    { checks: [lt(4), lt(10)], json: { exclusiveMaximum: 4 } },
    { checks: [lte(4), lt(10)], json: { maximum: 4 } },
    { checks: [lt(4), lte(10)], json: { exclusiveMaximum: 4 } },
    { checks: [lte(4), lt(4)], json: { exclusiveMaximum: 4 } },
  ] as const

  it.each(cases)('$checks.0.annotations.expected, $checks.1.annotations.expected', c => {
    const n = Schema.Number.check(...c.checks)
    const json = { type: 'number', ...c.json }
    expect(Inspect.toJsonSchema(Schema.Struct({ x: n }))).toEqual(object({ x: json }, ['x']))
    expect(Inspect.toJsonSchema(Schema.Struct({ x: Schema.NullOr(n) }))).toEqual(
      object({ x: { ...json, type: ['number', 'null'] } }, ['x']),
    )
    const [spec] = Inspect.fieldSpecs(n)
    expect(spec).toMatchObject({
      min: Option.fromUndefinedOr('minimum' in c.json ? c.json.minimum : undefined),
      exclusiveMin: Option.fromUndefinedOr(
        'exclusiveMinimum' in c.json ? c.json.exclusiveMinimum : undefined,
      ),
      max: Option.fromUndefinedOr('maximum' in c.json ? c.json.maximum : undefined),
      exclusiveMax: Option.fromUndefinedOr(
        'exclusiveMaximum' in c.json ? c.json.exclusiveMaximum : undefined,
      ),
    })
  })
})

describe('Inspect.toJsonSchema', () => {
  it('describes an array by its items and a nested struct by its properties', () => {
    const Order = Schema.Struct({
      tags: Schema.Array(Schema.String),
      scores: Schema.NullOr(Schema.Array(Schema.Number.check(gte(0)))),
      address: Schema.Struct({
        zip: Schema.Int.check(gte(1000)),
        line2: Schema.optionalKey(Schema.String),
      }),
    })
    expect(Inspect.toJsonSchema(Order)).toEqual(
      object(
        {
          tags: { type: 'array', items: { type: 'string' } },
          scores: { type: ['array', 'null'], items: { type: 'number', minimum: 0 } },
          address: object({ zip: { type: 'integer', minimum: 1000 }, line2: { type: 'string' } }, [
            'zip',
          ]),
        },
        ['tags', 'scores', 'address'],
      ),
    )
  })

  it('claims no type for a field whose shape it cannot read', () => {
    const Row = Schema.Struct({ value: Schema.Union([Schema.String, Schema.Number]) })
    expect(Inspect.fieldSpecs(Row)).toMatchObject([{ name: 'value', kind: 'unknown' }])
    expect(Inspect.toJsonSchema(Row)).toEqual(object({ value: {} }, ['value']))
  })

  it('requires only the keys that may not be left out', () => {
    const Row = Schema.Struct({
      id: Schema.String,
      note: Schema.optional(Schema.Number),
      tag: Schema.optionalKey(Schema.String),
    })
    expect(Inspect.fieldSpecs(Row)).toMatchObject([
      { name: 'id', kind: 'string', optional: false },
      { name: 'note', kind: 'number', optional: true, nullable: false },
      { name: 'tag', kind: 'string', optional: true },
    ])
    expect(Inspect.toJsonSchema(Row)).toEqual(
      object({ id: { type: 'string' }, note: { type: 'number' }, tag: { type: 'string' } }, ['id']),
    )
  })

  it('gives a CalendarDay no date format, since it travels as an integer', () => {
    const Booking = Schema.Struct({ day: CalendarDay.schema })
    expect(Inspect.toJsonSchema(Booking)).toEqual(
      object({ day: { type: 'integer', 'x-metakit-domain': { kind: 'calendarDay' } } }, ['day']),
    )
  })

  it('carries title and description into FieldSpec and JSON Schema across shapes and refine orders', () => {
    const Before = Schema.String.annotate({ title: 'Name', description: 'Display name' }).pipe(
      Expr.refine($ => Num.gt(Str.len($), 0)),
    )
    const After = Schema.String.pipe(
      Expr.refine($ => Num.gt(Str.len($), 0)),
      Schema.annotate({ title: 'Code', description: 'Short code' }),
    )
    const Item = Schema.Struct({
      before: Before,
      after: After,
      note: Schema.optional(Schema.String.annotate({ title: 'Note' })),
      tags: Schema.Array(Schema.String.annotate({ title: 'Tag' })).annotate({
        title: 'Tags',
        description: 'Labels',
      }),
      plain: Schema.Number,
    }).annotate({ title: 'Item', description: 'One catalog item' })

    const specs = Inspect.fieldSpecs(Item)
    expect(specs.map(s => [s.name, s.title, s.description])).toEqual([
      ['before', Option.some('Name'), Option.some('Display name')],
      ['after', Option.some('Code'), Option.some('Short code')],
      ['note', Option.some('Note'), Option.none()],
      ['tags', Option.some('Tags'), Option.some('Labels')],
      ['plain', Option.none(), Option.none()],
    ])

    expect(Inspect.toJsonSchema(Item)).toEqual({
      ...object(
        {
          before: { type: 'string', title: 'Name', description: 'Display name' },
          after: { type: 'string', title: 'Code', description: 'Short code' },
          note: { type: 'string', title: 'Note' },
          tags: {
            type: 'array',
            title: 'Tags',
            description: 'Labels',
            items: { type: 'string', title: 'Tag' },
          },
          plain: { type: 'number' },
        },
        ['before', 'after', 'tags', 'plain'],
      ),
      title: 'Item',
      description: 'One catalog item',
    })
  })
})
