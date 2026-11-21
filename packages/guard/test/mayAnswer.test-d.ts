/**
 * What `may`'s readers accept and answer, one defect per negative case: the
 * three-state answer is a `Verdict`, and only a
 * row's own interactions are asked of it.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { RemoteData } from 'foldkit-remote'
import { Verdict } from 'metakit'
import { expectTypeOf } from 'vitest'
import { GuardAgent } from '../src/agent.js'
import { Interaction, May, type MayAnswer } from '../src/index.js'

declare const may: MayAnswer
const Todo = Entity.define('Todo', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Archive = Interaction.make('Archive')

expectTypeOf(May.answer(may, 'Update')).toEqualTypeOf<Verdict.Verdict<never>>()
expectTypeOf(May.answer(may, Archive.key)).toEqualTypeOf<Verdict.Verdict<never>>()
expectTypeOf(May.refused(may, 'Delete')).toEqualTypeOf<boolean>()
expectTypeOf(May.can(may, 'Delete')).toEqualTypeOf<boolean>()

// Each arm is typed from the answer. `Verdict.match` takes its result type from
// the annotation, not the first arm, where the arms differ.
expectTypeOf(
  Verdict.match<never, 'yes' | false | 'unsaid'>(May.answer(may, 'Update'), {
    True: () => 'yes',
    False: () => false,
    Unknown: ({ reason }) => {
      expectTypeOf(reason).toEqualTypeOf<string>()
      return 'unsaid'
    },
  }),
).toEqualTypeOf<'yes' | false | 'unsaid'>()

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
