import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Form, Input } from '../src/index.js'

const Paint = Schema.Struct({ colours: Schema.Array(Schema.Literals(['red', 'green'])) })
// Built inside each test, so a key that resolves to no control fails a test
// rather than the import that would run it.
const paint = () => Form.make('Paint', Form.input(Paint))

const Numbers = Schema.Struct({ picks: Schema.Array(Schema.Literals([1, 2])) })
const numbers = () => Form.make('Numbers', Form.input(Numbers))

const step = (
  form: ReturnType<typeof paint>,
  model: ReturnType<typeof paint>['initial'],
  value: ReadonlyArray<string>,
) =>
  form.bundle.update(
    model,
    form.Message.Changed({ key: 'colours', value: value as string[] }),
    undefined,
  ).model

describe('A key that is any number of a fixed set', () => {
  it('is a choice group without being told, from the schema, with its options', () => {
    const form = paint()
    const control = form.controls.find(control => control.key === 'colours')!.control
    expect(control.kind).toBe('Choices')
    expect(Input.Choices.is(control) ? control.data.options : undefined).toEqual(['red', 'green'])
  })

  it('submits the options themselves, not the text of them', () => {
    const form = numbers()
    const model = form.bundle.update(
      form.initial,
      form.Message.Changed({ key: 'picks', value: ['1', '2'] }),
      undefined,
    ).model
    expect(form.engine.value(model)).toEqual({ picks: [1, 2] })
  })

  it('submits what was chosen', () => {
    const form = paint()
    expect(form.engine.value(step(form, form.initial, ['red']))).toEqual({ colours: ['red'] })
    expect(form.engine.value(step(form, form.initial, ['red', 'green']))).toEqual({
      colours: ['red', 'green'],
    })
  })

  it('refuses a value that is not one of the options', () => {
    const form = paint()
    const model = step(form, form.initial, ['red', 'blue'])
    expect(model.fields.colours).toEqual({
      _tag: 'Invalid',
      value: ['red', 'blue'],
      errors: ['Choose from the options'],
    })
    expect(form.engine.value(model)).toBeUndefined()
  })

  it('is valid empty as an array is, and left out when the key is optional', () => {
    const Optional = Schema.Struct({
      tags: Schema.optionalKey(Schema.Array(Schema.Literals(['a', 'b']))),
    })
    const OptionalForm = Form.make('Optional', Form.input(Optional))
    expect(OptionalForm.controls.find(control => control.key === 'tags')?.control.kind).toBe(
      'Choices',
    )
    expect(OptionalForm.engine.value(OptionalForm.initial)).toEqual({})
  })

  it('can be named for a set the schema does not spell', () => {
    const Ids = Schema.Struct({ ids: Schema.Array(Schema.Number) })
    const IdsForm = Form.make('Ids', Form.input(Ids), { inputs: { ids: Input.choices([1, 2]) } })
    const model = IdsForm.bundle.update(
      IdsForm.initial,
      IdsForm.Message.Changed({ key: 'ids', value: ['2'] }),
      undefined,
    ).model
    expect(IdsForm.engine.value(model)).toEqual({ ids: [2] })
  })

  it('still refuses an array of text, which says nothing about its values', () => {
    const Words = Schema.Struct({ words: Schema.Array(Schema.String) })
    expect(() => Form.make('Words', Form.input(Words))).toThrow('no control for "words"')
  })
})

describe('A choice that must hold one', () => {
  const Topics = Schema.Literals(['news', 'offers'])
  it.each([
    ['a non-empty array', Schema.NonEmptyArray(Topics)],
    ['an array with a length check', Schema.Array(Topics).check(Schema.isMinLength(1))],
  ])('is %s: a required choice group, valid once one is chosen', (_, topics) => {
    const form = Form.make('Signup', Form.input(Schema.Struct({ topics })))
    const control = form.controls.find(control => control.key === 'topics')!
    expect([control.control.kind, control.required]).toEqual(['Choices', true])
    const empty = form.bundle.update(form.initial, form.Message.ValidatedAll(), undefined).model
    expect(form.engine.value(empty)).toBeUndefined()
    const chosen = form.bundle.update(
      empty,
      form.Message.Changed({ key: 'topics', value: ['offers'] }),
      undefined,
    ).model
    expect(form.engine.value(chosen)).toEqual({ topics: ['offers'] })
  })
})
