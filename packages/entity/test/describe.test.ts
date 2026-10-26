/**
 * Operators described as JSON, the operators a body calls, and a call to one
 * version refused by a table that holds another: expr-operations-DESIGN §5.7.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Law,
  OperatorDescription,
  Operators,
  Query,
  applyOperator,
  evaluate,
  valueOfOperand,
} from '../src/index.js'

const decode = Schema.decodeUnknownSync(OperatorDescription)

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, slug: Schema.String }))

describe('An operator described', () => {
  it('describes every kernel operator as its contract says, through JSON', () => {
    for (const { operator } of Operators.kernel.implementations) {
      const described = Operators.describe({ descriptor: operator })
      expect(decode(JSON.parse(JSON.stringify(described)))).toEqual(described)
    }
    expect(
      Operators.describe({ descriptor: Operators.kernel.implementations[0]!.operator }),
    ).toMatchObject({
      name: 'text.startsWith',
      input: [
        { anyOf: [{ type: 'string' }, { type: 'null' }] },
        { anyOf: [{ type: 'string' }, { type: 'null' }] },
      ],
      output: { type: 'boolean' },
      collation: 'required',
      defined: false,
    })
  })

  it('names a later version, says it is defined, and lists its laws, never its body', () => {
    const marked = Expr.operator('acme.marked', {
      input: [Schema.String, Schema.String],
      output: Schema.String,
      version: 2,
      description: 'Text with a mark after it.',
      laws: [Law.idempotent],
      definedAs: text => text,
    })
    const described = Operators.describe(marked)
    expect(described).toMatchObject({
      name: 'acme.marked@2',
      id: 'acme.marked',
      version: 2,
      description: 'Text with a mark after it.',
      defined: true,
    })
    expect(described.laws).toEqual([Law.describe(Law.idempotent)])
    expect(decode(described)).toEqual(described)
  })

  it('describes each schema by its stored side', () => {
    const parsed = Expr.operator('acme.parsed', {
      input: [Schema.NumberFromString],
      output: Schema.Number,
    })
    // A number parsed from text is stored, and so described, as text.
    expect(Operators.describe(parsed).input).toEqual([{ type: 'string' }])
  })

  it('keeps what a schema refers to beside it', () => {
    const Point = Schema.Struct({ x: Schema.Number }).annotate({ identifier: 'Point' })
    const far = Expr.operator('acme.far', {
      input: [Schema.Struct({ from: Point, to: Point })],
      output: Schema.Number,
    })
    expect(Operators.describe(far).input[0]).toMatchObject({
      properties: { from: { $ref: '#/$defs/Point' } },
      $defs: { Point: { type: 'object' } },
    })
  })
})

describe('The operators a body calls', () => {
  it('names each once, a defined one and the primitive one it calls', () => {
    const shout = Expr.operator('acme.shout', { input: [Schema.String], output: Schema.String })
    const loud = Expr.operator('acme.loud', {
      input: [Schema.String],
      output: Schema.Boolean,
      version: 2,
      definedAs: text => Expr.eq(shout(text), 'HI'),
    })
    const body = Query.from(Post).pipe(
      Query.where(loud(Post.fields.slug)),
      Query.where(Expr.eq(shout(Post.fields.slug), 'X')),
    )
    expect(Query.operators(body)).toEqual(['acme.loud@2', 'acme.shout'])
  })
})

describe('A call to another version than a table holds', () => {
  const slug = (version: number) =>
    Expr.operator('acme.slug', { input: [Schema.String], output: Schema.String, version })
  const first = slug(1)
  const table = Operators.memory(Operators.implement(first, text => text.toLowerCase()))
  const body = Query.from(Post).pipe(Query.where(Expr.eq(slug(2)(Post.fields.slug), 'x')))

  it('is refused naming both, where it is checked and where it runs', () => {
    expect(Query.unsupported(body, [], table)).toContain('acme.slug@2 (this table has acme.slug)')
    expect(() => evaluate(body, {}, [{ id: 'p', slug: 'x' }], { operators: table })).toThrow(
      'acme.slug@2 (this table has acme.slug)',
    )
  })

  it('is refused naming both where a call is run alone', () => {
    expect(() => valueOfOperand(slug(2)('X'), { operators: table })).toThrow(
      'acme.slug@2 (this table has acme.slug)',
    )
  })

  it('is refused naming both where it is run over stored values', () => {
    expect(() =>
      applyOperator(slug(2).descriptor, ['X'], { collation: Option.none(), operators: table }),
    ).toThrow('acme.slug@2 (this table has acme.slug)')
  })

  it('says it is another declaration where the table holds the same name and version', () => {
    // `slug(1)` declares a second operator by the name the table's `first` has.
    expect(() => valueOfOperand(slug(1)('X'), { operators: table })).toThrow(
      'acme.slug (this table has another declaration of it; declare an operator once and import it)',
    )
  })

  it('is named alone where the table holds no version of it', () => {
    expect(Query.unsupported(body, [], Operators.kernel)).toContain('acme.slug@2')
    expect(Query.unsupported(body, [], Operators.kernel)).not.toContain(
      'acme.slug@2 (this table has acme.slug)',
    )
  })
})
