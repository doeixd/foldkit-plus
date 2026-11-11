/**
 * `SyncRefusal` speaks Remote's vocabulary: its `Forbidden` is Remote's
 * `Denied.Forbidden` and its `Invalid` Remote's `Refusal.invalid`, type for
 * type, so one function shows either.
 */
import { Option } from 'effect'
import { Denied, Refusal } from 'foldkit-remote'
import { expectTypeOf, test } from 'vitest'
import { SyncRefusal } from '../src/index.js'

type Case<Tag extends SyncRefusal['_tag']> = Extract<SyncRefusal, { readonly _tag: Tag }>

test('Forbidden and Invalid are the types Remote reads', () => {
  expectTypeOf<Case<'Forbidden'>>().toEqualTypeOf<Extract<Denied, { readonly _tag: 'Forbidden' }>>()
  expectTypeOf<Case<'Invalid'>>().toEqualTypeOf<typeof Refusal.invalid.Type>()
})

test('a refusal is read through every case', () => {
  const shown = (refusal: SyncRefusal): string =>
    SyncRefusal.match(refusal, {
      Forbidden: ({ reason }) => Option.getOrElse(reason, () => 'You may not'),
      Invalid: ({ message }) => message,
      Unreadable: ({ version }) => `version ${version}`,
    })
  expectTypeOf(shown).returns.toEqualTypeOf<string>()
  // @ts-expect-error `Unreadable` is not handled
  SyncRefusal.match(refusal(), { Forbidden: () => '', Invalid: () => '' })
})

test('a case is built with its own fields', () => {
  // @ts-expect-error a reason is an Option, not a string
  SyncRefusal.Forbidden({ reason: 'No' })
  // @ts-expect-error an Invalid names its message
  SyncRefusal.Invalid({ entity: Option.none(), rule: Option.none(), path: [] })
  // @ts-expect-error there is no such case
  SyncRefusal.Conflict({})
})

declare const refusal: () => SyncRefusal
