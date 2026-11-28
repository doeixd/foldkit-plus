/**
 * A transition refuses a write under a null or absent parent instead of
 * inventing a partial struct the state Schema does not admit (#652).
 */
import { Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Transition } from '@doeixd/metakit'

const Profile = Schema.Struct({ name: Schema.String, age: Schema.Int })
const NullableProfileState = Schema.Struct({ profile: Schema.NullOr(Profile) })
const OptionalKeyProfileState = Schema.Struct({ profile: Schema.optionalKey(Profile) })
const OptionalProfileState = Schema.Struct({ profile: Schema.optional(Profile) })

const RenameNullable = Transition.make({
  state: NullableProfileState,
  input: Schema.Struct({ name: Schema.String }),
  apply: ({ state, input }) => [Transition.set(state.profile.name, input.name)],
})

const RenameOptionalKey = Transition.make({
  state: OptionalKeyProfileState,
  input: Schema.Struct({ name: Schema.String }),
  apply: ({ state, input }) => [Transition.set(state.profile.name, input.name)],
})

const RenameOptional = Transition.make({
  state: OptionalProfileState,
  input: Schema.Struct({ name: Schema.String }),
  apply: ({ state, input }) => [Transition.set(state.profile.name, input.name)],
})

const TwoLevelState = Schema.Struct({
  a: Schema.NullOr(Schema.Struct({ b: Schema.NullOr(Schema.Struct({ c: Schema.Int })) })),
})

const SetDeep = Transition.make({
  state: TwoLevelState,
  input: Schema.Struct({ c: Schema.Int }),
  apply: ({ state, input }) => [Transition.set(state.a.b.c, input.c)],
})

describe('Transition.run writing under a null or absent parent', () => {
  it('refuses writing a field under a null parent', () => {
    const result = Transition.run(RenameNullable, { profile: null }, { name: 'x' })
    expect(result).toEqual(
      Result.fail(
        new Transition.Refused({
          reason: '"profile.name" is under "profile", which holds no value: write the whole value',
        }),
      ),
    )
  })

  it('refuses writing a field under an absent optionalKey parent', () => {
    const result = Transition.run(RenameOptionalKey, {}, { name: 'x' })
    expect(result).toEqual(
      Result.fail(
        new Transition.Refused({
          reason: '"profile.name" is under "profile", which holds no value: write the whole value',
        }),
      ),
    )
  })

  it('refuses writing a field under an undefined optional parent', () => {
    const result = Transition.run(RenameOptional, { profile: undefined }, { name: 'x' })
    expect(result).toEqual(
      Result.fail(
        new Transition.Refused({
          reason: '"profile.name" is under "profile", which holds no value: write the whole value',
        }),
      ),
    )
  })

  it('refuses a two-level write when the inner parent is null, naming that prefix', () => {
    const result = Transition.run(SetDeep, { a: { b: null } }, { c: 1 })
    expect(result).toEqual(
      Result.fail(
        new Transition.Refused({
          reason: '"a.b.c" is under "a.b", which holds no value: write the whole value',
        }),
      ),
    )
  })

  it('refuses a two-level write when the outer parent is null, naming the outer prefix', () => {
    const result = Transition.run(SetDeep, { a: null }, { c: 1 })
    expect(result).toEqual(
      Result.fail(
        new Transition.Refused({
          reason: '"a.b.c" is under "a", which holds no value: write the whole value',
        }),
      ),
    )
  })

  it('keeps the Option refusal message for a nested path inside an Option', () => {
    const OptionNestedState = Schema.Struct({
      a: Schema.Option(Schema.Struct({ b: Schema.Struct({ c: Schema.Int }) })),
    })
    const SetInOption = Transition.make({
      state: OptionNestedState,
      input: Schema.Struct({ c: Schema.Int }),
      apply: ({ state, input }) => [Transition.set(state.a.b.c, input.c)],
    })
    const result = Transition.run(SetInOption, { a: Option.none() }, { c: 1 })
    expect(result).toEqual(
      Result.fail(
        new Transition.Refused({
          reason: '"a.b.c" is inside the Option at "a": write the whole value',
        }),
      ),
    )
  })

  it('writes a field when the parent struct is present', () => {
    const result = Transition.run(RenameNullable, { profile: { name: 'y', age: 3 } }, { name: 'x' })
    expect(result).toEqual(Result.succeed({ profile: { name: 'x', age: 3 } }))
  })

  it('allows writing the whole struct over a null parent', () => {
    const ReplaceProfile = Transition.make({
      state: NullableProfileState,
      input: Schema.Struct({ profile: Profile }),
      apply: ({ state, input }) => [Transition.set(state.profile, input.profile)],
    })
    const result = Transition.run(
      ReplaceProfile,
      { profile: null },
      { profile: { name: 'x', age: 1 } },
    )
    expect(result).toEqual(Result.succeed({ profile: { name: 'x', age: 1 } }))
  })

  it('allows a top-level single-segment write', () => {
    const TopLevel = Transition.make({
      state: Schema.Struct({ count: Schema.Int }),
      input: Schema.Struct({ next: Schema.Int }),
      apply: ({ state, input }) => [Transition.set(state.count, input.next)],
    })
    expect(Transition.run(TopLevel, { count: 0 }, { next: 5 })).toEqual(
      Result.succeed({ count: 5 }),
    )
  })
})
