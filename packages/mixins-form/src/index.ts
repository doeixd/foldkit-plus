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
import { Attr, Capability, Event, Slot, Slots, SlotView, type SlotBuilders } from 'foldkit-mixins'
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
  /** On the button that adds a row to a nested key. Default `Add {label}`. */
  readonly add?: string | undefined
  /** On the button that removes a row; `{position}` counts from 1. Default `Remove {label} {position}`. */
  readonly remove?: string | undefined
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
  /** The view's own words, for wording and for translation. */
  readonly words?: FormViewWords | undefined
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
  /** What was typed to find a choice, for a relation picker that searches. */
  readonly search: string
  /**
   * Whether the key is still written from the key it follows. A renderer offers
   * "regenerate" when it is not, by sending the key an empty draft.
   */
  readonly following: boolean
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

const errorsOf = (field: FieldValidation.Field<Draft>): ReadonlyArray<string> =>
  field._tag === 'Invalid' ? field.errors : []

/** What a renderer draws one control from. */
export interface RenderContext<Message> {
  readonly input: FieldInput
  /** The control, whose `data` is its kind's: narrow it with the kind's `is`. */
  readonly control: Control
  readonly draft: Draft
  readonly change: (value: Draft) => Message
  readonly blurred: Message
  /** The control's id and its accessibility state. Put them on the element that holds the value. */
  readonly state: ReadonlyArray<Attribute<Message>>
  readonly slots: SlotBuilders<typeof FieldSlots, Message>
  readonly h: HtmlBuilder<Message>
}

/** Draws the control of one kind. The label, description and error around it are the field's. */
export type Renderer<Message> = (context: RenderContext<Message>) => Html

/** Renderers by the `kind` of control they draw. */
export type Renderers<Message> = Readonly<Record<string, Renderer<Message>>>

/**
 * The renderers this package ships, by kind. They are entries like any other: an
 * application adds `Date`, or replaces `RelationOne` with a combobox, by passing
 * its own beside them.
 */
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
    { state, draft, change, blurred, slots, h }: RenderContext<Message>,
    options: ReadonlyArray<Option>,
    blank: boolean,
  ): Html =>
    h.select(slots.select.attrs([...state, h.OnChange(change), h.OnBlur(blurred)]), [
      ...(blank || draft === '' ? [h.option([h.Value(''), h.Selected(draft === '')], [''])] : []),
      ...options.map(option =>
        h.option([h.Value(option.value), h.Selected(draft === option.value)], [option.label]),
      ),
    ])
  return {
    [Input.Text.kind]: context =>
      context.h.input(context.slots.text.attrs([...typed(context), context.h.Type('text')])),
    [Input.Multiline.kind]: context =>
      // A textarea's attributes exclude `InnerHTML`, which a slot's type admits
      // and no mixin can supply, so the narrowing loses nothing.
      context.h.textarea(
        context.slots.multiline.attrs(typed(context)) as Parameters<typeof context.h.textarea>[0],
      ),
    // A number is a text input because its draft is text: `"4."` is a fine thing to
    // have typed, and `type="number"` would refuse to report it.
    [Input.Number.kind]: context =>
      context.h.input(
        context.slots.number.attrs([
          ...typed(context),
          context.h.Type('text'),
          context.h.InputMode('decimal'),
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
        (Input.Select.is(context.control) ? context.control.data.options : []).map(value => ({
          value,
          label: value,
        })),
        !context.input.control.required,
      ),
    [Input.RelationOne.kind]: context => pick(context, context.input.options, true),
    [Input.RelationMany.kind]: ({ input, draft, change, slots, h }) => {
      const chosen = Array.isArray(draft) ? (draft as ReadonlyArray<string>) : []
      return h.div(
        slots.choices.attrs([h.Id(input.id), h.Role('group'), h.AriaLabel(input.control.label)]),
        input.options.map(option =>
          h.label(
            [],
            [
              h.input(
                slots.choice.attrs([
                  h.Type('checkbox'),
                  h.Name(input.control.key),
                  h.Value(option.value),
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
    },
  }
}

/** The view of one field, to style or extend before handing it to `FormView.define`. */
const field = <Key extends string, Model, Message extends { readonly _tag: string }>(
  form: FormLike<Key, Model, Message>,
  options: {
    /** Renderers by kind, beside the ones shipped: a new kind, or another way to draw a shipped one. */
    readonly renderers?: Renderers<Message>
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
      const change = (value: Draft): Message =>
        send === undefined ? form.Message.Changed({ key, value }) : (send.changed(value) as Message)
      const blurred = send === undefined ? form.Message.Blurred({ key }) : (send.blurred as Message)
      const searched = (text: string): Message =>
        send === undefined ? form.Message.Searched({ key, text }) : (send.searched(text) as Message)
      const searches = control.control.searches
      const describedBy = [
        ...(description === undefined ? [] : [`${id}-description`]),
        ...(invalid ? [`${id}-error`] : []),
      ]
      const state = [
        h.Id(id),
        // The key is the field's name, so a form posts its drafts with scripts off.
        h.Name(key),
        h.AriaInvalid(invalid),
        // A check is running: the control is neither valid nor invalid yet.
        ...(input.field._tag === 'Validating' ? [h.AriaBusy(true)] : []),
        ...(required ? [h.AriaRequired(true)] : []),
        ...(describedBy.length === 0 ? [] : [h.AriaDescribedBy(describedBy.join(' '))]),
      ]
      const render = renderers[control.control.kind]
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
        state,
        slots,
        h,
      })

      return h.div(slots.root.attrs(), [
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

        /** The controls of a form or of a row. `id` and `path` say where: both are empty for the form itself. */
        const draw = (walk: Walk<Message>, id: string, path: string): ReadonlyArray<Html> =>
          walk.controls
            .filter(control => control.control.shown)
            .map((control): Html => {
              const { key, label } = control
              const here = `${id}-${key}`
              if (!Input.Nested.is(control.control)) {
                const state = walk.field(key)
                return fieldView(
                  {
                    control: control as FormControl<Key>,
                    field: state,
                    invalid: FieldValidation.isInvalid(state),
                    errors: errorsOf(state),
                    options: options[`${path}${key}`] ?? [],
                    id: here,
                    search: walk.search(key),
                    following: walk.following(key),
                    searchWord: input.words?.search,
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
          rows: key => form.rows(input.model, key as never),
          search: key => form.search(input.model, key as Key),
          following: key => form.isFollowing(input.model, key as Key),
          wrap: message => message as Message,
          make: form.Message as unknown as NestedForm['Message'],
        }
        return h.form(slots.root.attrs([h.OnSubmit(form.Message.Submitted())]), [
          ...draw(top, form.bundle.name, ''),
          ...(input.errors.length === 0
            ? []
            : [h.p(slots.errors.attrs([h.Role('alert')]), [...input.errors])]),
          h.button(slots.submit.attrs([h.Type('submit'), h.Disabled(!input.canSubmit)]), [
            input.words?.submit ?? 'Submit',
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
