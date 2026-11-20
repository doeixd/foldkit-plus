import { Form } from 'foldkit-form'
import { Declared } from 'foldkit-form/metakit'
import { Schema } from 'effect'
import { FormView } from '../src/index.js'
import { Edit } from './fixture.js'
import { declared, Stay } from './declaredFixture.js'

// `Declared.of(form)` of the same form is what the view takes.
FormView.define(Stay, { declared })
FormView.fields(Stay, { declared })
FormView.field(Stay, { declared })

// The declared form of another form is refused: its keys are not this form's.
const Other = Form.make('Other', Form.input(Schema.Struct({ title: Schema.String })))
// @ts-expect-error the keys of `Other` are not the keys of `Stay`
FormView.define(Stay, { declared: Declared.of(Other) })
