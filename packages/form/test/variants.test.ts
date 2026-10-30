/**
 * A form over a variant Entity's input (#357): `_tag` is the case picker, and
 * a key of a field only some cases have is asked, validated and submitted only
 * once one of those cases is chosen.
 */
import { Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'

const Price = Schema.Finite
const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, price: Price },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})
const ListDomain = Entity.input(
  Domain,
  Schema.Struct({
    _tag: Domain.fields._tag.schema,
    name: Schema.String.check(Schema.isMinLength(1)),
    price: Schema.optionalKey(Price),
  }),
)
const Listing = Form.make('Listing', ListDomain)

type Model = typeof Listing.initial
type Message = typeof Listing.Message.Type

const run = (messages: ReadonlyArray<Message>) =>
  messages.reduce<{ readonly model: Model; readonly outMessage?: unknown }>(
    (state, message) => Listing.bundle.update(state.model, message, undefined),
    { model: Listing.initial },
  )
const changed = (key: 'name' | 'price' | '_tag', value: string) =>
  Listing.Message.Changed({ key, value })

describe('a form over a variant Entity', () => {
  it('chooses the case by _tag, and shows a case’s keys only in it', () => {
    expect(Option.isNone(Listing.chosen(Listing.initial))).toBe(true)
    expect(Listing.shows(Listing.initial, 'price')).toBe(false)
    expect(Listing.shows(Listing.initial, 'name')).toBe(true)
    const { model } = run([changed('_tag', 'Available')])
    expect(Listing.chosen(model)).toEqual(Option.some('Available'))
    expect(Listing.shows(model, 'price')).toBe(true)
    expect(Listing.shows(run([changed('_tag', 'Unconfirmed')]).model, 'price')).toBe(false)
  })

  it('requires a case’s own key in that case', () => {
    const { model, outMessage } = run([
      changed('_tag', 'Available'),
      changed('name', 'a.dev'),
      Listing.Message.Submitted(),
    ])
    expect(outMessage).toBeUndefined()
    expect(Listing.field(model, 'price')._tag).toBe('Invalid')
  })

  it('submits the chosen case’s keys alone', () => {
    expect(
      run([
        changed('_tag', 'Available'),
        changed('name', 'a.dev'),
        changed('price', '12'),
        Listing.Message.Submitted(),
      ]).outMessage,
    ).toEqual({ _tag: 'Submitted', value: { _tag: 'Available', name: 'a.dev', price: 12 } })
    // A price typed before the case changed is another case's, and is left out.
    expect(
      run([
        changed('_tag', 'Available'),
        changed('price', 'not a number'),
        changed('_tag', 'Unconfirmed'),
        changed('name', 'b.dev'),
        Listing.Message.Submitted(),
      ]).outMessage,
    ).toEqual({ _tag: 'Submitted', value: { _tag: 'Unconfirmed', name: 'b.dev' } })
  })

  it('refuses a key of some cases the input does not let another case leave out', () => {
    const Required = Entity.input(
      Domain,
      Schema.Struct({ _tag: Domain.fields._tag.schema, name: Schema.String, price: Price }),
    )
    expect(() => Form.make('Required', Required)).toThrow(
      '"price" is a field of some cases of Domain; declare it Schema.optionalKey',
    )
  })

  it('asks every key of a form over a plain Entity', () => {
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String, name: Schema.String }))
    const form = Form.make('Plain', Entity.input(Plain, Schema.Struct({ name: Schema.String })))
    expect(form.shows(form.initial, 'name')).toBe(true)
    expect(Option.isNone(form.chosen(form.initial))).toBe(true)
  })
})
