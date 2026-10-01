import { Schema } from 'effect'
import { Style } from 'foldkit-mixins'
import { InputSlots } from 'foldkit-mixins-ui'
import { defineMessageUnion } from 'foldkit/message'
import { field } from 'foldkit-mixins-form/ui'

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
