import { Option, Schema } from 'effect'
import {
  Attr,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotAttributes,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { AdornmentSlots, GROUP_MARK, sidesOf, type Adornments } from './adornments.js'
import { onInputOf, type OnInput } from './field.js'
import type { MixinList } from './resolve.js'
import { wordsOf } from './words.js'

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
  /** The row holding the label and `labelAside`. */
  header: Slot.make({ capability: Capability.Container }),
  labelAside: Slot.make({ capability: Capability.Container }),
  ...AdornmentSlots,
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  toggle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaPressed, Attr.Disabled],
  }),
  description: Slot.make({ capability: Capability.Container }),
  /** Holds the strength gauge the application draws, which brings its own slots. */
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

/** What the field draws that is no one use's content. */
export interface PasswordInputWords {
  /** The toggle's name, the same shown or hidden. */
  readonly toggle: string
  /** What the polite hint says while Caps Lock is on. */
  readonly capsLock: string
  /** A requirement's state, read after its label, when it is met. */
  readonly met: string
  /** And when it is not. */
  readonly unmet: string
}

/** The defaults, in English. */
export const words: PasswordInputWords = {
  toggle: 'Show password',
  capsLock: 'Caps Lock is on',
  met: 'met',
  unmet: 'not met',
}

/** Whether the password shows as text, and whether Caps Lock is on: what the field itself keeps. */
export const Model = Schema.Struct({ visible: Schema.Boolean, capsLock: Schema.Boolean })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The toggle was pressed. */
  Toggled: {},
  /** A key was typed: what it says of Caps Lock (`capsLockOf`); none changes nothing. */
  ReadCapsLock: { reading: Schema.Option(Schema.Boolean) },
})
export type Message = typeof Message.Type

/** Hidden, with Caps Lock off, unless `visible` says otherwise. */
export const init = (options: { readonly visible?: boolean | undefined } = {}): Model => ({
  visible: options.visible ?? false,
  capsLock: false,
})

/** The field after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Toggled: () => ({ model: modifyFields(model, { visible: visible => !visible }) }),
    ReadCapsLock: ({ reading }) =>
      Option.match(reading, {
        onNone: () => ({ model }),
        onSome: on =>
          on === model.capsLock
            ? { model }
            : { model: modifyFields(model, { capsLock: () => on }) },
      }),
  })

/**
 * The view's `visible`, `onToggle` and `capsLock` for a placed Model:
 * `PasswordInput.view({ id, label, value, onInput, ...PasswordInput.controls(model, onMessage) }, h)`.
 */
export const controls = <Outer>(model: Model, onMessage: (message: Message) => Outer) => ({
  visible: model.visible,
  onToggle: onMessage(Message.Toggled()),
  capsLock: {
    on: model.capsLock,
    onKey: (reading: Option.Option<boolean>) => onMessage(Message.ReadCapsLock({ reading })),
  },
})

export interface PasswordInputView<Message> extends Adornments {
  /** Prefixes every id the field draws, unique on the page. */
  readonly id: string
  readonly label: string
  readonly value: string
  /**
   * The Message for the text typed; its type comes from `h`. A resumable
   * builder's `OnInput` attribute (`rh.OnInput(Message.ChangedPassword)`)
   * names it in the server's markup.
   */
  readonly onInput: OnInput<NoInfer<Message>>
  /** Whether the password shows as text. */
  readonly visible: boolean
  readonly onToggle: NoInfer<Message>
  /** What the browser offers to fill: a saved password, or a new one to make; default `current-password`. */
  readonly autocomplete?: 'current-password' | 'new-password' | undefined
  /** Beside the label, at its end: a link to reset the password, say. */
  readonly labelAside?: Html | undefined
  readonly words?: Partial<PasswordInputWords> | undefined
  readonly description?: string | undefined
  readonly placeholder?: string | undefined
  readonly invalid?: boolean | undefined
  readonly disabled?: boolean | undefined
  /** The form field the password submits under. */
  readonly name?: string | undefined
  /** The field must be filled to submit: the native `required` and `aria-required`. */
  readonly required?: boolean | undefined
  /**
   * A strength gauge under the field, drawn by the application (`Meter.view`
   * with its own style), so a page with none ships no Meter.
   */
  readonly strength?: Html | undefined
  /** The rules the password must keep, listed under the field. */
  readonly requirements?: ReadonlyArray<Requirement> | undefined
  /**
   * Whether Caps Lock is on, and the Message for what each key says of it
   * (`capsLockOf`); while on, a polite hint says so.
   */
  readonly capsLock?:
    | {
        readonly on: boolean
        readonly onKey: (reading: Option.Option<boolean>) => NoInfer<Message>
      }
    | undefined
  /** A style of `PasswordInputSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof PasswordInputSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
  /**
   * Attributes added to a Slot before the mixins resolve, such as a
   * resumable builder's `KeepTyped` on the `input`.
   */
  readonly attributes?:
    | { readonly [K in keyof typeof PasswordInputSlots]?: SlotAttributes<NoInfer<Message>> }
    | undefined
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
  const attrs = (slot: keyof typeof PasswordInputSlots, base: SlotAttributes<Message> = []) =>
    builders[slot].attrs([...base, ...(options.attributes?.[slot] ?? [])])
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
  const text = wordsOf(words, options.words)
  const sides = sidesOf(h, { group: [], start: attrs('start'), end: attrs('end') }, options)
  const label = h.label(attrs('label', [h.For(inputId)]), [options.label])
  return h.div(attrs('root'), [
    options.labelAside === undefined
      ? label
      : h.div(attrs('header'), [label, h.span(attrs('labelAside'), [options.labelAside])]),
    h.div(attrs('group', [h.DataAttribute(GROUP_MARK, '')]), [
      ...sides.start,
      h.input(
        attrs('input', [
          h.Id(inputId),
          h.Type(options.visible ? 'text' : 'password'),
          h.Value(options.value),
          h.Autocomplete(options.autocomplete ?? 'current-password'),
          // Shown as text, a password must not be checked, corrected or capitalized.
          h.Spellcheck(false),
          h.Autocapitalize('off'),
          h.Attribute('autocorrect', 'off'),
          ...(options.placeholder === undefined ? [] : [h.Placeholder(options.placeholder)]),
          ...(options.name === undefined ? [] : [h.Name(options.name)]),
          ...(options.required === true ? [h.Required(true), h.AriaRequired(true)] : []),
          ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
          ...(describedBy.length === 0 ? [] : [h.AriaDescribedBy(describedBy.join(' '))]),
          ...(disabled
            ? [h.Disabled(true)]
            : [
                onInputOf(h, options.onInput),
                ...(capsLock === undefined
                  ? []
                  : [h.OnKeyDown((key, modifiers) => capsLock.onKey(capsLockOf(key, modifiers)))]),
              ]),
        ]),
      ),
      ...sides.end,
      h.button(
        attrs('toggle', [
          h.Type('button'),
          h.AriaLabel(text.toggle),
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
            attrs('capsLock', [h.Id(capsLockId), h.Role('status')]),
            capsOn ? [text.capsLock] : [],
          ),
        ]),
    ...(options.description === undefined
      ? []
      : [h.p(attrs('description', [h.Id(descriptionId)]), [options.description])]),
    ...(options.strength === undefined ? [] : [h.div(attrs('strength'), [options.strength])]),
    ...(requirements === undefined || requirements.length === 0
      ? []
      : [
          h.ul(
            attrs('requirements', [h.Id(requirementsId)]),
            requirements.map(requirement =>
              h.li(attrs('requirement', [h.DataAttribute('met', String(requirement.met))]), [
                requirement.label,
                h.span(attrs('requirementState'), [`, ${requirement.met ? text.met : text.unmet}`]),
              ]),
            ),
          ),
        ]),
  ])
}
