import { Option } from 'effect'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { CellEditor, type FilterForm, readForm } from 'foldkit-data-grid'
import type { SlotView } from 'foldkit-mixins'
import type { GridSlots } from './slots.js'

/** The words of a column's filter: each has a default. */
export interface FilterWords {
  /** The name of a column's filter button and form. `{column}` is its header. Default `Filter {column}`. */
  readonly filter?: string
  /** Said of a filtered column's header (`aria-description`). Default `Filtered`. */
  readonly filtered?: string
  /** Default `Contains`. */
  readonly contains?: string
  /** A number's lower and upper bound. Defaults `At least`, `At most`. */
  readonly atLeast?: string
  readonly atMost?: string
  /** A date's first and last day. Defaults `From`, `To`. */
  readonly from?: string
  readonly to?: string
  /** A checkbox column's choices. Defaults `Any`, `Checked`, `Unchecked`. */
  readonly any?: string
  readonly checked?: string
  readonly unchecked?: string
  /** Default `Clear`. */
  readonly clear?: string
  /** A bound that is no number. Default `Not a number`. */
  readonly notNumber?: string
  /** An upper bound below the lower, which keeps no row. Default `Below the lower bound`. */
  readonly crossed?: string
}

type Field = 'text' | 'min' | 'max' | 'from' | 'to'

export interface FilterFormArgs<Message> {
  readonly h: HtmlBuilder<Message>
  readonly slots: SlotView.SlotBuilders<typeof GridSlots, Message>
  /** The DOM id of one part of this form. */
  readonly idOf: (part: string) => string
  readonly header: string
  readonly kind: CellEditor
  readonly form: FilterForm
  /** Whether a filter holds, so Clear is drawn. */
  readonly filtered: boolean
  readonly words: FilterWords
  /** What holds focus on the form's first control. */
  readonly hold: Attribute<Message>
  readonly typed: (field: Field, text: string) => Message
  readonly toggled: (option: string) => Message
  readonly checked: (state: 'any' | 'true' | 'false') => Message
  readonly cleared: Message
  readonly closed: Message
}

/**
 * A column's open filter form: a non-modal dialog of native fields for its
 * kind, below the header. It applies as it is typed; Escape closes it.
 */
export const filterForm = <Message>(args: FilterFormArgs<Message>): Html => {
  const { h, slots, words, form } = args
  const reading = readForm(args.kind, form)
  const say = (template: string) => template.replaceAll('{column}', args.header)
  /** Why a bound is marked, if it is: no number, or below the lower bound. */
  const errorOf = (field: Field): Option.Option<string> => {
    const invalid: ReadonlyArray<Field> = reading.invalid
    if (invalid.includes(field)) {
      return Option.some(words.notNumber ?? 'Not a number')
    }
    return reading.crossed && (field === 'max' || field === 'to')
      ? Option.some(words.crossed ?? 'Below the lower bound')
      : Option.none()
  }
  // A field, and below it why it is marked, if it is.
  const field = (
    name: Field,
    said: string,
    type: 'text' | 'date',
    first: boolean,
    decimal = false,
  ): ReadonlyArray<Html> => {
    const error = errorOf(name)
    const errorId = args.idOf(`${name}-error`)
    const label = h.label(slots.filterLabel.attrs(), [
      said,
      h.input(
        slots.filterField.attrs([
          h.Id(args.idOf(name)),
          h.Type(type),
          h.Value(form[name]),
          ...(decimal ? [h.InputMode('decimal')] : []),
          h.AriaInvalid(Option.isSome(error)),
          ...(Option.isSome(error) ? [h.AriaDescribedBy(errorId)] : []),
          h.OnInput(text => args.typed(name, text)),
          ...(first ? [args.hold] : []),
        ]),
      ),
    ])
    return [
      label,
      ...Option.match(error, {
        onNone: () => [],
        onSome: message => [h.p(slots.filterError.attrs([h.Id(errorId)]), [message])],
      }),
    ]
  }
  const choice = (
    role: 'group' | 'radiogroup',
    boxes: ReadonlyArray<{
      readonly label: string
      readonly checked: boolean
      readonly message: Message
      readonly first: boolean
    }>,
  ): Html =>
    h.div(
      slots.filterGroup.attrs([h.Role(role), h.AriaLabel(args.header)]),
      boxes.map(box =>
        h.label(slots.filterLabel.attrs(), [
          h.input(
            slots.filterCheck.attrs([
              h.Type(role === 'group' ? 'checkbox' : 'radio'),
              ...(role === 'radiogroup' ? [h.Name(args.idOf('state'))] : []),
              h.Checked(box.checked),
              h.OnClick(box.message),
              ...(box.first ? [args.hold] : []),
            ]),
          ),
          box.label,
        ]),
      ),
    )
  const controls: ReadonlyArray<Html> = CellEditor.match(args.kind, {
    Text: () => field('text', words.contains ?? 'Contains', 'text', true),
    Number: () => [
      ...field('min', words.atLeast ?? 'At least', 'text', true, true),
      ...field('max', words.atMost ?? 'At most', 'text', false, true),
    ],
    Date: () => [
      ...field('from', words.from ?? 'From', 'date', true),
      ...field('to', words.to ?? 'To', 'date', false),
    ],
    Choice: ({ options }) => [
      choice(
        'group',
        options.map((option, index) => ({
          label: option,
          checked: form.options.includes(option),
          message: args.toggled(option),
          first: index === 0,
        })),
      ),
    ],
    Checkbox: () => [
      choice(
        'radiogroup',
        (
          [
            ['any', words.any ?? 'Any'],
            ['true', words.checked ?? 'Checked'],
            ['false', words.unchecked ?? 'Unchecked'],
          ] as const
        ).map(([state, label]) => ({
          label,
          checked: form.checked === state,
          message: args.checked(state),
          first: form.checked === state,
        })),
      ),
    ],
  })
  return h.div(
    slots.filter.attrs([
      h.Role('dialog'),
      h.Id(args.idOf('form')),
      // Safari focuses no checkbox it is pressed on: the press lands in the
      // form, which keeps focus inside the header.
      h.Tabindex(-1),
      h.AriaLabel(say(words.filter ?? 'Filter {column}')),
      h.OnKeyDownPreventDefault(key =>
        key === 'Escape' ? Option.some(args.closed) : Option.none(),
      ),
      h.Style({ position: 'absolute', top: '100%', insetInlineStart: '0' }),
    ]),
    [
      ...controls,
      ...(args.filtered
        ? [
            h.button(slots.filterClear.attrs([h.Type('button'), h.OnClick(args.cleared)]), [
              words.clear ?? 'Clear',
            ]),
          ]
        : []),
    ],
  )
}
