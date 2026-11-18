import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'
import { wordsOf } from './words.js'

/**
 * A form label publishes the label, the `marker` that says a field is
 * required or optional, and, with a `trailing` drawing beside it, the `root`
 * that holds both; it owns no state, messages, or bundles. It names a control
 * through `for`: pass the id `FieldAssociation` derived, never a second
 * naming scheme beside it.
 */
export const LabelSlots = Slots.define({
  label: Slot.make({ capability: Capability.Container }),
  marker: Slot.make({ capability: Capability.Container }),
  trailing: Slot.make({ capability: Capability.Container }),
  root: Slot.make({ capability: Capability.Container }),
})

export interface LabelWords {
  /** The mark of a required field. Hidden from assistive technology: the control says it is required. */
  readonly required: string
  /** The words after the text of an optional field. Read with the label. */
  readonly optional: string
}

/** The defaults, in English: text with `{blanks}`, as the other widgets' words. */
export const words: LabelWords = { required: '*', optional: '(optional)' }

interface LabelCommon<Message> {
  /** The id of the control this labels. */
  readonly for: string
  readonly text: string
  /**
   * The control is off: `data-disabled`, for the recipe's dimmed look. It
   * does not disable anything; the control carries its own state.
   */
  readonly disabled?: boolean | undefined
  /** The control is refused: `data-invalid`, for the error ink. */
  readonly invalid?: boolean | undefined
  /**
   * A drawing beside the label, after it: a help icon, a count, a badge. It
   * stands next to the label and not inside it, so an interactive one (a
   * button that opens a tooltip) is not part of what names the control.
   */
  readonly trailing?: Html | undefined
  /** A style of `LabelSlots`, for the label's look. */
  readonly style?: NamedStyle<typeof LabelSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
  /** The marker's words. */
  readonly words?: Partial<LabelWords> | undefined
}

/**
 * A label in one call: the control it names, its words, a style for its
 * slots, and mixins beside the style. A field is required or optional, never
 * both. No upstream component stands behind it.
 */
export type LabelView<Message = never> = LabelCommon<Message> &
  (
    | { readonly required?: boolean | undefined; readonly optional?: undefined }
    | { readonly optional?: boolean | undefined; readonly required?: undefined }
  )

export const view = <Message = never>(
  options: LabelView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    LabelSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const text = wordsOf(words, options.words)
  const marker =
    options.required === true
      ? [
          h.span(builders.marker.attrs([h.AriaHidden(true), h.DataAttribute('kind', 'required')]), [
            text.required,
          ]),
        ]
      : options.optional === true
        ? [h.span(builders.marker.attrs([h.DataAttribute('kind', 'optional')]), [text.optional])]
        : []
  const label = h.label(
    builders.label.attrs([
      h.For(options.for),
      ...(options.disabled === true ? [h.DataAttribute('disabled', '')] : []),
      ...(options.invalid === true ? [h.DataAttribute('invalid', '')] : []),
    ]),
    // A space, since a name is made of the text nodes and an inline span adds none.
    [options.text, ...(marker.length === 0 ? [] : [' ', ...marker])],
  )
  return options.trailing === undefined
    ? label
    : h.div(builders.root.attrs(), [label, h.span(builders.trailing.attrs(), [options.trailing])])
}
