import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A password field with a toggle that shows the password as text, Zag's
 * password input: the toggle is a button outside the form's submission,
 * named for what it does and `aria-pressed` while the text shows, as the
 * APG's toggle button keeps its name and changes its state. The text and
 * whether it shows are the application's.
 */
export const PasswordInputSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input],
    attributes: [Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  toggle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaPressed, Attr.Disabled],
  }),
  description: Slot.make({ capability: Capability.Container }),
})

export interface PasswordInputView<Message> {
  /** Prefixes every id the field draws, unique on the page. */
  readonly id: string
  readonly label: string
  readonly value: string
  /** The Message for the text typed; its type comes from `h`. */
  readonly onInput: (value: string) => NoInfer<Message>
  /** Whether the password shows as text. */
  readonly visible: boolean
  readonly onToggle: NoInfer<Message>
  /** What the browser offers to fill: a saved password, or a new one to make; default `current-password`. */
  readonly autocomplete?: 'current-password' | 'new-password' | undefined
  /** The toggle's name, the same shown or hidden; default `Show password`. */
  readonly toggleLabel?: string | undefined
  readonly description?: string | undefined
  readonly placeholder?: string | undefined
  readonly invalid?: boolean | undefined
  readonly disabled?: boolean | undefined
  /** A style of `PasswordInputSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof PasswordInputSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message>(
  options: PasswordInputView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    PasswordInputSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const disabled = options.disabled === true
  const inputId = `${options.id}-input`
  const descriptionId = `${options.id}-description`
  return h.div(builders.root.attrs(), [
    h.label(builders.label.attrs([h.For(inputId)]), [options.label]),
    h.div(builders.group.attrs(), [
      h.input(
        builders.input.attrs([
          h.Id(inputId),
          h.Type(options.visible ? 'text' : 'password'),
          h.Value(options.value),
          h.Autocomplete(options.autocomplete ?? 'current-password'),
          // Shown as text, a password must not be checked, corrected or capitalized.
          h.Spellcheck(false),
          h.Autocapitalize('off'),
          h.Attribute('autocorrect', 'off'),
          ...(options.placeholder === undefined ? [] : [h.Placeholder(options.placeholder)]),
          ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
          ...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),
          ...(disabled ? [h.Disabled(true)] : [h.OnInput(options.onInput)]),
        ]),
      ),
      h.button(
        builders.toggle.attrs([
          h.Type('button'),
          h.AriaLabel(options.toggleLabel ?? 'Show password'),
          h.AriaPressed(String(options.visible)),
          h.AriaControls(inputId),
          ...(disabled ? [h.Disabled(true)] : [h.OnClick(options.onToggle)]),
        ]),
        [],
      ),
    ]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs([h.Id(descriptionId)]), [options.description])]),
  ])
}
