/** The compose form: built from the write's input, drawn with the UI kit. */
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Style } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import * as UiForm from 'foldkit-mixins-form/ui'
import { Post } from './guard.js'
import { NewPost } from './operations.js'
import { FieldStyle, FormStyle, TextareaStyle } from './style.js'

// #region form
export const Compose = Form.make('Compose', Entity.input(Post, NewPost), {
  inputs: {
    id: Input.hidden(),
    body: Input.multiline(),
  },
})
// #endregion

// #region form-view
const ComposeField = FormView.field(Compose, {
  renderers: UiForm.renderers({ textarea: TextareaStyle }),
  attrs: { body: { placeholder: "What's happening?", rows: 2 } },
}).pipe(Style.attach(FieldStyle))
const ComposeView = FormView.define(Compose, { field: ComposeField }).pipe(Style.attach(FormStyle))
const Drawn = Compose.bundle.pipe(Bundle.withView(FormView.submodel(Compose, ComposeView)))
export const Composer = Bundle.declare(Drawn, 'compose')
// #endregion
