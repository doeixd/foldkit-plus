import { Schema, SchemaAST } from 'effect'
import { describe, expect, it } from 'vitest'
import { SchemaShape } from '../src/index.js'

const tags = (members: ReadonlyArray<SchemaAST.AST>) => members.map(member => member._tag)

describe('SchemaShape.present', () => {
  it.each([
    ['a plain schema is its one member', Schema.String, ['String']],
    ['null is set aside', Schema.NullOr(Schema.String), ['String']],
    ['undefined is set aside', Schema.UndefinedOr(Schema.Number), ['Number']],
    [
      'both are set aside, and every other member kept',
      Schema.Union([Schema.String, Schema.Null, Schema.Number, Schema.Undefined]),
      ['String', 'Number'],
    ],
    ['a union of literals keeps each', Schema.Literals(['a', 'b']), ['Literal', 'Literal']],
    ['nothing is left of null alone', Schema.Union([Schema.Null]), []],
  ] as const)('%s', (_, schema, expected) => {
    expect(tags(SchemaShape.present(schema.ast))).toEqual(expected)
  })
})

describe('SchemaShape.isNullish', () => {
  it.each([
    [Schema.Null, true],
    [Schema.Undefined, true],
    [Schema.String, false],
    [Schema.NullOr(Schema.String), false],
  ] as const)('%#', (schema, expected) => {
    expect(SchemaShape.isNullish(schema.ast)).toBe(expected)
  })
})

describe('SchemaShape.isText', () => {
  it.each([
    ['a string', Schema.String, true],
    ['a branded string', Schema.String.pipe(Schema.brand('Id')), true],
    ['a template literal', Schema.TemplateLiteral(['post-', Schema.String]), true],
    ['a string literal', Schema.Literal('a'), true],
    ['a union of string literals', Schema.Literals(['a', 'b']), true],
    ['a number', Schema.Number, false],
    ['a number literal', Schema.Literal(1), false],
    ['a union with a number literal', Schema.Literals(['a', 1]), false],
    ['nullable text', Schema.NullOr(Schema.String), false],
    ['an empty union', Schema.Union([]), false],
  ] as const)('%s: %s', (_, schema, expected) => {
    expect(SchemaShape.isText(schema.ast)).toBe(expected)
  })
})
