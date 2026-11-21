import { Form } from 'foldkit-form'
import { Declared } from 'foldkit-form/metakit'
import { Schema } from 'effect'
import { DeclaredView } from '../src/declared.js'
import { FormView } from '../src/index.js'
import { declared, stay, Stay } from './declaredFixture.js'

// What `DeclaredView.of` gives is what the form view takes, the form's own type kept.
FormView.fields(stay.form, stay.options)
FormView.field(stay.form, stay.options)
FormView.define(stay.form, { renderers: stay.options.renderers })
const _form: typeof Stay = stay.form

// The declared form of another form is refused: its keys are not this form's.
const Other = Form.make('Other', Form.input(Schema.Struct({ title: Schema.String })))
// @ts-expect-error the keys of `Other` are not the keys of `Stay`
DeclaredView.of(Stay, Declared.of(Other))

// Attrs are by the form's keys.
DeclaredView.of(Stay, declared, { attrs: { deposit: { type: 'number' } } })
// @ts-expect-error `total` is not a key of the form
DeclaredView.of(Stay, declared, { attrs: { total: { type: 'number' } } })
