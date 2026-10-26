import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { Style } from 'foldkit-mixins'
import { FormView } from 'foldkit-mixins-form'
import { InputSlots, TextareaSlots } from 'foldkit-mixins-ui'
import { defineMessageUnion } from 'foldkit/message'
import { field, renderers } from 'foldkit-mixins-form/ui'

const FormMessage = defineMessageUnion({ Changed: { value: Schema.String } })
const ParentMessage = defineMessageUnion({ GotForm: { message: FormMessage } })
const inputStyle = Style.forSlots(InputSlots)({})

field<typeof FormMessage.Type, typeof ParentMessage.Type>({
  inputStyle,
  toMessage: message => ParentMessage.GotForm({ message }),
})

field<typeof FormMessage.Type, typeof ParentMessage.Type>({
  inputStyle,
  // @ts-expect-error the wrapper must accept the form's Message, not a protocol value
  toMessage: (_message: number) =>
    ParentMessage.GotForm({ message: FormMessage.Changed({ value: '' }) }),
})

field<typeof FormMessage.Type, typeof ParentMessage.Type>({
  inputStyle,
  // @ts-expect-error the wrapper must return a parent Message
  toMessage: message => message,
})

// The table's Message comes from the form it is drawn for, with no annotation.
const Pick = Form.make('Pick', Form.input(Schema.Struct({ name: Schema.String })))
FormView.define(Pick, { renderers: renderers() })
FormView.define(Pick, {
  renderers: renderers({ textarea: Style.forSlots(TextareaSlots)({}) }),
})
