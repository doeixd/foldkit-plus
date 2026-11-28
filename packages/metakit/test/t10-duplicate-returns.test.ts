import { Schema } from 'effect'
import { expect, it } from 'vitest'
import * as Fn from '../src/fn.js'

const NonNegative = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const params = { x: Schema.Int }

it.each([
  { form: 'body first', declare: () => Fn.make(params, ({ x }) => x).returns(NonNegative) },
  { form: 'signature first', declare: () => Fn.params(params).returns(NonNegative) },
])('refuses a second return Schema when built $form', ({ declare }) => {
  const fn = declare()

  expect(() => fn.returns(Schema.Int)).toThrow('a return Schema is already set')
})
