/**
 * A listbox assembled from primitives, with no shipped widget in it:
 * `ListNavigation` for the keys and the roving stop, `Selection` for
 * `aria-selected` and the click, and one `Keys` route of its own for Enter and
 * Space on an option. It conforms to a pattern naming what a listbox owes, so
 * the rendered scenario is run over a view the structural check has passed.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { ListNavigation, Selection } from 'foldkit-primitives/interaction'
import {
  A11y,
  Attr,
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
} from 'foldkit-mixins'

const List = Bundle.declare(ListNavigation.bundle, 'list')
const Sel = Bundle.declare(Selection.bundle, 'selection')

const Model = Schema.Struct({ ...List.fields, ...Sel.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...List.cases, ...Sel.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const listArgs = {
  orientation: 'vertical',
  loop: false,
  virtual: false,
  timeoutMs: 500,
  page: 10,
} as const
const horizontalArgs = { ...listArgs, orientation: 'horizontal' } as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const Parts = Slots.define({
  listbox: Slot.make({ capability: Capability.Interactive, events: [Event.KeyDown] }),
  option: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.AriaSelected],
  }),
})

export interface Input extends Model {
  readonly options: ReadonlyArray<{
    readonly id: string
    readonly label: string
    readonly disabled?: boolean
  }>
  readonly direction: 'ltr' | 'rtl'
}

const Pattern = A11y.pattern({
  listbox: { capability: Capability.Interactive, obligations: [A11y.Navigation, A11y.Name] },
  option: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

const Options = SlotView.over(Parts)<Input, Message>()

const itemsOf = (input: Input) =>
  Behaviors.Collection.of(input.options, {
    id: option => option.id,
    disabled: option => option.disabled === true,
  })

const keys = (args: typeof listArgs | typeof horizontalArgs) =>
  ListNavigation.behavior(List, args)(Options)({
    container: 'listbox',
    item: 'option',
    items: itemsOf,
    text: (input, index) => input.options[index]?.label ?? '',
    direction: input => input.direction,
  })

const picks = Selection.behavior(Sel, selArgs)(Options)({ item: 'option', items: itemsOf })

/** Enter and Space on the option that has the keyboard: the click's keyboard twin. */
const activates = Behaviors.Keys.behavior(Options)({
  slot: 'option',
  name: 'Activates',
  routes: [
    Behaviors.Keys.route<Input, Message>('Activate', {
      on: [Behaviors.Keys.chord('Enter'), Behaviors.Keys.chord(' ')],
      handle: ({ item, input }) => {
        const id = item?.id
        return id === undefined || input.options.find(option => option.id === id)?.disabled === true
          ? Option.none()
          : Option.some(Sel.wrapper.make(Selection.Message.Activated({ id })))
      },
    }),
  ],
})

const view = (orientation: 'vertical' | 'horizontal') =>
  Options.define(
    (input, slots, h) =>
      h.ul(
        slots.listbox.attrs([h.Role('listbox'), h.AriaLabel('Frequency')]),
        input.options.map((option, index) =>
          h.li(
            slots.option.attrs(
              [
                h.Id(option.id),
                h.Role('option'),
                ...(option.disabled === true ? [h.AriaDisabled(true)] : []),
              ],
              { id: option.id, index },
            ),
            [option.label],
          ),
        ),
      ),
    { name: 'HandBuiltListbox' },
  ).pipe(
    Behavior.attach(keys(orientation === 'vertical' ? listArgs : horizontalArgs)),
    Behavior.attach(picks),
    Behavior.attach(activates),
    SlotView.attach(A11y.base({ listbox: [A11y.Name] })),
    A11y.conform(Pattern),
  )

export const mount = (
  options: ReadonlyArray<{
    readonly id: string
    readonly label: string
    readonly disabled?: boolean
  }>,
  orientation: 'vertical' | 'horizontal',
  direction: 'ltr' | 'rtl',
) => {
  const listbox = view(orientation)
  const listPlaced = Page.at(List, {
    args: orientation === 'vertical' ? listArgs : horizontalArgs,
  })
  const selPlaced = Page.at(Sel, { args: selArgs })
  const container = document.createElement('div')
  container.id = 'conformance-hand-listbox'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          list: { current: null, query: '', generation: 0 },
          selection: { selected: [], anchor: null },
        },
      }),
      update: (model: Model, message: Message) =>
        Option.getOrElse(
          Option.orElse(listPlaced.update(model, message), () => selPlaced.update(model, message)),
          () => ({ model }),
        ),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div([h.Dir(direction)], [listbox({ ...model, options, direction }, h)]),
    }),
  )
}

/** The listbox as a server draws it: the third option chosen, nothing yet focused. */
export const served = (
  options: ReadonlyArray<{
    readonly id: string
    readonly label: string
    readonly disabled?: boolean
  }>,
  h: HtmlBuilder<Message>,
) =>
  view('vertical')(
    {
      list: { current: null, query: '', generation: 0 },
      selection: { selected: [options[2]!.id], anchor: null },
      options,
      direction: 'ltr',
    },
    h,
  )

export type { Message }
