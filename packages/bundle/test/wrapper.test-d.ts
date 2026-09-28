/**
 * `Link.wrapper` from a variant the parent union already declares.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Link, type Wrapper } from '../src/index.js'

const Message = defineMessageUnion({
  GotCountMessage: { message: Schema.NumberFromString },
  Saved: {},
  Renamed: { message: Schema.String, title: Schema.String },
})

// The tag and the child Message's decoded type come from the variant.
expectTypeOf(Link.wrapper(Message.GotCountMessage)).toEqualTypeOf<
  Wrapper<'GotCountMessage', number>
>()

// @ts-expect-error a variant without `message` carries no child Messages
Link.wrapper(Message.Saved)

// @ts-expect-error a wrapped Message would lack the variant's other fields
Link.wrapper(Message.Renamed)
