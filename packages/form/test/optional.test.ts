import { Option, Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Form } from '../src/index.js'

const Phone = Schema.String.check(Schema.isPattern(/^\d{3,}$/, { message: 'Digits only' }))
const Contact = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1)),
  phone: Schema.optionalKey(Phone).annotate({ title: 'Phone' }),
  fax: Schema.optional(Phone),
  age: Schema.optionalKey(Schema.Number),
  nickname: Schema.OptionFromNullOr(Schema.String.check(Schema.isMinLength(2))),
})
const ContactForm = Form.make('Contact', Entity.input(Entity.define('Contact', Contact), Contact))
const { Message } = ContactForm
type Model = typeof ContactForm.initial
type Key = (typeof ContactForm.controls)[number]['key']

const step = (model: Model, message: typeof Message.Type) =>
  ContactForm.bundle.update(model, message, undefined)
const typed = (entries: ReadonlyArray<readonly [Key, string]>): Model =>
  entries.reduce(
    (model, [key, value]) => step(model, Message.Changed({ key, value })).model,
    ContactForm.initial,
  )
const submittedValue = (model: Model) => step(model, Message.Submitted()).outMessage?.value

describe('An optional key', () => {
  it.each(['phone', 'fax', 'age', 'nickname'] as const)('%s is not required', key => {
    expect(ContactForm.controls.find(control => control.key === key)?.required).toBe(false)
  })

  it('left empty is valid and absent from the value, optionalKey or optional', () => {
    const value = submittedValue(typed([['name', 'Ada']]))
    expect(value).toEqual({ name: 'Ada', nickname: Option.none() })
    expect(value !== undefined && ('phone' in value || 'fax' in value || 'age' in value)).toBe(
      false,
    )
  })

  it('emptied after typing is absent too', () => {
    const value = submittedValue(
      typed([
        ['name', 'Ada'],
        ['phone', '123'],
        ['phone', ''],
      ]),
    )
    expect(value !== undefined && 'phone' in value).toBe(false)
  })

  it('entered is checked by its schema, and submitted when it passes', () => {
    const wrong = typed([
      ['name', 'Ada'],
      ['phone', 'call me'],
    ])
    expect(wrong.fields.phone).toEqual({
      _tag: 'Invalid',
      value: 'call me',
      errors: ['Digits only'],
    })
    expect(submittedValue(wrong)).toBeUndefined()
    expect(
      submittedValue(
        typed([
          ['name', 'Ada'],
          ['phone', '123'],
          ['age', '36'],
        ]),
      ),
    ).toEqual({ name: 'Ada', phone: '123', age: 36, nickname: Option.none() })
  })
})

describe('An Option key', () => {
  it('holds text as its draft', () => {
    expectTypeOf(ContactForm.initial.fields.nickname.value).toEqualTypeOf<string>()
    // Never called: the Message constructor would refuse it at runtime too.
    // @ts-expect-error a draft is text, not the Option it submits
    const _refused = () => Message.Changed({ key: 'nickname', value: Option.some('Ace') })
  })

  it('is edited as what it holds, and submits Option.some', () => {
    expect(ContactForm.controls.find(control => control.key === 'nickname')?.control.kind).toBe(
      'Text',
    )
    const model = typed([
      ['name', 'Ada'],
      ['nickname', 'Ace'],
    ])
    expect(submittedValue(model)).toEqual({ name: 'Ada', nickname: Option.some('Ace') })
  })

  it('checks what it holds by the inner schema', () => {
    expect(typed([['nickname', 'A']]).fields.nickname._tag).toBe('Invalid')
  })

  it('is filled from an Option, none as the empty draft', () => {
    const filled = ContactForm.fill(ContactForm.initial, { nickname: Option.some('Ace') }).model
    expect(filled.fields.nickname.value).toBe('Ace')
    const emptied = ContactForm.fill(filled, { nickname: Option.none() }).model
    expect(emptied.fields.nickname.value).toBe('')
  })
})

describe('A blur that changes nothing', () => {
  it.each(['phone', 'fax', 'age', 'nickname'] as const)(
    'on an empty %s returns the same Model',
    key => {
      const model = typed([['name', 'Ada']])
      expect(step(model, Message.Blurred({ key })).model).toBe(model)
    },
  )

  it('on a required key still says so', () => {
    expect(step(ContactForm.initial, Message.Blurred({ key: 'name' })).model.fields.name._tag).toBe(
      'Invalid',
    )
  })
})

describe('An optional nested key', () => {
  const Person = Entity.define('Person', Schema.Struct({ id: Schema.String, name: Schema.String }))
  const Team = Entity.define('Team', Schema.Struct({ id: Schema.String, title: Schema.String }))
  const Org = Entity.relate(
    { Person, Team },
    { Team: { lead: Relation.one(Person, { optional: true }) } },
  )
  const NewPerson = Entity.input(Org.Person, Schema.Struct({ name: Schema.String }))
  const NewTeam = Entity.input(
    Org.Team,
    Schema.Struct({ title: Schema.String, lead: Schema.optionalKey(NewPerson.schema) }),
    { lead: Relation.nested(Org.Team.relations.lead, NewPerson) },
  )
  const TeamForm = Form.make('Team', NewTeam, { nested: { lead: Form.make('Lead', NewPerson) } })

  it('starts with no row, and is left out of the value', () => {
    expect(TeamForm.rows(TeamForm.initial, 'lead')).toEqual([])
    const out = TeamForm.bundle.update(TeamForm.initial, TeamForm.Message.Submitted(), undefined)
    expect(out.outMessage?.value).toEqual({ title: '' })
    expect(TeamForm.partial(TeamForm.initial)).toEqual({ title: '' })
  })

  it('returns the same Model for a ValidatedAll that changes nothing', () => {
    const model = TeamForm.initial
    expect(TeamForm.bundle.update(model, TeamForm.Message.ValidatedAll(), undefined).model).toBe(
      model,
    )
  })

  it('returns the same Model for a blur in a row that changes nothing', () => {
    const model = TeamForm.bundle.update(
      TeamForm.initial,
      TeamForm.Message.RowAdded({ key: 'lead' }),
      undefined,
    ).model
    const [row] = TeamForm.rows(model, 'lead')
    const blurred = TeamForm.bundle.update(
      model,
      TeamForm.row('lead', row!.id).Blurred({ key: 'name' }),
      undefined,
    )
    expect(blurred.model).toBe(model)
  })
})
