/**
 * The popup as one SlotView, assembled from primitives and conformed to the
 * listbox pattern: `ListNavigation` and `Selection` supply what a listbox owes,
 * `Overlay.nonModal` supplies the dismissal and the return of focus to the
 * trigger, and a `Keys` owner on each option turns Enter and Space into a pick.
 * Its tests run the rendered `Conformance.listbox` scenario over it.
 */
import { Option } from 'effect'
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
  Style,
} from 'foldkit-mixins'
import { ListNavigation, Overlay, Selection } from 'foldkit-primitives/interaction'
import { active, control, focus, panel, t } from '../style.js'
import {
  CHOICES,
  Message,
  Nav,
  Sel,
  Stack,
  choiceId,
  choiceOf,
  labelOf,
  layerId,
  navArgs,
  selArgs,
  type Model,
} from './app.js'

const { Keys } = Behaviors

export const PopupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Interactive, events: [Event.KeyDown] }),
  panel: Slot.make({ capability: Capability.Container }),
  listbox: Slot.make({ capability: Capability.Interactive, events: [Event.KeyDown] }),
  option: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.AriaSelected],
  }),
})

/** What a listbox owes: navigation and a name on the box, a way in, a press and `aria-selected` on each option. */
export const Listbox = A11y.pattern({
  listbox: { capability: Capability.Interactive, obligations: [A11y.Navigation, A11y.Name] },
  option: {
    capability: Capability.Focusable,
    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],
  },
})

const Popup = SlotView.over(PopupSlots)<Model, Message>()

const itemsOf = (model: Model) =>
  Behaviors.Collection.of(CHOICES, {
    id: choice => choiceId(model.id, choice),
    disabled: choice => choice.disabled === true,
  })

const Navigates = ListNavigation.behavior(Nav, navArgs)(Popup)({
  container: 'listbox',
  item: 'option',
  items: itemsOf,
  text: (model, index) => CHOICES[index]?.label ?? '',
})

const Selects = Selection.behavior(Sel, selArgs)(Popup)({
  item: 'option',
  items: itemsOf,
  // A click picks and closes, which is the parent's Message.
  click: false,
})

/** Enter and Space on the option that has the keyboard: the click's keyboard twin. */
const Activates = Keys.behavior(Popup)({
  slot: 'option',
  name: 'Activates',
  routes: [
    Keys.route<Model, Message>('Activate', {
      on: [Keys.chord('Enter'), Keys.chord(' ')],
      handle: ({ item }) =>
        item?.id === undefined ? Option.none() : Option.some(Message.Picked({ id: item.id })),
    }),
  ],
})

/** ArrowDown and ArrowUp on the trigger open the popup, as a native select does. */
const Opens = Keys.behavior(Popup)({
  slot: 'trigger',
  name: 'Opens',
  routes: [
    Keys.route<Model, Message>('Open', {
      on: [Keys.chord('ArrowDown'), Keys.chord('ArrowUp')],
      handle: () => Option.some(Message.Opened()),
    }),
  ],
})

export const PopupOverlay = Overlay.behaviors(PopupSlots)<Model, Message, 'layers'>({
  stack: Stack,
  layer: 'panel',
  trigger: 'trigger',
  id: model => layerId(model.id),
  policy: Overlay.nonModal,
})

export const PopupStyle = Style.forSlots(PopupSlots)(
  {
    root: Style.self({ position: 'relative', display: 'inline-block' }),
    trigger: Style.compose(control, focus),
    panel: Style.compose(
      panel,
      Style.self({
        position: 'absolute',
        insetBlockStart: 'calc(100% + 4px)',
        insetInlineStart: '0',
        zIndex: '10',
        minInlineSize: '100%',
      }),
    ),
    listbox: Style.self({ margin: '0', padding: '0', listStyle: 'none' }),
    option: Style.compose(
      Style.self({ padding: `${t.space.xs} ${t.space.sm}`, cursor: 'pointer' }),
      focus,
      active,
      Style.states({ true: { opacity: '0.45', cursor: 'not-allowed' } }, 'aria-disabled'),
    ),
  },
  { name: 'PopupStyle' },
)

export const ChoicePopup = Popup.define((model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.button(
      slots.trigger.attrs([
        h.Id(`${model.id}:trigger`),
        h.Type('button'),
        h.AriaHasPopup('listbox'),
        h.AriaExpanded(model.open),
        h.OnClick(Message.Toggled()),
      ]),
      [labelOf(model)],
    ),
    ...(model.open
      ? [
          h.div(slots.panel.attrs(), [
            h.ul(
              slots.listbox.attrs([h.Role('listbox'), h.AriaLabel('Frequency')]),
              CHOICES.map((choice, index) =>
                h.li(
                  slots.option.attrs(
                    [
                      h.Key(choiceId(model.id, choice)),
                      h.Role('option'),
                      h.OnClick(Message.Picked({ id: choiceId(model.id, choice) })),
                    ],
                    { index, id: choiceId(model.id, choice) },
                  ),
                  [choice.label],
                ),
              ),
            ),
          ]),
        ]
      : []),
  ]),
)
  // The overlay's Behaviors come as a list, which a typed `pipe` cannot follow, so they go first.
  .pipe(...PopupOverlay.map(Behavior.attach))
  .pipe(
    Behavior.attach(Navigates),
    Behavior.attach(Selects),
    Behavior.attach(Activates),
    Behavior.attach(Opens),
    Behavior.attach(Behaviors.Collection.behavior(Popup)({ item: 'option', items: itemsOf })),
    // The view draws the click's `OnClick` and `Activates` draws Enter and Space: its own word, as no Behavior states it.
    SlotView.attach(A11y.base({ listbox: [A11y.Name], option: [A11y.Activation] })),
    Style.attach(PopupStyle),
    A11y.conform(Listbox),
  )

export { choiceOf }
