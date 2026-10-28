/**
 * The two forms: adding a note, and editing one through Crud's editor, which
 * loads the note, fills the form, saves through the declared write and says
 * how the save went. Both draw with the shipped form recipes.
 */
import { Bundle } from 'foldkit-plus/bundle'
import { Crud } from 'foldkit-plus/crud'
import { Entity } from 'foldkit-plus/entity'
import { Form, Input } from 'foldkit-plus/form'
import { Style } from 'foldkit-plus/mixins'
import { FormView } from 'foldkit-plus/mixins-form'
import { Note } from './guard.js'
import { EditNote, NoteDraft, NoteEdit } from './operations.js'
import { FieldStyle, FormStyle } from './style.js'

export const AddForm = Form.make('AddNote', Entity.input(Note, NoteDraft), {
  inputs: { body: Input.multiline() },
})

const AddView = FormView.define(AddForm, {
  field: FormView.field(AddForm).pipe(Style.attach(FieldStyle)),
}).pipe(Style.attach(FormStyle))

export const Adding = Bundle.declare(
  AddForm.bundle.pipe(Bundle.withView(FormView.submodel(AddForm, AddView))),
  'add',
)

export const EditForm = Form.make('EditNote', Entity.input(Note, NoteEdit), {
  inputs: { id: Input.hidden(), body: Input.multiline() },
})

export const Editor = Crud.editor('NoteEditor', { form: EditForm, mutation: EditNote })

const EditView = FormView.define(EditForm, {
  field: FormView.field(EditForm).pipe(Style.attach(FieldStyle)),
}).pipe(Style.attach(FormStyle))

export const Editing = Bundle.declare(
  Editor.bundle.pipe(Bundle.withView(Crud.editorView(FormView.submodel(EditForm, EditView)))),
  'editor',
)
