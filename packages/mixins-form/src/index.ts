/**
 * `foldkit-mixins-form` — a `foldkit-form` form drawn through slots.
 *
 * `foldkit-form` describes each control and draws nothing. This package draws
 * them as plain, accessible HTML and publishes every element as a Slot, so an
 * application styles and extends a generated form the way it does any other
 * SlotView, and the form stays free of a view dependency.
 */
import type { Draft, FormControl, FormRow, NestedForm } from 'foldkit-form'
import { Attr, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as FieldValidation from 'foldkit/fieldValidation'
import type { Html } from 'foldkit/html'
import * as Submodel from 'foldkit/submodel'

/** One thing a select or a relation picker offers. */
export interface Option {
  readonly value: string
  readonly label: string
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
  readonly submitLabel?: string | undefined
  /** The words on the button that adds a row to a nested key. Default `Add <label>`. */
  readonly addLabel?: ((label: string) => string) | undefined
  /** The words on the button that removes a row; `position` counts from 1. Default `Remove <label> <position>`. */
  readonly removeLabel?: ((label: string, position: number) => string) | undefined
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
  /**
   * Set for a field in a row of a nested key: its Messages, wrapped for the row.
   * A field of the form itself sends the form's own.
   */
  readonly send?:
    { readonly changed: (value: Draft) => unknown; readonly blurred: unknown } | undefined
}

/** What the form's own Style and Behavior attachments may read. */
export interface FormInput<Model, Key extends string = string> extends FormViewInputs<Key> {
  readonly model: Model
  readonly errors: ReadonlyArray<string>
  readonly canSubmit: boolean
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
  /** A `RelationMany` picker: the group, and each thing in it. */
  choices: Slot.make({ capability: Capability.Collection }),
  choice: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
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
  /** The rows of a nested key. A form with none takes no key here. */
  readonly rows: (model: Model, key: never) => ReadonlyArray<FormRow>
  readonly canSubmit: (model: Model) => boolean
  readonly Message: {
    /** The union, so `Message` is inferred from it and not from one constructor's case. */
    readonly Type: Message
    readonly Changed: (payload: { readonly key: Key; readonly value: Draft }) => NoInfer<Message>
    readonly Blurred: (payload: { readonly key: Key }) => NoInfer<Message>
    readonly Submitted: () => NoInfer<Message>
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
  readonly rows: (key: string) => ReadonlyArray<FormRow>
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
  rows: inner =>
    (form.rows as (model: unknown, key: string) => ReadonlyArray<FormRow>)(row.model, inner),
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

const errorsOf = (field: FieldValidation.Field<Draft>): ReadonlyArray<string> =>
  field._tag === 'Invalid' ? field.errors : []

/** The view of one field, to style or extend before handing it to `FormView.define`. */
const field = <Key extends string, Model, Message extends { readonly _tag: string }>(
  form: FormLike<Key, Model, Message>,
): FieldView<Key, Message> =>
  SlotView.forMessages<Message>().define(
    FieldSlots,
    (input: FieldInput<Key>, slots, h) => {
      const { control, id, invalid } = input
      const { key, label, description, required } = control
      const draft = input.field.value
      const { send } = input
      const change = (value: Draft): Message =>
        send === undefined ? form.Message.Changed({ key, value }) : (send.changed(value) as Message)
      const blurred = send === undefined ? form.Message.Blurred({ key }) : (send.blurred as Message)
      const describedBy = [
        ...(description === undefined ? [] : [`${id}-description`]),
        ...(invalid ? [`${id}-error`] : []),
      ]
      const state = [
        h.Id(id),
        h.AriaInvalid(invalid),
        // A check is running: the control is neither valid nor invalid yet.
        ...(input.field._tag === 'Validating' ? [h.AriaBusy(true)] : []),
        ...(required ? [h.AriaRequired(true)] : []),
        ...(describedBy.length === 0 ? [] : [h.AriaDescribedBy(describedBy.join(' '))]),
      ]
      const typed = [...state, h.Value(String(draft)), h.OnInput(change), h.OnBlur(blurred)]
      // A blank option whenever nothing is chosen, required or not: without one the
      // browser shows its first option as chosen while the draft is still empty.
      const pick = (options: ReadonlyArray<Option>, blank: boolean): Html =>
        h.select(slots.select.attrs([...state, h.OnChange(change), h.OnBlur(blurred)]), [
          ...(blank || draft === ''
            ? [h.option([h.Value(''), h.Selected(draft === '')], [''])]
            : []),
          ...options.map(option =>
            h.option([h.Value(option.value), h.Selected(draft === option.value)], [option.label]),
          ),
        ])

      const chosen = Array.isArray(draft) ? (draft as ReadonlyArray<string>) : []
      const body: Html =
        control.control._tag === 'Multiline'
          ? // A textarea's attributes exclude `InnerHTML`, which a slot's type admits
            // and no mixin can supply, so the narrowing loses nothing.
            h.textarea(slots.multiline.attrs(typed) as Parameters<typeof h.textarea>[0])
          : control.control._tag === 'Number'
            ? h.input(slots.number.attrs([...typed, h.Type('text'), h.InputMode('decimal')]))
            : control.control._tag === 'Toggle'
              ? h.input(
                  slots.toggle.attrs([
                    ...state,
                    h.Type('checkbox'),
                    h.Checked(draft === true),
                    h.OnClick(change(draft !== true)),
                    h.OnBlur(blurred),
                  ]),
                )
              : control.control._tag === 'Select'
                ? pick(
                    control.control.options.map(value => ({ value, label: value })),
                    !required,
                  )
                : control.control._tag === 'RelationOne'
                  ? pick(input.options, true)
                  : control.control._tag === 'RelationMany'
                    ? h.div(
                        slots.choices.attrs([h.Id(id), h.Role('group'), h.AriaLabel(label)]),
                        input.options.map(option =>
                          h.label(
                            [],
                            [
                              h.input(
                                slots.choice.attrs([
                                  h.Type('checkbox'),
                                  h.Checked(chosen.includes(option.value)),
                                  h.OnClick(
                                    change(
                                      chosen.includes(option.value)
                                        ? chosen.filter(value => value !== option.value)
                                        : [...chosen, option.value],
                                    ),
                                  ),
                                ]),
                              ),
                              option.label,
                            ],
                          ),
                        ),
                      )
                    : h.input(slots.text.attrs([...typed, h.Type('text')]))

      return h.div(slots.root.attrs(), [
        h.label(slots.label.attrs([h.For(id)]), [label]),
        body,
        ...(description === undefined
          ? []
          : [h.p(slots.description.attrs([h.Id(`${id}-description`)]), [description])]),
        ...(invalid
          ? [h.p(slots.error.attrs([h.Id(`${id}-error`), h.Role('alert')]), [...input.errors])]
          : []),
      ])
    },
    { name: 'FormField' },
  )

export const FormView = {
  field,

  /**
   * The view of the whole form: each control through `field`, in the input's
   * order, a hidden key left out. Pass a styled `field` to change how fields
   * look; attach Style and Behavior to the result to change the form around them.
   */
  define: <Key extends string, Model, Message extends { readonly _tag: string }>(
    form: FormLike<Key, Model, Message> & { readonly bundle: { readonly name: string } },
    options: { readonly field?: FieldView<Key, Message> } = {},
  ): SlotView.SlotView<typeof FormSlots, FormInput<Model, Key>, Message> => {
    const fieldView = options.field ?? field(form)
    type Make = (payload: object) => unknown
    return SlotView.forMessages<Message>().define(
      FormSlots,
      (input: FormInput<Model, Key>, slots, h) => {
        const options: Readonly<Record<string, ReadonlyArray<Option> | undefined>> = {
          ...input.nestedOptions,
          ...input.options,
        }

        /** The controls of a form or of a row. `id` and `path` say where: both are empty for the form itself. */
        const draw = (walk: Walk<Message>, id: string, path: string): ReadonlyArray<Html> =>
          walk.controls
            .filter(control => control.control._tag !== 'Hidden')
            .map((control): Html => {
              const { key, label } = control
              const here = `${id}-${key}`
              if (control.control._tag !== 'Nested') {
                const state = walk.field(key)
                return fieldView(
                  {
                    control: control as FormControl<Key>,
                    field: state,
                    invalid: FieldValidation.isInvalid(state),
                    errors: errorsOf(state),
                    options: options[`${path}${key}`] ?? [],
                    id: here,
                    send: {
                      changed: value => walk.wrap((walk.make.Changed as Make)({ key, value })),
                      blurred: walk.wrap((walk.make.Blurred as Make)({ key })),
                    },
                  },
                  h,
                )
              }
              const { form: nested, cardinality, optional } = control.control
              const rows = walk.rows(key)
              const addLabel = input.addLabel?.(label) ?? `Add ${label}`
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
                              input.removeLabel?.(label, index + 1) ??
                                `Remove ${label} ${index + 1}`,
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
          rows: key => form.rows(input.model, key as never),
          wrap: message => message as Message,
          make: form.Message as unknown as NestedForm['Message'],
        }
        return h.form(slots.root.attrs([h.OnSubmit(form.Message.Submitted())]), [
          ...draw(top, form.bundle.name, ''),
          ...(input.errors.length === 0
            ? []
            : [h.p(slots.errors.attrs([h.Role('alert')]), [...input.errors])]),
          h.button(slots.submit.attrs([h.Type('submit'), h.Disabled(!input.canSubmit)]), [
            input.submitLabel ?? 'Submit',
          ]),
        ])
      },
      { name: form.bundle.name },
    )
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
    Model extends { readonly errors: ReadonlyArray<string> },
    Message extends { readonly _tag: string },
  >(
    form: FormLike<Key, Model, Message>,
    view: SlotView.SlotView<typeof FormSlots, FormInput<Model, Key>, Message>,
  ): Submodel.View<Model, Message, FormViewInputs<Key>> =>
    Submodel.defineView<Model, Message, FormViewInputs<Key>>((model, inputs, h) =>
      view({ ...inputs, model, errors: model.errors, canSubmit: form.canSubmit(model) }, h),
    ),
}
