import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'
import { wordsOf } from './words.js'

/**
 * The shell around a control that is already drawn: its label (with the mark
 * of a required or optional field, and anything beside it), a description
 * and the errors under it. A shell owns no state and draws no control, so
 * label, description, errors and orientation are one widget and not an option
 * on each field.
 */
export const FieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The row holding the label and `labelAside`. */
  header: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  marker: Slot.make({ capability: Capability.Container }),
  labelAside: Slot.make({ capability: Capability.Container }),
  /** Holds the control the application drew. */
  control: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  errors: Slot.make({ capability: Capability.Container }),
  error: Slot.make({ capability: Capability.Container }),
})

export interface FieldWords {
  /** The mark of a required field, hidden from assistive technology: the control says it is required. */
  readonly required: string
  /** The words after the label of an optional field, read with it. */
  readonly optional: string
}

/** The defaults, in English. */
export const words: FieldWords = { required: '*', optional: '(optional)' }

/** The id the shell gives the description of the control `id`. */
export const descriptionId = (id: string): string => `${id}-description`

/** The id the shell gives the errors of the control `id`. */
export const errorsId = (id: string): string => `${id}-errors`

/**
 * The `aria-describedby` for the control `id`, given what the shell draws: its
 * description, and its errors while there are any; none when it draws neither.
 * A control drawn before the shell cannot know them, so it takes these
 * attributes (`Input.view`'s `attributes: { input }`, or `h.input([...])`).
 */
export const describedBy = <Message>(
  h: HtmlBuilder<Message>,
  id: string,
  drawn: { readonly description?: boolean | undefined; readonly errors?: boolean | undefined },
): ReadonlyArray<Attribute<Message>> => {
  const ids = [
    ...(drawn.description === true ? [descriptionId(id)] : []),
    ...(drawn.errors === true ? [errorsId(id)] : []),
  ]
  return ids.length === 0 ? [] : [h.AriaDescribedBy(ids.join(' '))]
}

interface FieldCommon<Message> {
  /** The id of the control, which the label names; the control draws it. */
  readonly id: string
  readonly label: string
  /** The control, drawn by the application with `id`, and `describedBy` if it should be linked. */
  readonly control: Html
  readonly description?: string | undefined
  /** What is wrong, one line each: drawn as a list under the control, and `data-invalid` on the shell. */
  readonly errors?: ReadonlyArray<string> | undefined
  /** `vertical` stacks the label over the control; `horizontal` puts them side by side. Default `vertical`. */
  readonly orientation?: 'vertical' | 'horizontal' | undefined
  /** Beside the label, at its end: a link, a count, a help icon. */
  readonly labelAside?: Html | undefined
  readonly words?: Partial<FieldWords> | undefined
  /** A style of `FieldSlots`, for the shell's look. */
  readonly style?: NamedStyle<typeof FieldSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** A field is required or optional, never both. */
export type FieldView<Message> = FieldCommon<Message> &
  (
    | { readonly required?: boolean | undefined; readonly optional?: undefined }
    | { readonly optional?: boolean | undefined; readonly required?: undefined }
  )

export const view = <Message>(options: FieldView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    FieldSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const text = wordsOf(words, options.words)
  const errors = options.errors ?? []
  const marker =
    options.required === true
      ? [
          ' ',
          h.span(builders.marker.attrs([h.AriaHidden(true), h.DataAttribute('kind', 'required')]), [
            text.required,
          ]),
        ]
      : options.optional === true
        ? [
            ' ',
            h.span(builders.marker.attrs([h.DataAttribute('kind', 'optional')]), [text.optional]),
          ]
        : []
  const label = h.label(builders.label.attrs([h.For(options.id)]), [options.label, ...marker])
  return h.div(
    builders.root.attrs([
      h.DataAttribute('orientation', options.orientation ?? 'vertical'),
      ...(errors.length === 0 ? [] : [h.DataAttribute('invalid', '')]),
    ]),
    [
      options.labelAside === undefined
        ? label
        : h.div(builders.header.attrs(), [
            label,
            h.span(builders.labelAside.attrs(), [options.labelAside]),
          ]),
      h.div(builders.control.attrs(), [options.control]),
      ...(options.description === undefined
        ? []
        : [
            h.p(builders.description.attrs([h.Id(descriptionId(options.id))]), [
              options.description,
            ]),
          ]),
      ...(errors.length === 0
        ? []
        : [
            h.ul(
              builders.errors.attrs([h.Id(errorsId(options.id)), h.Role('alert')]),
              errors.map(error => h.li(builders.error.attrs([h.Key(error)]), [error])),
            ),
          ]),
    ],
  )
}
