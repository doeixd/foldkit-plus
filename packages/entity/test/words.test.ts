import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Words } from '../src/index.js'

describe('Words.of', () => {
  it.each([
    ['given on the schema', Schema.String.annotate({ title: 'Name', description: 'Who' })],
    [
      'given before a check',
      Schema.String.annotate({ title: 'Name', description: 'Who' }).check(Schema.isMinLength(1)),
    ],
    [
      'given after a check',
      Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Name', description: 'Who' }),
    ],
  ])('reads a title and a description %s', (_, schema) => {
    expect(Words.of(schema)).toEqual({
      title: Option.some('Name'),
      description: Option.some('Who'),
    })
  })

  it('says none where the schema says nothing', () => {
    expect(Words.of(Schema.String.check(Schema.isMinLength(1)))).toEqual({
      title: Option.none(),
      description: Option.none(),
    })
  })
})
