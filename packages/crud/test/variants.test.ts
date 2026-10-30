/**
 * An editor over a variant Entity's form (#357): it loads the row as its case,
 * which fills the form's keys of that case alone.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Crud } from '../src/index.js'

const Domain = Entity.defineVariants('Domain', {
  Available: { id: Schema.String, name: Schema.String, price: Schema.Finite },
  Unconfirmed: { id: Schema.String, name: Schema.String },
})
const ListInput = Schema.Struct({
  id: Schema.String,
  _tag: Domain.fields._tag.schema,
  name: Schema.String,
  price: Schema.optionalKey(Schema.Finite),
})
const Listing = Form.make('Listing', Entity.input(Domain, ListInput))
const Editor = Crud.editor('DomainEditor', {
  form: Listing,
  mutation: Mutation.make('ListDomain', { Input: ListInput, Output: { id: Schema.String } }),
  locks: { select: { name: true }, locked: () => false },
})

describe('an editor over a variant Entity', () => {
  it('loads each row as its case, and fills only that case’s keys', () => {
    const read = Schema.decodeUnknownSync(Editor.selection.schema)
    const unconfirmed = read({ _tag: 'Unconfirmed', id: 'd2', name: 'b.dev', price: null })
    expect(unconfirmed).toEqual({ _tag: 'Unconfirmed', id: 'd2', name: 'b.dev' })
    expect(Entity.valuesFor(Listing.input, unconfirmed)).toEqual({
      id: 'd2',
      _tag: 'Unconfirmed',
      name: 'b.dev',
    })
    expect(read({ _tag: 'Available', id: 'd1', name: 'a.dev', price: 5 })).toEqual({
      _tag: 'Available',
      id: 'd1',
      name: 'a.dev',
      price: 5,
    })
  })
})
