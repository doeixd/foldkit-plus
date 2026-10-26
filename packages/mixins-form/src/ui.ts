import { Input as FormInput } from 'foldkit-form'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import {
  CheckboxGroupSlots,
  CheckboxSlots,
  Input,
  InputSlots,
  SelectSlots,
  Textarea,
  TextareaSlots,
  type FieldParts,
} from 'foldkit-mixins-ui'
import type { Html, HtmlBuilder } from 'foldkit/html'
import {
  FieldSlots,
  type FieldOverride,
  type FieldOverrideInput,
  type FormViewWords,
  type Option,
  type RenderContext,
  type Renderers,
} from './index.js'
import {
  chosenOf,
  groupState,
  literalOptions,
  plainRenderers,
  pressed,
  withChosen,
  type Shipped,
} from './renderers.js'

/** The look of each `foldkit-mixins-ui` component the table draws through. Each is optional. */
export interface UiStyles {
  readonly input?: NamedStyle<typeof InputSlots> | undefined
  readonly textarea?: NamedStyle<typeof TextareaSlots> | undefined
  readonly select?: NamedStyle<typeof SelectSlots> | undefined
  readonly checkbox?: NamedStyle<typeof CheckboxSlots> | undefined
  readonly checkboxGroup?: NamedStyle<typeof CheckboxGroupSlots> | undefined
}

/**
 * A renderer for every kind `foldkit-form` ships, drawn through
 * `foldkit-mixins-ui`'s Slots, for `FormView.define(form, { renderers })`. The
 * field around each control (label, description, checking line, error) is the
 * form view's own, and each control keeps what the plain one carries: the key
 * as its name, its id, and its validity and descriptions.
 *
 * Text, Number, Multiline and the selects are the plain elements under the
 * component's Slot, so its recipe styles them; a FieldSlots style on the same
 * element no longer reaches it. Toggle, Choices and RelationMany are the
 * Checkbox's `role="checkbox"` buttons, which Space presses and a label for
 * them names; a hidden input inside each checked one keeps a form posted
 * without scripts carrying it. The Mixins' input is the field's validation state.
 */
export const renderers = <Message>(styles: UiStyles = {}): Renderers<Message> => {
  const plain = plainRenderers<Message>()
  const builders = <S>(
    slots: S,
    style: NamedStyle<S> | undefined,
    context: RenderContext<Message>,
  ) =>
    SlotView.buildersFor(slots, style === undefined ? [] : [style.mixin], {
      input: context.input.field,
      h: context.h,
    })
  const textInput = (context: RenderContext<Message>) =>
    builders(InputSlots, styles.input, context).input
  const select = (context: RenderContext<Message>) =>
    builders(SelectSlots, styles.select, context).select
  // Typed as every shipped kind, so a kind left out is an error here; returned as
  // the table `renderers` takes, from which a call infers its Message.
  const table: Shipped<Message> = {
    Text: context =>
      plain.Text({ ...context, slots: { ...context.slots, text: textInput(context) } }),
    Number: context =>
      plain.Number({ ...context, slots: { ...context.slots, number: textInput(context) } }),
    Multiline: context =>
      plain.Multiline({
        ...context,
        slots: {
          ...context.slots,
          multiline: builders(TextareaSlots, styles.textarea, context).textarea,
        },
      }),
    Select: context =>
      plain.Select({ ...context, slots: { ...context.slots, select: select(context) } }),
    RelationOne: context =>
      plain.RelationOne({ ...context, slots: { ...context.slots, select: select(context) } }),
    Toggle: context => {
      const { state, draft, change, blurred, input, h } = context
      const on = draft === true
      return h.button(
        builders(CheckboxSlots, styles.checkbox, context).checkbox.attrs([
          // A button posts nothing, so the name goes on the hidden input inside it.
          ...state.filter(attribute => attribute._tag !== 'Name'),
          h.Type('button'),
          h.Role('checkbox'),
          h.AriaChecked(on),
          h.OnClick(change(!on)),
          h.OnBlur(blurred),
        ]),
        // A locked key's value is posted by the field already.
        on && input.locked !== true ? [hidden(h, input.control.key, 'on')] : [],
      )
    },
    Choices: context => checkboxes(context, literalOptions(context.control), styles),
    RelationMany: context => checkboxes(context, context.input.options, styles),
  }
  return table
}

const hidden = <Message>(h: HtmlBuilder<Message>, name: string, value: string): Html =>
  h.input([h.Attribute('type', 'hidden'), h.Attribute('name', name), h.Attribute('value', value)])

/** A key of any number of choices, as the CheckboxGroup draws one, under the field's own label. */
const checkboxes = <Message>(
  context: RenderContext<Message>,
  options: ReadonlyArray<Option>,
  styles: UiStyles,
): Html => {
  const { input, draft, change, state, h } = context
  const group = SlotView.buildersFor(
    CheckboxGroupSlots,
    styles.checkboxGroup === undefined ? [] : [styles.checkboxGroup.mixin],
    { input: input.field, h },
  )
  const chosen = chosenOf(draft)
  const isChosen = new Set(chosen)
  const locked = input.locked === true
  return h.div(
    group.root.attrs([...groupState(state), h.Role('group'), h.AriaLabel(input.control.label)]),
    [
      h.div(
        group.options.attrs(),
        withChosen(options, chosen).map((option, index) => {
          const on = isChosen.has(option.value)
          const id = `${input.id}-${index}`
          return h.div(group.option.attrs([h.DataAttribute('checked', String(on))]), [
            h.button(
              group.checkbox.attrs([
                h.Type('button'),
                h.Id(id),
                h.Role('checkbox'),
                h.AriaChecked(on),
                ...(locked
                  ? [h.Disabled(true), h.AriaDisabled(true)]
                  : [h.OnClick(change(pressed(chosen, option.value)))]),
              ]),
              on && !locked ? [hidden(h, input.control.key, option.value)] : [],
            ),
            h.label(group.label.attrs([h.For(id)]), [option.label]),
          ])
        }),
      ),
    ],
  )
}

/** UI field parts for an application-owned layout, with the form's validation state. */
export interface UiFieldParts extends FieldParts {
  readonly field: FieldOverrideInput['field']
}

export interface UiFieldOptions<FormMessage, Message> {
  readonly toMessage: (message: FormMessage) => Message
  readonly inputStyle: NamedStyle<typeof InputSlots>
  readonly textareaStyle?: NamedStyle<typeof TextareaSlots>
  readonly draw?: (parts: UiFieldParts, h: HtmlBuilder<Message>) => Html
  /** The form view's words; this reads `checking`, said while the key's check runs. */
  readonly words?: FormViewWords | undefined
}

/** A FormView.fields override for Text/Multiline keys drawn through the UI adapters. */
export const field =
  <FormMessage, Message>(
    options: UiFieldOptions<FormMessage, Message>,
  ): FieldOverride<string, FormMessage, Message> =>
  (input, h) => {
    const checking = input.field._tag === 'Validating'
    const description = [
      ...(input.control.description === undefined ? [] : [input.control.description]),
      ...(checking ? [options.words?.checking ?? 'Checking…'] : []),
      ...input.errors,
    ]
    const extra = [
      h.Name(input.control.key),
      h.OnBlur(options.toMessage(input.blurred)),
      ...(input.control.required ? [h.AriaRequired(true)] : []),
      ...(checking ? [h.AriaBusy(true)] : []),
    ]
    const finish = (parts: FieldParts): Html => {
      const value: UiFieldParts = { ...parts, field: input.field }
      return options.draw === undefined
        ? h.div(
            SlotView.buildersFor(FieldSlots, [], { input, h }).root.attrs([
              h.DataAttribute('validation', input.field._tag),
            ]),
            [parts.label, parts.control, parts.description],
          )
        : options.draw(value, h)
    }
    const described = (attributes: Parameters<typeof h.span>[0]): Html =>
      description.length === 0
        ? h.empty
        : h.span(
            [
              ...attributes,
              ...(checking ? [h.Role('status')] : []),
              ...(input.invalid ? [h.Role('alert')] : []),
            ],
            [description.join(' ')],
          )
    const common = {
      id: input.id,
      value: String(input.field.value),
      onInput: (value: string) => options.toMessage(input.changed(value)),
      invalid: input.invalid,
      described: description.length > 0,
      placeholder: input.attrs.placeholder,
      input: input.field,
    }
    if (FormInput.Text.is(input.control.control))
      return Input.view(
        {
          ...common,
          type: input.attrs.type ?? 'text',
          style: options.inputStyle,
          draw: resolved =>
            finish({
              label: h.label(resolved.label, [input.control.label]),
              control: h.input([...resolved.input, ...extra]),
              description: described(resolved.description),
            }),
        },
        h,
      )
    if (FormInput.Multiline.is(input.control.control))
      return Textarea.view(
        {
          ...common,
          rows: input.attrs.rows,
          style: options.textareaStyle,
          draw: resolved =>
            finish({
              label: h.label(resolved.label, [input.control.label]),
              control: h.textarea([...resolved.textarea, ...extra]),
              description: described(resolved.description),
            }),
        },
        h,
      )
    throw new Error(
      `UI form field does not draw "${input.control.control.kind}" ("${input.control.key}")`,
    )
  }
