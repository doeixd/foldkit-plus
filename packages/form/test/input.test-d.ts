/**
 * A plain form's input, `Form.input(schema)`: the keys and their values are the
 * schema's, as they are through an Entity defined from it.
 */
import { Option, Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Form } from '../src/index.js'

const Search = Schema.Struct({ text: Schema.String, page: Schema.NumberFromString })
const SearchForm = Form.make('Search', Form.input(Search))

expectTypeOf<(typeof SearchForm.controls)[number]['key']>().toEqualTypeOf<'text' | 'page'>()
expectTypeOf(SearchForm.value(SearchForm.initial)).toEqualTypeOf<
  Option.Option<{ readonly text: string; readonly page: number }>
>()
// @ts-expect-error a key the schema does not have
SearchForm.Message.Changed({ key: 'query', value: 'x' })

// Its members are the schema's own, so the Model holds a draft per key.
expectTypeOf<keyof (typeof SearchForm.initial)['fields']>().toEqualTypeOf<'text' | 'page'>()
