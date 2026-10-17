import { Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import * as Meter from './meter.js'
import type { MixinList } from './resolve.js'

/**
 * A password field with a toggle that shows the password as text, Zag's
 * password input: the toggle is a button outside the form's submission,
 * named for what it does and `aria-pressed` while the text shows, as the
 * APG's toggle button keeps its name and changes its state. The text and
 * whether it shows are the application's, as are the three aids a new
 * password wants: a strength Meter, a list of requirements each met or not,
 * and a hint while Caps Lock is on, each read with the input.
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
  /** Holds the strength Meter, which brings its own slots. */
  strength: Slot.make({ capability: Capability.Container }),
  requirements: Slot.make({ capability: Capability.Container }),
  requirement: Slot.make({ capability: Capability.Container }),
  /** A requirement's state in words, for a reader who cannot see its mark. */
  requirementState: Slot.make({ capability: Capability.Container }),
  capsLock: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

/** One rule a new password must keep, and whether the text keeps it. */
export interface Requirement {
  readonly label: string
  readonly met: boolean
}

/**
 * What a key says of Caps Lock: a letter in the case Shift did not ask for
 * means it is on, the other case that it is off, and any other key nothing.
 * Fold it over the flag the application keeps, so a key typed before the
 * hint is drawn still counts.
 */
export const capsLockOf = (key: string, modifiers: KeyboardModifiers): Option.Option<boolean> =>
  key.length === 1 && key.toLowerCase() !== key.toUpperCase()
    ? Option.some((key === key.toUpperCase()) !== modifiers.shiftKey)
    : Option.none()

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
  /** The strength Meter under the field, drawn by `Meter.view` with its own style. */
  readonly strength?: Meter.MeterView<NoInfer<Message>> | undefined
  /** The rules the password must keep, listed under the field. */
  readonly requirements?: ReadonlyArray<Requirement> | undefined
  /** A requirement's state, read after its label; default `met` and `not met`. */
  readonly requirementStates?: { readonly met: string; readonly unmet: string } | undefined
  /**
   * Whether Caps Lock is on, and the Message for what each key says of it
   * (`capsLockOf`); while on, a polite hint says so.
   */
  readonly capsLock?:
    | {
        readonly on: boolean
        readonly onKey: (reading: Option.Option<boolean>) => NoInfer<Message>
        /** Default `Caps Lock is on`. */
        readonly hint?: string | undefined
      }
    | undefined
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
  const requirementsId = `${options.id}-requirements`
  const capsLockId = `${options.id}-caps-lock`
  const { capsLock, requirements } = options
  const capsOn = capsLock?.on === true
  const describedBy = [
    ...(options.description === undefined ? [] : [descriptionId]),
    ...(requirements === undefined || requirements.length === 0 ? [] : [requirementsId]),
    ...(capsOn ? [capsLockId] : []),
  ]
  const states = options.requirementStates ?? { met: 'met', unmet: 'not met' }
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
          ...(describedBy.length === 0 ? [] : [h.AriaDescribedBy(describedBy.join(' '))]),
          ...(disabled
            ? [h.Disabled(true)]
            : [
                h.OnInput(options.onInput),
                ...(capsLock === undefined
                  ? []
                  : [h.OnKeyDown((key, modifiers) => capsLock.onKey(capsLockOf(key, modifiers)))]),
              ]),
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
    ...(capsLock === undefined
      ? []
      : [
          // Drawn always, so the region is in place before it speaks.
          h.p(
            builders.capsLock.attrs([h.Id(capsLockId), h.Role('status')]),
            capsOn ? [capsLock.hint ?? 'Caps Lock is on'] : [],
          ),
        ]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs([h.Id(descriptionId)]), [options.description])]),
    ...(options.strength === undefined
      ? []
      : [h.div(builders.strength.attrs(), [Meter.view(options.strength, h)])]),
    ...(requirements === undefined || requirements.length === 0
      ? []
      : [
          h.ul(
            builders.requirements.attrs([h.Id(requirementsId)]),
            requirements.map(requirement =>
              h.li(builders.requirement.attrs([h.DataAttribute('met', String(requirement.met))]), [
                requirement.label,
                h.span(builders.requirementState.attrs(), [
                  `, ${requirement.met ? states.met : states.unmet}`,
                ]),
              ]),
            ),
          ),
        ]),
  ])
}
