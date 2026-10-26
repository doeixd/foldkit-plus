// @vitest-environment jsdom
/**
 * The text-shaped recipes, through a real form and their plain renderers: what
 * each takes and keeps as typed, what it refuses, and what its input tells the
 * browser and a phone's keyboard.
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { FieldRecipes } from '../src/index.js'
import { renderers } from '../src/html.js'

const Filled = Schema.String.check(Schema.isMinLength(1))
const Account = Form.make(
  'Account',
  Form.input(
    Schema.Struct({
      email: Filled,
      site: Filled,
      phone: Filled,
      password: Filled,
      newPassword: Filled,
      title: Filled,
      slug: Filled,
    }),
  ),
  {
    inputs: {
      email: FieldRecipes.email().control,
      site: FieldRecipes.url().control,
      phone: FieldRecipes.tel().control,
      password: FieldRecipes.password({ purpose: 'current' }).control,
      newPassword: FieldRecipes.password({ purpose: 'new' }).control,
      slug: FieldRecipes.slug('title', { prefix: '/blog/' }).control,
    },
  },
)
type Key = (typeof Account.controls)[number]['key']
type Model = typeof Account.initial

const send = (model: Model, ...messages: ReadonlyArray<typeof Account.Message.Type>): Model =>
  messages.reduce((at, message) => Account.bundle.update(at, message, undefined).model, model)
const typed = (key: Key, draft: string) =>
  send(
    Account.initial,
    Account.Message.Changed({ key, value: draft }),
    Account.Message.Blurred({ key }),
  )
const errorOf = (key: Key, draft: string) => {
  const field = Account.field(typed(key, draft), key)
  return field._tag === 'Invalid' ? field.errors : []
}
const valueOf = (key: Key, draft: string) =>
  Account.field(typed(key, draft), key)._tag === 'Valid' ? draft : undefined

describe('FieldRecipes.email', () => {
  it.each(['ada@example.com', 'Ada.Lovelace+notes@Example.COM', 'ada@localhost'])(
    'keeps %s as typed',
    draft => expect(valueOf('email', draft)).toBe(draft),
  )
  it.each(['ada', 'ada@', '@example.com', 'ada lovelace@example.com', 'ada@@example.com'])(
    'refuses %s',
    draft => expect(errorOf('email', draft)).toEqual(['Enter an email address']),
  )
})

describe('FieldRecipes.url', () => {
  it.each(['https://example.com', 'http://example.com/a?b=c#d'])('keeps %s as typed', draft =>
    expect(valueOf('site', draft)).toBe(draft),
  )
  it.each(['example.com', 'javascript:alert(1)', 'ftp://example.com', 'https//example.com'])(
    'refuses %s',
    draft => expect(errorOf('site', draft)).toEqual(['Enter a web address, starting https://']),
  )
  it('takes another scheme when it is named', () => {
    const { control } = FieldRecipes.url({ protocols: ['ftp:'] })
    expect(control.parse!('ftp://example.com', control.data)).toBe('ftp://example.com')
    expect(control.parse!('https://example.com', control.data)).toBeUndefined()
  })
})

describe('FieldRecipes.tel and password', () => {
  it.each(['+44 20 7946 0958', '(555) 010-9999 ext. 12'])('keep %s as typed', draft =>
    expect(valueOf('phone', draft)).toBe(draft),
  )
  it('never shows a password in a list', () => {
    expect(FieldRecipes.password({ purpose: 'new' }).display.shown).toBe(false)
    expect(FieldRecipes.email().display.shown).toBe(true)
  })
})

describe('FieldRecipes.slug', () => {
  it('follows its key until it is written', () => {
    const titled = send(
      Account.initial,
      Account.Message.Changed({ key: 'title', value: 'Écoles du Monde!' }),
    )
    expect(titled.fields.slug.value).toBe('ecoles-du-monde')
    const written = send(
      titled,
      Account.Message.Changed({ key: 'slug', value: 'schools' }),
      Account.Message.Changed({ key: 'title', value: 'Something else' }),
    )
    expect(written.fields.slug.value).toBe('schools')
  })

  it('does not follow a stored slug', () => {
    const filled = Account.fill(Account.initial, { title: 'Old title', slug: 'kept' }).model
    expect(
      send(filled, Account.Message.Changed({ key: 'title', value: 'New title' })).fields.slug.value,
    ).toBe('kept')
  })
})

describe('the plain renderers of the text-shaped recipes', () => {
  const root = FormView.define(Account, { renderers: renderers() })(
    { model: Account.initial, errors: [], canSubmit: false },
    SlotView.inertBuilder(),
  )
  const input = (key: Key) =>
    Inert.byTag(root, 'input').find(node => Inert.value(node, 'name') === key)
  const read = (key: Key, attributes: ReadonlyArray<string>) =>
    attributes.map(attribute => Inert.value(input(key), attribute))
  const keyboard = ['type', 'autocomplete', 'autocapitalize', 'spellcheck']

  it('tell the browser and the keyboard what each key holds', () => {
    expect(read('email', keyboard)).toEqual(['email', 'email', 'none', 'false'])
    expect(read('site', keyboard)).toEqual(['url', 'url', 'none', 'false'])
    expect(read('phone', ['type', 'autocomplete', 'inputmode'])).toEqual(['tel', 'tel', 'tel'])
    expect(read('password', keyboard)).toEqual(['password', 'current-password', 'none', 'false'])
    expect(read('newPassword', ['autocomplete'])).toEqual(['new-password'])
  })

  it('draw a slug after its address, with the field’s name and id', () => {
    expect(read('slug', ['id', 'type', 'autocomplete'])).toEqual(['Account-slug', 'text', 'off'])
    const group = Inert.all(root).find(
      node =>
        node.sel === 'div' && Inert.byTag(node, 'input').some(child => child === input('slug')),
    )
    expect(Inert.text(Inert.byTag(group, 'span')[0])).toBe('/blog/')
  })
})
