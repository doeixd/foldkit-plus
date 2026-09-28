/**
 * A `@foldkit/ui` Textarea's bundles through the Textarea adapter, as
 * `h.textarea` takes them.
 */
import type { HtmlBuilder } from 'foldkit/html'

import type { Textarea as UiTextarea } from '@foldkit/ui'
import { Textarea } from 'foldkit-mixins-ui'

import { FieldTextareaStyle } from './style/field.js'

// `Textarea.resolve` types the control's bundle as `SlotAttributes`, which
// drops the textarea-only attribute type `h.textarea` requires, so the
// resolved control is cast back to what `h.textarea` takes.
export const resolveTextarea = <Message>(
  attributes: UiTextarea.TextareaAttributes<Message>,
  h: HtmlBuilder<Message>,
) => {
  const field = Textarea.resolve(attributes, [FieldTextareaStyle.mixin], { input: undefined, h })

  return {
    ...field,
    textarea: field.textarea as Parameters<typeof h.textarea>[0],
  }
}
