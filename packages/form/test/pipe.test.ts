import { Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Form, Input } from '../src/index.js'

const Author = Entity.define(
  'Author',
  Schema.Struct({ id: Schema.String, name: Schema.String, bio: Schema.String }),
)
const NewAuthor = Entity.input(
  Author,
  Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)), bio: Schema.String }),
)
// A form as a library might hand it over: made, and not finished.
const Plain = Form.make('Author', NewAuthor)

describe('Form pipe steps', () => {
  it('gives a new form with the option added, and leaves the first as it was', () => {
    const Finished = Plain.pipe(
      Form.inputs({ bio: Input.multiline() }),
      Form.messages({ required: field => `${field.label} fehlt` }),
      Form.debounce(0),
    )
    expect(Finished).not.toBe(Plain)
    expect(Finished.controls.map(entry => entry.control.kind)).toEqual(['Text', 'Multiline'])
    expect(Plain.controls.map(entry => entry.control.kind)).toEqual(['Text', 'Text'])
    expectTypeOf(Finished).toEqualTypeOf<typeof Plain>()

    const blurred = Finished.bundle.update(
      Finished.initial,
      Finished.Message.Blurred({ key: 'name' }),
      undefined,
    )
    expect(blurred.model.fields.name).toMatchObject({ errors: ['name fehlt'] })
  })

  it('adds to what is already there, a step at a time', () => {
    const Both = Plain.pipe(
      Form.inputs({ bio: Input.multiline() }),
      Form.inputs({ name: Input.multiline() }),
    )
    expect(Both.controls.map(entry => entry.control.kind)).toEqual(['Multiline', 'Multiline'])
  })

  it('adds checks, and what they need to what the form needs', () => {
    const Checked = Plain.pipe(
      Form.debounce(0),
      Form.checks({ name: name => Effect.succeed(name === 'Root' ? 'Taken' : undefined) }),
    )
    const asking = Checked.bundle.update(
      Checked.initial,
      Checked.Message.Changed({ key: 'name', value: 'Root' }),
      undefined,
    )
    expect(asking.model.fields.name._tag).toBe('Validating')
    expect(asking.commands).toHaveLength(1)
  })

  it('checks a step against the form it is piped into', () => {
    // @ts-expect-error "slug" is not a key of the form
    Plain.pipe(Form.inputs({ slug: Input.text() }))
  })
})
