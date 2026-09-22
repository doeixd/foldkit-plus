// The README's snippets, compiled. Keep the two in step.
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import type * as Submodel from 'foldkit/submodel'
import { expectTypeOf } from 'vitest'
import {
  FieldSlots,
  FormSlots,
  FormView,
  type FieldInput,
  type FormViewInputs,
} from '../src/index.js'
import { Edit } from './fixture.js'

const Field = FormView.field(Edit).pipe(
  Style.attach(
    Style.forSlots(FieldSlots)({
      root: Style.class('field'),
      text: Style.whenInput<FieldInput>(input => input.invalid, Style.class('is-invalid')),
    }),
  ),
)

const View = FormView.define(Edit, { field: Field }).pipe(
  Style.attach(Style.forSlots(FormSlots)({ root: Style.class('form') })),
)

const Drawn = Edit.bundle.pipe(Bundle.withView(FormView.submodel(Edit, View)))

type Key = (typeof Edit.controls)[number]['key']
expectTypeOf(Drawn.view).toExtend<
  | Submodel.View<
      ReturnType<typeof Edit.bundle.init>['model'],
      typeof Edit.Message.Type,
      FormViewInputs<Key>
    >
  | undefined
>()

const inputs: FormViewInputs<Key> = {
  options: { editorId: [{ value: 'a1', label: 'Ada' }] },
  words: { submit: 'Save' },
}
void inputs
// @ts-expect-error options are keyed by the form's keys
const wrong: FormViewInputs<Key> = { options: { author: [] } }
void wrong

{
  const Drawn = Edit.bundle.pipe(Bundle.withView(FormView.submodel(Edit, FormView.define(Edit))))
  void Drawn
}
