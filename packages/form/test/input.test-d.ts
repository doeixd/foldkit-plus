/**
 * A plain form's input, `Form.input(schema)`: the keys and their values are the
 * schema's, as they are through an Entity defined from it.
 */
import { Option, Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Form, Input } from '../src/index.js'

const Search = Schema.Struct({ text: Schema.String, page: Schema.NumberFromString })
const SearchForm = Form.make('Search', Form.input(Search))

expectTypeOf<(typeof SearchForm.controls)[number]['key']>().toEqualTypeOf<'text' | 'page'>()
// By key, each control is typed by its own key, and only the form's keys are there.
expectTypeOf(SearchForm.controlsByKey.page.key).toEqualTypeOf<'page'>()
expectTypeOf(SearchForm.controlsByKey.text.label).toEqualTypeOf<string>()
// @ts-expect-error a key the schema does not have
void SearchForm.controlsByKey.query
expectTypeOf(SearchForm.value(SearchForm.initial)).toEqualTypeOf<
  Option.Option<{ readonly text: string; readonly page: number }>
>()
// @ts-expect-error a key the schema does not have
SearchForm.Message.Changed({ key: 'query', value: 'x' })

// Its members are the schema's own, so the Model holds a draft per key.
expectTypeOf<keyof (typeof SearchForm.initial)['fields']>().toEqualTypeOf<'text' | 'page'>()

// A kind's data types how a draft is read and how a value is shown.
const Cents = Input.kind<{ readonly scale: number }>('Cents', {
  draft: 'text',
  parse: (draft, data) => Number(draft) * 10 ** data.scale,
  format: (value, data) => (Number(value) / 10 ** data.scale).toFixed(data.scale),
})
Cents.of({ scale: 2 })
// @ts-expect-error a Cents control needs the scale its draft is read with
Cents.of({})
// @ts-expect-error a format is text
Input.kind('Bad', { draft: 'text', format: () => 1 })

// A choice group's options are the values it may hold; its draft is each as text.
const Picks = Input.kind<{ readonly options: ReadonlyArray<string> }>('Picks', {
  draft: 'list',
  parseList: (draft, data) => draft.filter(text => data.options.includes(text)),
})
Picks.of({ options: ['a'] })
// @ts-expect-error a choice group's options are text or numbers
Input.choices([{}])

// A hook a kind's draft can never reach does not compile: `parse` and `format`
// read and write a text draft, `parseList` a list draft.
Input.kind(
  'Listed',
  // @ts-expect-error parse reads a text draft, and this kind holds a list
  { draft: 'list', parse: (draft: string) => draft },
)
Input.kind(
  'Listed',
  // @ts-expect-error format writes a text draft, and this kind holds a list
  { draft: 'list', format: () => '' },
)
Input.kind(
  'Flagged',
  // @ts-expect-error parseList reads a list draft, and this kind holds a flag
  { draft: 'flag', parseList: (draft: ReadonlyArray<string>) => draft },
)
