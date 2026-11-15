/**
 * Tabs assembled from primitives: `RovingTabindex` for the arrows, Home and
 * End and the one tab stop (mirrored under right to left), `Selection` for
 * `aria-selected` and the click. Choosing follows the keyboard, which is the
 * parent's rule: `update` selects the tab that became current.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { RovingTabindex, Selection } from 'foldkit-primitives/interaction'
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

const Roving = Bundle.declare(RovingTabindex.bundle, 'roving')
const Sel = Bundle.declare(Selection.bundle, 'selection')

const Model = Schema.Struct({ ...Roving.fields, ...Sel.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Roving.cases, ...Sel.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const rovingArgs = { orientation: 'horizontal', loop: false, virtual: false } as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const Parts = Slots.define({
  tablist: Slot.make({ capability: Capability.Interactive, events: [Event.KeyDown] }),
  tab: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Click],
    attributes: [Attr.AriaSelected],
  }),
  panel: Slot.make({ capability: Capability.Container }),
})

export interface Tab {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
}

interface Input extends Model {
  readonly tabs: ReadonlyArray<Tab>
  readonly direction: 'ltr' | 'rtl'
}

const Pattern = A11y.pattern({
  tablist: { capability: Capability.Interactive, obligations: [A11y.Navigation, A11y.Name] },
  tab: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

const Tabs = SlotView.over(Parts)<Input, Message>()

const itemsOf = (input: Input) =>
  Behaviors.Collection.of(input.tabs, {
    id: tab => tab.id,
    disabled: tab => tab.disabled === true,
  })

const view = Tabs.define(
  (input, slots, h) => {
    const chosen = input.selection.selected[0]
    return h.div(
      [],
      [
        h.div(
          slots.tablist.attrs([h.Role('tablist'), h.AriaLabel('Project')]),
          input.tabs.map((tab, index) =>
            h.button(
              slots.tab.attrs(
                [
                  h.Id(tab.id),
                  h.Role('tab'),
                  h.Type('button'),
                  ...(tab.id === chosen ? [h.AriaControls(`${tab.id}-panel`)] : []),
                  ...(tab.disabled === true ? [h.AriaDisabled(true)] : []),
                ],
                { id: tab.id, index },
              ),
              [tab.label],
            ),
          ),
        ),
        ...input.tabs
          .filter(tab => tab.id === chosen)
          .map(tab =>
            h.div(
              slots.panel.attrs([
                h.Id(`${tab.id}-panel`),
                h.Role('tabpanel'),
                h.AriaLabelledBy(tab.id),
              ]),
              [`${tab.label} content`],
            ),
          ),
      ],
    )
  },
  { name: 'HandBuiltTabs' },
).pipe(
  Behavior.attach(
    RovingTabindex.behavior(Roving, rovingArgs)(Tabs)({
      container: 'tablist',
      item: 'tab',
      items: itemsOf,
      direction: input => input.direction,
    }),
  ),
  Behavior.attach(Selection.behavior(Sel, selArgs)(Tabs)({ item: 'tab', items: itemsOf })),
  SlotView.attach(A11y.base({ tablist: [A11y.Name] })),
  A11y.conform(Pattern),
)

export const mount = (tabs: ReadonlyArray<Tab>, direction: 'ltr' | 'rtl') => {
  const roving = Page.at(Roving, { args: rovingArgs })
  const selection = Page.at(Sel, { args: selArgs })
  const container = document.createElement('div')
  container.id = 'conformance-hand-tabs'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          roving: { current: null },
          selection: { selected: [tabs[0]!.id], anchor: tabs[0]!.id },
        },
      }),
      update: (model: Model, message: Message) => {
        const moved = roving.update(model, message)
        if (Option.isSome(moved)) {
          const current = moved.value.model.roving.current
          // Choosing follows the keyboard.
          return current === null || moved.value.model.selection.selected[0] === current
            ? moved.value
            : Option.getOrElse(
                selection.update(
                  moved.value.model,
                  Sel.wrapper.make(Selection.Message.Activated({ id: current })),
                ),
                () => moved.value,
              )
        }
        return Option.getOrElse(selection.update(model, message), () => ({ model }))
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div([h.Dir(direction)], [view({ ...model, tabs, direction }, h)]),
    }),
  )
}

/** The tabs as a server draws them: the third tab chosen. */
export const served = (tabs: ReadonlyArray<Tab>, h: HtmlBuilder<Message>) =>
  view(
    {
      roving: { current: null },
      selection: { selected: [tabs[2]!.id], anchor: tabs[2]!.id },
      tabs,
      direction: 'ltr',
    },
    h,
  )

export type { Message }
