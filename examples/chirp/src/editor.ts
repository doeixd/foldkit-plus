/** Editing a chirp: the form and the write it feeds, joined by Crud. */
import { Bundle } from 'foldkit-bundle'
import { Crud } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Style } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import * as UiForm from 'foldkit-mixins-form/ui'
import { Post } from './guard.js'
import { EditInput, EditPost } from './operations.js'
import { FieldStyle, FormStyle, TextareaStyle } from './style.js'

// #region crud
export const EditForm = Form.make('EditPost', Entity.input(Post, EditInput), {
  inputs: { id: Input.hidden(), body: Input.multiline() },
})

export const Editor = Crud.editor('PostEditor', {
  form: EditForm,
  mutation: EditPost,
})
// #endregion

const EditField = FormView.field(EditForm, {
  renderers: UiForm.renderers({ textarea: TextareaStyle }),
}).pipe(Style.attach(FieldStyle))
const EditView = FormView.define(EditForm, { field: EditField }).pipe(Style.attach(FormStyle))
const Drawn = Editor.bundle.pipe(
  Bundle.withView(Crud.editorView(FormView.submodel(EditForm, EditView))),
)
export const Editing = Bundle.declare(Drawn, 'editor')
