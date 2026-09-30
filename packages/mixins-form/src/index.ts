/**
 * `foldkit-mixins-form` — a `foldkit-form` form drawn through slots.
 *
 * `foldkit-form` describes each control and draws nothing. This package draws
 * them as plain, accessible HTML and publishes every element as a Slot, so an
 * application styles and extends a generated form the way it does any other
 * SlotView, and the form stays free of a view dependency.
 */
import {
  Input,
  fillWords,
  type Control,
  type Draft,
  type FormControl,
  type FormRow,
  type NestedForm,
} from 'foldkit-form'
import {
  Attr,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
  type NamedStyle,
  type SlotBuilders,
} from 'foldkit-mixins'
import * as FieldValidation from 'foldkit/fieldValidation'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import * as Submodel from 'foldkit/submodel'

/** One thing a select or a relation picker offers. */
export interface Option {
  readonly value: string
  readonly label: string
}

/**
 * The words the drawn form says itself. Its keys are its own, so one object can
 * hold these, `foldkit-mixins-crud`'s `ViewWords`, and a form's `FormMessages`:
 * an application's words, written and translated in one place. They are text
 * with blanks (`{label}`), never functions: Foldkit admits no function nested in
 * a placed view's inputs.
 */
export interface FormViewWords {
  /** On the submit button. Default `Submit`. */
  readonly submit?: string | undefined
  /** Before the label on a picker's search box (`Search Author`). Default `Search`. */
  readonly search?: string | undefined
  /** The choice of nothing, in a picker that may be left empty. Default: blank. */
  readonly none?: string | undefined
  /** On the button that adds a row to a nested key. Default `Add {label}`. */
  readonly add?: string | undefined
  /** On the button that removes a row; `{position}` counts from 1. Default `Remove {label} {position}`. */
  readonly remove?: string | undefined
  /** Under a control while its check runs. Default `Checking…`. */
  readonly checking?: string | undefined
  /** On the submit button while the form is submitting. Default `Submitting…`. */
  readonly submitting?: string | undefined
}

/**
 * What the view needs that the form does not own: the choices of each relation
 * picker (a query the application makes), and the submit button's words.
 */
export interface FormViewInputs<Key extends string = string> {
  readonly options?: { readonly [K in Key]?: ReadonlyArray<Option> } | undefined
  /**
   * The choices of a picker inside a nested key, by its path, the same for every
   * row: `'author.country'`.
   */
  readonly nestedOptions?: Readonly<Record<string, ReadonlyArray<Option>>> | undefined
  /**
   * What a control backed by a Bundle is drawn with, by key: its view's inputs,
   * such as the page Builder's `BuilderView.inputs({ data })`. A key in a nested
   * row is named by its path, as in `nestedOptions`. Keyed by text, as those
   * paths are, and typed where each entry is made, since only the control's
   * Bundle knows its view's inputs.
   */
  readonly controls?: Readonly<Record<string, unknown>> | undefined
  /** The view's own words, for wording and for translation. */
  readonly words?: FormViewWords | undefined
  /**
   * Whether the form is drawn with its submit button. Default: it is. `false`
   * for someone who may not submit it, such as a writer where submitting
   * publishes, so what would be refused is not offered.
   */
  readonly submits?: boolean | undefined
  /**
   * Whether the application's own work with a submitted value is in flight, such
   * as its request: the form hands the value over and cannot see what follows.
   */
  readonly submitting?: boolean | undefined
}

/** What a field's Style and Behavior attachments may read. */
export interface FieldInput<Key extends string = string> {
  readonly control: FormControl<Key>
  readonly field: FieldValidation.Field<Draft>
  readonly invalid: boolean
  readonly errors: ReadonlyArray<string>
  readonly options: ReadonlyArray<Option>
  /** Unique within the form, for `label for`, and as the prefix of the ids beside it. */
  readonly id: string
  /** The word before the label on its search box: the view's `words.search`. */
  readonly searchWord?: string | undefined
  /** The choice of nothing in a picker: the view's `words.none`. */
  readonly noneWord?: string | undefined
  /** What is said while the key's check runs: the view's `words.checking`. */
  readonly checkingWord?: string | undefined
  /**
   * Set for a field in a row of a nested key: its Messages, wrapped for the row.
   * A field of the form itself sends the form's own.
   */
  readonly send?:
    | {
        readonly changed: (value: Draft) => unknown
        readonly blurred: unknown
        readonly searched: (text: string) => unknown
      }
    | undefined
  /**
   * Set for a key edited by a control backed by a Bundle (`Input.bundle`): the
   * Bundle's Model, and the Message that carries one of its own. Such a key has
   * no draft, so `field.value` is `''`; its validation state is `field`'s.
   */
  readonly bundle?: BundleInput | undefined
  /** What was typed to find a choice, for a relation picker that searches. */
  readonly search: string
  /**
   * Whether the key is still written from the key it follows. A renderer offers
   * "regenerate" when it is not, by sending the key an empty draft.
   */
  readonly following: boolean
}

/** A control backed by a Bundle, as its field is drawn: its Model, and how its Messages leave. */
export interface BundleInput {
  readonly model: unknown
  readonly send: (message: unknown) => unknown
  /** What the view's `controls` gives this key, for the Bundle's own view. */
  readonly viewInputs?: unknown
}

/** What the form's own Style and Behavior attachments may read. */
export interface FormInput<Model, Key extends string = string> extends FormViewInputs<Key> {
  readonly model: Model
  readonly errors: ReadonlyArray<string>
  readonly canSubmit: boolean
  /**
   * Whether the form is submitting: a submit waits for a check, or the
   * application's work with the value is in flight. `FormView.submodel` reads both.
   */
  readonly submitting?: boolean | undefined
}

const textual = {
  capability: Capability.TextInput,
  events: [Event.Input, Event.Blur],
  attributes: [Attr.AriaInvalid, Attr.AriaDescribedby],
} as const

/** One field: the control for a key, and what stands around it. */
export const FieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Base }),
  description: Slot.make({ capability: Capability.Base }),
  error: Slot.make({ capability: Capability.Base }),
  /** Says the key's check is running, while it runs. The control names it in `aria-describedby`. */
  checking: Slot.make({ capability: Capability.Base }),
  text: Slot.make(textual),
  multiline: Slot.make(textual),
  number: Slot.make(textual),
  toggle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.Blur],
    attributes: [Attr.AriaInvalid, Attr.AriaDescribedby],
  }),
  /** A `Select`, and a `RelationOne` picker. */
  select: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Change, Event.Blur],
    attributes: [Attr.AriaInvalid, Attr.AriaDescribedby],
  }),
  /** One choice of a `select`. */
  option: Slot.make({ capability: Capability.Base }),
  /** Around the view of a control backed by a Bundle, when it is drawn with the Bundle's own view. */
  control: Slot.make({ capability: Capability.Container }),
  /** Around a control and its affixes, such as an address's prefix and its input. */
  group: Slot.make({ capability: Capability.Container }),
  /** Text beside a control, before or after it: a prefix, or a unit. */
  affix: Slot.make({ capability: Capability.Base }),
  /** A `RelationMany` picker: the group, and each thing in it. */
  choices: Slot.make({ capability: Capability.Collection }),
  choice: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** Around one choice's checkbox and its words. */
  choiceLabel: Slot.make({ capability: Capability.Base }),
  /** Over a relation picker that searches: where the user types to find a choice. */
  search: Slot.make({ capability: Capability.TextInput, events: [Event.Input] }),
})

/** The form around its fields. */
export const FormSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, events: [Event.Submit] }),
  /** Failures that belong to no one field: a rule that spans keys. */
  errors: Slot.make({ capability: Capability.Base }),
  submit: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Disabled],
  }),
  /** A nested key: the group around its rows, its name, each row, and the buttons that add and remove one. */
  group: Slot.make({ capability: Capability.Container }),
  legend: Slot.make({ capability: Capability.Base }),
  row: Slot.make({ capability: Capability.Container }),
  add: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  remove: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

/** The parts of a `Form.make` result the view reads. */
interface FormLike<Key extends string, Model, Message> {
  /** Every key, nested ones too; `Key` is the keys that hold a draft. */
  readonly controls: ReadonlyArray<FormControl>
  readonly field: (model: Model, key: Key) => FieldValidation.Field<Draft>
  /** A key edited by a control backed by a Bundle. A form with none takes no key here. */
  readonly control: (key: never) => {
    readonly field: (model: Model) => FieldValidation.Field<unknown>
  }
  /** The rows of a nested key. A form with none takes no key here. */
  readonly rows: (model: Model, key: never) => ReadonlyArray<FormRow>
  readonly search: (model: Model, key: Key) => string
  readonly isFollowing: (model: Model, key: Key) => boolean
  readonly canSubmit: (model: Model) => boolean
  readonly Message: {
    /** The union, so `Message` is inferred from it and not from one constructor's case. */
    readonly Type: Message
    readonly Changed: (payload: { readonly key: Key; readonly value: Draft }) => NoInfer<Message>
    readonly Blurred: (payload: { readonly key: Key }) => NoInfer<Message>
    readonly Searched: (payload: { readonly key: Key; readonly text: string }) => NoInfer<Message>
    readonly Submitted: () => NoInfer<Message>
    readonly Control: (payload: {
      readonly key: never
      readonly message: unknown
    }) => NoInfer<Message>
    readonly Nested: (payload: {
      readonly key: string
      readonly row: string
      readonly message: unknown
    }) => NoInfer<Message>
    readonly RowAdded: (payload: { readonly key: string }) => NoInfer<Message>
    readonly RowRemoved: (payload: {
      readonly key: string
      readonly row: string
    }) => NoInfer<Message>
  }
}

/**
 * A form or a row of one, as the view walks it: what to draw, and how each
 * Message leaves. A row's Messages leave wrapped, once per form they pass through.
 */
interface Walk<Message> {
  readonly controls: ReadonlyArray<FormControl>
  readonly field: (key: string) => FieldValidation.Field<Draft>
  /** The state of a key edited by a control backed by a Bundle, its Model as the value. */
  readonly controlField: (key: string) => FieldValidation.Field<unknown>
  readonly rows: (key: string) => ReadonlyArray<FormRow>
  readonly search: (key: string) => string
  readonly following: (key: string) => boolean
  readonly wrap: (message: unknown) => Message
  readonly make: NestedForm['Message']
}

const rowWalk = <Message>(
  parent: Walk<Message>,
  key: string,
  row: FormRow,
  form: NestedForm,
): Walk<Message> => ({
  controls: form.controls as ReadonlyArray<FormControl>,
  field: inner =>
    (form.field as (model: unknown, key: string) => FieldValidation.Field<Draft>)(row.model, inner),
  controlField: inner =>
    (
      form.control as (key: string) => {
        readonly field: (model: unknown) => FieldValidation.Field<unknown>
      }
    )(inner).field(row.model),
  rows: inner =>
    (form.rows as (model: unknown, key: string) => ReadonlyArray<FormRow>)(row.model, inner),
  search: inner => (form.search as (model: unknown, key: string) => string)(row.model, inner),
  following: inner =>
    (form.isFollowing as (model: unknown, key: string) => boolean)(row.model, inner),
  wrap: message =>
    parent.wrap(
      (parent.make.Nested as (payload: object) => unknown)({ key, row: row.id, message }),
    ),
  make: form.Message,
})

type FieldView<Key extends string, Message> = SlotView.SlotView<
  typeof FieldSlots,
  FieldInput<Key>,
  Message
>

const errorsOf = (field: FieldValidation.Field<unknown>): ReadonlyArray<string> =>
  field._tag === 'Invalid' ? field.errors : []

/**
 * The state of a key a control backed by a Bundle edits, as a field is drawn:
 * its validation state, with no draft. The Bundle's Model travels as `bundle`.
 */
const withoutDraft = (field: FieldValidation.Field<unknown>): FieldValidation.Field<Draft> =>
  field._tag === 'Invalid'
    ? FieldValidation.Invalid({ value: '', errors: field.errors })
    : field._tag === 'Valid'
      ? FieldValidation.Valid({ value: '' })
      : field._tag === 'Validating'
        ? FieldValidation.Validating({ value: '' })
        : FieldValidation.NotValidated({ value: '' })

/** What a renderer draws one control from. */
export interface RenderContext<Message> {
  readonly input: FieldInput
  /** The control, whose `data` is its kind's: narrow it with the kind's `is`. */
  readonly control: Control
  readonly draft: Draft
  readonly change: (value: Draft) => Message
  readonly blurred: Message
  /**
   * For a control backed by a Bundle: its Model, and the Message carrying one of
   * its own. Its `draft` is `''`.
   */
  readonly bundle:
    | {
        readonly model: unknown
        readonly send: (message: unknown) => Message
        /** The inputs its view is drawn with: the form view's `controls` entry for this key. */
        readonly viewInputs: unknown
      }
    | undefined
  /** The control's id and its accessibility state. Put them on the element that holds the value. */
  readonly state: ReadonlyArray<Attribute<Message>>
  /** What the key's element takes beyond the base field view. */
  readonly attrs: FieldAttrs
  readonly slots: SlotBuilders<typeof FieldSlots, Message>
  readonly h: HtmlBuilder<Message>
}

/** Draws the control of one kind. The label, description and error around it are the field's. */
export type Renderer<Message> = (context: RenderContext<Message>) => Html

/**
 * A control backed by a Bundle that no renderer names is drawn with the
 * Bundle's own view, inside the field's `control` slot, which carries the
 * control's id and accessibility state. A Bundle with no view needs a renderer.
 */
const bundleRenderer =
  <Message>(control: Control): Renderer<Message> =>
  ({ bundle, input, state, slots, h }) => {
    const view = Input.isBundle(control) ? control.data.bundle.view : undefined
    if (bundle === undefined || view === undefined)
      throw new Error(
        `FormView: the "${control.kind}" control ("${input.control.key}") has no view; pass a renderer under "renderers"`,
      )
    return h.div(slots.control.attrs(state.filter(attribute => attribute._tag !== 'Name')), [
      h.submodel(
        bundle.viewInputs === undefined
          ? { slotId: input.id, model: bundle.model, view, toParentMessage: bundle.send }
          : // A Bundle's view takes the inputs its application gives it in `controls`,
            // whose type the form cannot know. A view given inputs is called with them.
            ({
              slotId: input.id,
              model: bundle.model,
              view,
              toParentMessage: bundle.send,
              viewInputs: bundle.viewInputs,
            } as Parameters<typeof h.submodel>[0]),
      ),
    ])
  }

/** Renderers by the `kind` of control they draw. */
export type Renderers<Message> = Readonly<Record<string, Renderer<Message>>>

/**
 * The renderers this package ships, by kind. They are entries like any other: an
 * application adds `Date`, or replaces `RelationOne` with a combobox, by passing
 * its own beside them.
 */
/**
 * The choices, and after them each chosen value they lack, as `? value`: a
 * stored id whose row is gone, or a value the choices have not loaded yet,
 * stays shown and can be let go, rather than dropped from sight.
 */
const withChosen = (
  options: ReadonlyArray<Option>,
  chosen: ReadonlyArray<string>,
): ReadonlyArray<Option> => {
  const known = new Set(options.map(option => option.value))
  return [
    ...options,
    ...chosen
      .filter(value => value !== '' && !known.has(value))
      .map(value => ({ value, label: `? ${value}` })),
  ]
}

const defaultRenderers = <Message>(): Renderers<Message> => {
  const typed = ({ state, draft, change, blurred, h }: RenderContext<Message>) => [
    ...state,
    h.Value(String(draft)),
    h.OnInput(change),
    h.OnBlur(blurred),
  ]
  // A blank option whenever nothing is chosen, required or not: without one the
  // browser shows its first option as chosen while the draft is still empty.
  const pick = (
    { state, draft, change, blurred, input, slots, h }: RenderContext<Message>,
    options: ReadonlyArray<Option>,
    blank: boolean,
  ): Html =>
    h.select(slots.select.attrs([...state, h.OnChange(change), h.OnBlur(blurred)]), [
      ...(blank || draft === ''
        ? [
            h.option(slots.option.attrs([h.Value(''), h.Selected(draft === '')]), [
              input.noneWord ?? '',
            ]),
          ]
        : []),
      ...withChosen(options, typeof draft === 'string' ? [draft] : []).map(option =>
        h.option(slots.option.attrs([h.Value(option.value), h.Selected(draft === option.value)]), [
          option.label,
        ]),
      ),
    ])
  return {
    [Input.Text.kind]: context =>
      context.h.input(
        context.slots.text.attrs([
          ...typed(context),
          context.h.Type(context.attrs.type ?? 'text'),
          ...(context.attrs.placeholder === undefined
            ? []
            : [context.h.Placeholder(context.attrs.placeholder)]),
        ]),
      ),
    [Input.Multiline.kind]: context =>
      // A textarea's attributes exclude `InnerHTML`, which a slot's type admits
      // and no mixin can supply, so the narrowing loses nothing.
      context.h.textarea(
        context.slots.multiline.attrs([
          ...typed(context),
          ...(context.attrs.placeholder === undefined
            ? []
            : [context.h.Placeholder(context.attrs.placeholder)]),
          ...(context.attrs.rows === undefined
            ? []
            : [context.h.Attribute('rows', String(context.attrs.rows))]),
        ]) as Parameters<typeof context.h.textarea>[0],
      ),
    // A number is a text input because its draft is text: `"4."` is a fine thing to
    // have typed, and `type="number"` would refuse to report it.
    [Input.Number.kind]: context =>
      context.h.input(
        context.slots.number.attrs([
          ...typed(context),
          context.h.Type('text'),
          context.h.InputMode('decimal'),
          ...(context.attrs.placeholder === undefined
            ? []
            : [context.h.Placeholder(context.attrs.placeholder)]),
        ]),
      ),
    [Input.Toggle.kind]: ({ state, draft, change, blurred, slots, h }) =>
      h.input(
        slots.toggle.attrs([
          ...state,
          h.Type('checkbox'),
          h.Checked(draft === true),
          h.OnClick(change(draft !== true)),
          h.OnBlur(blurred),
        ]),
      ),
    [Input.Select.kind]: context =>
      pick(
        context,
        (Input.Select.is(context.control) ? context.control.data.options : []).map(option => ({
          value: String(option),
          label: String(option),
        })),
        !context.input.control.required,
      ),
    [Input.RelationOne.kind]: context => pick(context, context.input.options, true),
    [Input.RelationMany.kind]: ({ input, draft, change, slots, h }) => {
      const chosen = Array.isArray(draft) ? (draft as ReadonlyArray<string>) : []
      const isChosen = new Set(chosen)
      return h.div(
        slots.choices.attrs([h.Id(input.id), h.Role('group'), h.AriaLabel(input.control.label)]),
        withChosen(input.options, chosen).map(option =>
          h.label(slots.choiceLabel.attrs(), [
            h.input(
              slots.choice.attrs([
                h.Type('checkbox'),
                h.Name(input.control.key),
                h.Value(option.value),
                h.Checked(isChosen.has(option.value)),
                h.OnClick(
                  change(
                    isChosen.has(option.value)
                      ? chosen.filter(value => value !== option.value)
                      : [...chosen, option.value],
                  ),
                ),
              ]),
            ),
            option.label,
          ]),
        ),
      )
    },
  }
}

/**
 * What a per-key override receives: everything to draw the control, and the
 * Messages that leave it, in the form's own universe. The `h` an override
 * draws with stays the caller's: the whole-form view's, or a custom layout's.
 */
export interface FieldOverrideInput<Key extends string = string, Changed = unknown> {
  readonly control: FormControl<Key>
  readonly field: FieldValidation.Field<Draft>
  readonly id: string
  readonly invalid: boolean
  readonly errors: ReadonlyArray<string>
  readonly changed: (value: Draft) => Changed
  readonly blurred: Changed
  /** What the key's element takes beyond the base field view. */
  readonly attrs: FieldAttrs
}

/**
 * Draws one key's control, for a layout the base field view does not own.
 * `Changed` is the form's Message; `Message` the universe of the `h` that
 * draws, which is the form's in the whole-form view and the application's
 * in a custom layout.
 */
export type FieldOverride<Key extends string = string, Changed = unknown, Message = unknown> = (
  input: FieldOverrideInput<Key, Changed>,
  h: HtmlBuilder<Message>,
) => Html

/**
 * What one key's element takes beyond the base field view: an HTML input
 * type, a placeholder, a textarea's rows. A renderer reads what fits its
 * element and ignores the rest.
 */
export interface FieldAttrs {
  readonly type?: string | undefined
  readonly placeholder?: string | undefined
  readonly rows?: number | undefined
}

/**
 * Per-key overrides for `FormView.fields`. `overrides` draw through the
 * whole-form view; `styles` style one key's base field view there. Unknown
 * keys in either are type errors. A custom layout passes its override to
 * `field` itself, with its own `h`.
 */
export interface FieldsOptions<Key extends string, Changed> {
  /** A key drawn by this instead of the base field view (or its styled one). */
  readonly overrides?: { readonly [K in Key]?: FieldOverride<Key, Changed, Changed> } | undefined
  /** A style around a key's base field view, kept for keys with no override. */
  readonly styles?: { readonly [K in Key]?: NamedStyle<typeof FieldSlots> } | undefined
  /**
   * What one key's element takes beyond the base field view. Only the
   * text, multiline, and number renderers read attrs; bundle-backed kinds
   * (drawn by `bundleRenderer`) and per-key overrides ignore them. Passing
   * `field` draws through it directly, skipping both `renderers` and `attrs`.
   */
  readonly attrs?: { readonly [K in Key]?: FieldAttrs } | undefined
}

/**
 * One flat key's control, for a layout the caller owns: through the base
 * field view with a form-universe `h`, or through the override it is given,
 * with any `h`. A call with neither a form `h` nor an override is a type
 * error, since the base view's Messages are the form's own.
 */
export interface FieldsField<
  Key extends string,
  Model,
  FormMessage extends { readonly _tag: string },
> {
  (
    control: FormControl<Key>,
    model: Model,
    id: string,
    h: HtmlBuilder<FormMessage>,
    override?: FieldOverride<Key, FormMessage, FormMessage>,
  ): Html
  <Message>(
    control: FormControl<Key>,
    model: Model,
    id: string,
    h: HtmlBuilder<Message>,
    override: FieldOverride<Key, FormMessage, Message>,
  ): Html
}

/** The Messages of one key, through its row's send or the form's own. */
const changedOf =
  <Key extends string, Model, Message>(
    form: FormLike<Key, Model, Message>,
    key: Key,
    send: FieldInput<Key>['send'],
  ): ((value: Draft) => Message) =>
  value =>
    (send === undefined ? form.Message.Changed({ key, value }) : send.changed(value)) as Message

/** The blur Message of one key, through its row's send or the form's own. */
const blurredOf = <Key extends string, Model, Message>(
  form: FormLike<Key, Model, Message>,
  key: Key,
  send: FieldInput<Key>['send'],
): Message => (send === undefined ? form.Message.Blurred({ key }) : send.blurred) as Message

/** The view of one field, to style or extend before handing it to `FormView.define`. */
const field = <Key extends string, Model, Message extends { readonly _tag: string }>(
  form: FormLike<Key, Model, Message>,
  options: {
    /** Renderers by kind, beside the ones shipped: a new kind, or another way to draw a shipped one. */
    readonly renderers?: Renderers<Message>
    /** What one key's element takes beyond the base field view. */
    readonly attrs?: { readonly [K in Key]?: FieldAttrs }
  } = {},
): FieldView<Key, Message> => {
  const renderers: Renderers<Message> = { ...defaultRenderers<Message>(), ...options.renderers }
  return SlotView.forMessages<Message>().define(
    FieldSlots,
    (input: FieldInput<Key>, slots, h) => {
      const { control, id, invalid } = input
      const { key, label, description, required } = control
      const draft = input.field.value
      const { send } = input
      const change = changedOf(form, key, send)
      const blurred = blurredOf(form, key, send)
      const searched = (text: string): Message =>
        send === undefined ? form.Message.Searched({ key, text }) : (send.searched(text) as Message)
      const searches = control.control.searches
      // A check is running: the control is neither valid nor invalid yet.
      const checking = input.field._tag === 'Validating'
      const describedBy = [
        ...(description === undefined ? [] : [`${id}-description`]),
        ...(checking ? [`${id}-checking`] : []),
        ...(invalid ? [`${id}-error`] : []),
      ]
      const state = [
        h.Id(id),
        // The key is the field's name, so a form posts its drafts with scripts off.
        h.Name(key),
        h.AriaInvalid(invalid),
        ...(checking ? [h.AriaBusy(true)] : []),
        ...(required ? [h.AriaRequired(true)] : []),
        ...(describedBy.length === 0 ? [] : [h.AriaDescribedBy(describedBy.join(' '))]),
      ]
      // The Message leaves the way the input says: wrapped for a row, or the form's own.
      const held = input.bundle
      const bundle =
        held === undefined
          ? undefined
          : {
              model: held.model,
              send: (message: unknown) => held.send(message) as Message,
              viewInputs: held.viewInputs,
            }
      const render =
        renderers[control.control.kind] ??
        (bundle !== undefined ? bundleRenderer<Message>(control.control) : undefined)
      if (render === undefined)
        throw new Error(
          `FormView: no renderer for a "${control.control.kind}" control ("${key}"); pass one under "renderers"`,
        )
      const body = render({
        input: input as FieldInput,
        control: control.control,
        draft,
        change,
        blurred,
        bundle,
        state,
        attrs: options.attrs?.[key] ?? {},
        slots,
        h,
      })

      // The field's state by Foldkit's own tag, for a stylesheet: `[data-validation='Valid']`.
      return h.div(slots.root.attrs([h.DataAttribute('validation', input.field._tag)]), [
        h.label(slots.label.attrs([h.For(id)]), [label]),
        // Typing here changes which choices the picker below is offered.
        ...(searches
          ? [
              h.input(
                slots.search.attrs([
                  h.Id(`${id}-search`),
                  h.Type('search'),
                  h.AriaLabel(`${input.searchWord ?? 'Search'} ${label}`),
                  h.AriaControls(id),
                  h.Value(input.search),
                  h.OnInput(searched),
                ]),
              ),
            ]
          : []),
        body,
        ...(description === undefined
          ? []
          : [h.p(slots.description.attrs([h.Id(`${id}-description`)]), [description])]),
        ...(checking
          ? [
              h.p(slots.checking.attrs([h.Id(`${id}-checking`), h.Role('status')]), [
                input.checkingWord ?? 'Checking…',
              ]),
            ]
          : []),
        ...(invalid
          ? [h.p(slots.error.attrs([h.Id(`${id}-error`), h.Role('alert')]), [...input.errors])]
          : []),
      ])
    },
    { name: 'FormField' },
  )
}

export const FormView = {
  field,

  /**
   * The view of the whole form: each control through `field`, in the input's
   * order, a hidden key left out. Pass a styled `field` to change how fields
   * look; attach Style and Behavior to the result to change the form around them.
   */
  define: <Key extends string, Model, Message extends { readonly _tag: string }>(
    form: FormLike<Key, Model, Message> & { readonly bundle: { readonly name: string } },
    options: {
      readonly field?: FieldView<Key, Message>
      /** Renderers by kind, for the field view this makes. With `field` given, give them to `FormView.field`. */
      readonly renderers?: Renderers<Message>
    } = {},
  ): SlotView.SlotView<typeof FormSlots, FormInput<Model, Key>, Message> => {
    const fieldView =
      options.field ??
      field(form, options.renderers === undefined ? {} : { renderers: options.renderers })
    type Make = (payload: object) => unknown
    return SlotView.forMessages<Message>().define(
      FormSlots,
      (input: FormInput<Model, Key>, slots, h) => {
        const options: Readonly<Record<string, ReadonlyArray<Option> | undefined>> = {
          ...input.nestedOptions,
          ...input.options,
        }
        const controls: Readonly<Record<string, unknown>> = input.controls ?? {}

        /** The controls of a form or of a row. `id` and `path` say where: both are empty for the form itself. */
        const draw = (walk: Walk<Message>, id: string, path: string): ReadonlyArray<Html> =>
          walk.controls
            .filter(control => control.control.shown)
            .map((control): Html => {
              const { key, label } = control
              const here = `${id}-${key}`
              if (!Input.Nested.is(control.control)) {
                const bundled = Input.isBundle(control.control)
                const held = bundled ? walk.controlField(key) : walk.field(key)
                const state = bundled ? withoutDraft(held) : (held as FieldValidation.Field<Draft>)
                return fieldView(
                  {
                    control: control as FormControl<Key>,
                    field: state,
                    bundle: bundled
                      ? {
                          model: held.value,
                          send: message => walk.wrap((walk.make.Control as Make)({ key, message })),
                          viewInputs: controls[`${path}${key}`],
                        }
                      : undefined,
                    invalid: FieldValidation.isInvalid(state),
                    errors: errorsOf(state),
                    options: options[`${path}${key}`] ?? [],
                    id: here,
                    search: walk.search(key),
                    following: walk.following(key),
                    searchWord: input.words?.search,
                    noneWord: input.words?.none,
                    checkingWord: input.words?.checking,
                    send: {
                      changed: value => walk.wrap((walk.make.Changed as Make)({ key, value })),
                      blurred: walk.wrap((walk.make.Blurred as Make)({ key })),
                      searched: text => walk.wrap((walk.make.Searched as Make)({ key, text })),
                    },
                  },
                  h,
                )
              }
              const { form: nested, cardinality, optional } = control.control.data
              const rows = walk.rows(key)
              const addLabel = fillWords(input.words?.add ?? 'Add {label}', { label })
              return h.fieldset(slots.group.attrs([h.Id(here)]), [
                h.legend(slots.legend.attrs(), [label]),
                ...rows.map((row, index) =>
                  h.div(slots.row.attrs([h.Id(`${here}-${row.id}`)]), [
                    ...draw(rowWalk(walk, key, row, nested), `${here}-${row.id}`, `${path}${key}.`),
                    // A row that must be there has no way out.
                    ...(optional
                      ? [
                          h.button(
                            slots.remove.attrs([
                              h.Type('button'),
                              h.OnClick(
                                walk.wrap((walk.make.RowRemoved as Make)({ key, row: row.id })),
                              ),
                            ]),
                            [
                              fillWords(input.words?.remove ?? 'Remove {label} {position}', {
                                label,
                                position: index + 1,
                              }),
                            ],
                          ),
                        ]
                      : []),
                  ]),
                ),
                // A `one` takes one row: the way in goes once it is there.
                ...(cardinality === 'many' || rows.length === 0
                  ? [
                      h.button(
                        slots.add.attrs([
                          h.Type('button'),
                          h.OnClick(walk.wrap((walk.make.RowAdded as Make)({ key }))),
                        ]),
                        [addLabel],
                      ),
                    ]
                  : []),
              ])
            })

        const top: Walk<Message> = {
          controls: form.controls,
          field: key => form.field(input.model, key as Key),
          controlField: key => form.control(key as never).field(input.model),
          rows: key => form.rows(input.model, key as never),
          search: key => form.search(input.model, key as Key),
          following: key => form.isFollowing(input.model, key as Key),
          wrap: message => message as Message,
          make: form.Message as unknown as NestedForm['Message'],
        }
        const submitting = input.submitting === true
        return h.form(
          slots.root.attrs([
            h.OnSubmit(form.Message.Submitted()),
            ...(submitting ? [h.AriaBusy(true), h.DataAttribute('submitting', '')] : []),
          ]),
          [
            ...draw(top, form.bundle.name, ''),
            ...(input.errors.length === 0
              ? []
              : [h.p(slots.errors.attrs([h.Role('alert')]), [...input.errors])]),
            ...(input.submits === false
              ? []
              : [
                  h.button(
                    slots.submit.attrs([
                      h.Type('submit'),
                      h.Disabled(!input.canSubmit || submitting),
                    ]),
                    [
                      submitting
                        ? (input.words?.submitting ?? 'Submitting…')
                        : (input.words?.submit ?? 'Submit'),
                    ],
                  ),
                ]),
          ],
        )
      },
      { name: form.bundle.name },
    )
  },

  /**
   * The whole form, as `define` draws it, with per-key overrides; and one flat
   * key's control, for a layout the caller owns. Keys with no override render
   * through the base field view (a new key of a known kind needs nothing new),
   * each through its style when one is given and with its element attrs. `field`
   * draws through the base view with a form-universe `h`, or through the
   * override it is given, with any `h`. Nested keys and Bundle-backed keys draw
   * only through `view` (or an override); `field` without one refuses them,
   * naming the key.
   */
  fields: <Key extends string, Model, FormMessage extends { readonly _tag: string }>(
    form: FormLike<Key, Model, FormMessage> & { readonly bundle: { readonly name: string } },
    options: {
      readonly field?: FieldView<Key, FormMessage>
      /** Renderers by kind, for the field views this makes. */
      readonly renderers?: Renderers<FormMessage>
    } & FieldsOptions<Key, FormMessage> = {},
  ): {
    readonly view: SlotView.SlotView<typeof FormSlots, FormInput<Model, Key>, FormMessage>
    readonly field: FieldsField<Key, Model, FormMessage>
  } => {
    const base =
      options.field ??
      field(
        form,
        options.renderers === undefined && options.attrs === undefined
          ? {}
          : {
              ...(options.renderers === undefined ? {} : { renderers: options.renderers }),
              ...(options.attrs === undefined ? {} : { attrs: options.attrs }),
            },
      )
    const styled = new Map<Key, FieldView<Key, FormMessage>>()
    const viewOf = (key: Key): FieldView<Key, FormMessage> => {
      const known = styled.get(key)
      if (known !== undefined) return known
      const style = options.styles?.[key]
      const made = style === undefined ? base : Style.attach(style)(base)
      styled.set(key, made)
      return made
    }
    const drawn = (input: FieldInput<Key>, h: HtmlBuilder<FormMessage>): Html => {
      const override = options.overrides?.[input.control.key]
      if (override === undefined) return viewOf(input.control.key)(input, h)
      return override(
        {
          control: input.control,
          field: input.field,
          id: input.id,
          invalid: input.invalid,
          errors: input.errors,
          changed: changedOf(form, input.control.key, input.send),
          blurred: blurredOf(form, input.control.key, input.send),
          attrs: options.attrs?.[input.control.key] ?? {},
        },
        h,
      )
    }
    return {
      view: FormView.define(form, {
        field: SlotView.forMessages<FormMessage>().define(
          FieldSlots,
          (input: FieldInput<Key>, _slots, h) => drawn(input, h),
          { name: `${form.bundle.name}Fields` },
        ),
      }),
      field: (<M>(
        control: FormControl<Key>,
        model: Model,
        id: string,
        h: HtmlBuilder<M> | HtmlBuilder<FormMessage>,
        override?: FieldOverride<Key, FormMessage, M>,
      ): Html => {
        const state = form.field(model, control.key)
        if (override !== undefined)
          return override(
            {
              control,
              field: state,
              id,
              invalid: FieldValidation.isInvalid(state),
              errors: errorsOf(state),
              changed: value => form.Message.Changed({ key: control.key, value }),
              blurred: form.Message.Blurred({ key: control.key }),
              attrs: options.attrs?.[control.key] ?? {},
            },
            h as HtmlBuilder<M>,
          )
        if (Input.Nested.is(control.control) || Input.isBundle(control.control))
          throw new Error(
            `FormView.fields: "${control.key}" nests rows or a Bundle; draw it with the whole-form view, or give an override for it`,
          )
        return viewOf(control.key)(
          {
            control,
            field: state,
            bundle: undefined,
            invalid: FieldValidation.isInvalid(state),
            errors: errorsOf(state),
            options: [],
            id,
            search: form.search(model, control.key),
            following: form.isFollowing(model, control.key),
          },
          h as HtmlBuilder<FormMessage>,
        )
      }) as FieldsField<Key, Model, FormMessage>,
    }
  },

  /**
   * For `Bundle.withView`: the Submodel view that draws `view`, so a placement
   * renders the form with `placed.view(model, h, { options })`.
   *
   * ```ts
   * const Drawn = EditPost.bundle.pipe(Bundle.withView(FormView.submodel(EditPost, View)))
   * ```
   */
  submodel: <
    Key extends string,
    Model extends { readonly errors: ReadonlyArray<string>; readonly submitPending: boolean },
    Message extends { readonly _tag: string },
  >(
    form: FormLike<Key, Model, Message>,
    view: SlotView.SlotView<typeof FormSlots, FormInput<Model, Key>, Message>,
    options: {
      /**
       * When the submit waits instead of staying disabled. `true` while a
       * check is running means submitted work waits for it, and the button
       * stays enabled; `false` keeps the button disabled until every key is
       * valid. Default `form.canSubmit` (lenient): a submit made mid-check
       * waits for it. Pass a strict predicate to disable through checks
       * instead, such as `model => PostForm.engine.value(model.form) !==
       * undefined`, or `() => true` to never pre-disable and validate wholly
       * at submit.
       */
      readonly canSubmit?: (model: Model) => boolean
    } = {},
  ): Submodel.View<Model, Message, FormViewInputs<Key>> =>
    Submodel.defineView<Model, Message, FormViewInputs<Key>>((model, inputs, h) =>
      view(
        {
          ...inputs,
          model,
          errors: model.errors,
          canSubmit: (options.canSubmit ?? form.canSubmit)(model),
          submitting: model.submitPending || inputs.submitting === true,
        },
        h,
      ),
    ),
}
