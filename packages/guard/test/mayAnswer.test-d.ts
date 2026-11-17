/**
 * What `may`'s readers accept and answer, one defect per negative case: the
 * three-state answer is an `Option`, read without annotation, and only a
 * row's own interactions are asked of it.
 */
import { Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { RemoteData } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'
import { GuardAgent } from '../src/agent.js'
import { Interaction, May, type MayAnswer } from '../src/index.js'

declare const may: MayAnswer
const Todo = Entity.define('Todo', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Archive = Interaction.make('Archive')

expectTypeOf(May.answer(may, 'Update')).toEqualTypeOf<Option.Option<boolean>>()
expectTypeOf(May.answer(may, Archive.key)).toEqualTypeOf<Option.Option<boolean>>()
expectTypeOf(May.refused(may, 'Delete')).toEqualTypeOf<boolean>()
expectTypeOf(May.can(may, 'Delete')).toEqualTypeOf<boolean>()

// Each arm is typed from the answer, with no annotation.
expectTypeOf(
  Option.match(May.answer(may, 'Update'), {
    onNone: () => 'unsaid' as const,
    onSome: allowed => {
      expectTypeOf(allowed).toEqualTypeOf<boolean>()
      return allowed
    },
  }),
).toEqualTypeOf<boolean | 'unsaid'>()

// @ts-expect-error Read is the row's visibility, not an interaction may answers
May.answer(may, 'Read')
// @ts-expect-error an interaction is named through Interaction.make, not by a bare string
May.answer(may, 'Archive')
// @ts-expect-error Create has no row to answer for
May.refused(may, 'Create')
// @ts-expect-error an interaction is named through Interaction.make, not by a bare string
May.refused(may, 'Archive')
// @ts-expect-error the answer is not a boolean: unsaid is told apart from a no
const yes: boolean = May.answer(may, 'Update')
void yes

// `locked` answers a boolean for a row as a form loads it, with no annotation.
expectTypeOf(May.locks(Todo).locked({ may }, 'title')).toEqualTypeOf<boolean>()
expectTypeOf(May.canSet(may, Todo, 'title')).toEqualTypeOf<boolean>()
// @ts-expect-error not a member of Todo
May.canSet(may, Todo, 'colour')

declare const row: RemoteData<{ readonly may: MayAnswer }>
const authorize = GuardAgent.authorize(
  'Update',
  ({ input }: { readonly input: { readonly id: string } }) => {
    expectTypeOf(input.id).toEqualTypeOf<string>()
    return row
  },
)
expectTypeOf(authorize({ input: { id: 't1' }, model: {} })).toEqualTypeOf<
  boolean | { readonly allowed: false; readonly reason: string }
>()
// @ts-expect-error Read is not an interaction a capability is gated on
GuardAgent.available('Read', () => row)
