/**
 * The list as one SlotView over five Behaviors: `Reorder` (keys and pointer
 * on the grip), `Presence` (what a leaving row is while it leaves),
 * `FocusRecovery` (where focus goes when the row it was in leaves or moves),
 * a `Keys` owner for the editor's Enter and Escape, and the Collection that
 * writes each row's id. Each draws only its own attributes.
 */
import { Option } from 'effect'
import {
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  Style,
} from 'foldkit-mixins'
import { LiveAnnounce, FocusRecovery, Presence, Reorder } from 'foldkit-primitives/interaction'
import { control, dimmed, focus, heldRow, panel, t } from '../style.js'
import { Message, Rows, editId, editorId, phaseOf, type Model } from './app.js'

const { Keys } = Behaviors

export const ListSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Base }),
  grip: Slot.make({ capability: Capability.Focusable, events: [Event.KeyDown, Event.Blur] }),
  title: Slot.make({ capability: Capability.Container }),
  edit: Slot.make({ capability: Capability.Interactive }),
  editor: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
  dismiss: Slot.make({ capability: Capability.Interactive }),
  add: Slot.make({ capability: Capability.Interactive }),
  live: Slot.make({ capability: Capability.Container }),
})

const List = SlotView.over(ListSlots)<Model, Message>()

const ids = (model: Model) => model.items.map(item => item.id)

export const Reorders = Reorder.behavior(Rows)(List)({
  container: 'list',
  item: 'row',
  handle: 'grip',
  items: ids,
})

export const Leaves = Presence.behavior(List)({
  content: 'row',
  phase: (model, item) => {
    if (item?.id === undefined)
      throw new Error('a row is drawn without its id: slots.row.attrs(…, { index, id })')
    return phaseOf(model, item.id)
  },
})

/** Focus leaves a dismissed row in the frame it turns inert, for the next row's button, else the Add button. */
export const Recovers = FocusRecovery.behavior(List)({
  owner: 'root',
  parts: {
    // A keyed move takes the row out and back, and the browser drops its focus.
    grip: ['same'],
    // A child's own parent row comes first; a row with none goes straight to its neighbours.
    dismiss: ['parent', 'next', 'previous', { part: 'add' }],
  },
  parent: (model, item) =>
    Option.flatMap(
      Option.fromUndefinedOr(model.items.find(each => each.id === item.id)),
      each => each.parent,
    ),
})

export const EditorKeys = Keys.behavior(List)({
  slot: 'editor',
  name: 'EditorKeys',
  routes: [
    Keys.route<Model, Message>('Commit', {
      on: [Keys.chord('Enter')],
      handle: () => Option.some(Message.Committed()),
    }),
    Keys.route<Model, Message>('Cancel', {
      on: [Keys.chord('Escape')],
      handle: () => Option.some(Message.Cancelled()),
    }),
  ],
})

export const ListStyle = Style.forSlots(ListSlots)(
  {
    root: Style.self({ display: 'grid', gap: t.space.xs, inlineSize: '24rem' }),
    list: Style.compose(
      panel,
      Style.self({ display: 'grid', margin: '0', padding: '0', listStyle: 'none' }),
    ),
    row: Style.compose(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: t.space.xs,
        padding: t.space.xs,
        transitionProperty: 'opacity',
        transitionDuration: `calc(${t.motion.fast} * ${t.knob.travel})`,
      }),
      Style.pseudo('[data-level]', { paddingInlineStart: t.space.lg }),
      Style.pseudo('[data-presence="hiding"]', { opacity: '0' }),
      Style.pseudo('[data-reorder-over="before"]', {
        boxShadow: `inset 0 2px 0 ${t.outline.focus}`,
      }),
      Style.pseudo('[data-reorder-over="after"]', {
        boxShadow: `inset 0 -2px 0 ${t.outline.focus}`,
      }),
      heldRow,
    ),
    grip: Style.compose(control, focus, Style.self({ cursor: 'grab', touchAction: 'none' })),
    title: Style.self({ flex: '1' }),
    edit: Style.compose(control, focus),
    editor: Style.compose(control, focus, Style.self({ flex: '1', cursor: 'text' })),
    dismiss: Style.compose(control, focus, dimmed),
    add: Style.compose(control, focus),
    // Spoken, never drawn: `display: none` would silence the regions.
    live: Style.nest('& [data-foldkit-plus-live]', {
      position: 'absolute',
      inlineSize: '1px',
      blockSize: '1px',
      overflow: 'hidden',
      clipPath: 'inset(50%)',
      whiteSpace: 'nowrap',
    }),
  },
  { name: 'ListStyle' },
)

export const EditableList = List.define((model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.ul(
      slots.list.attrs([h.Role('list'), h.AriaLabel('Tasks')]),
      model.items.map((item, index) => {
        const editing = Option.exists(model.editing, id => id === item.id)
        return h.li(
          slots.row.attrs(
            [
              h.Key(item.id),
              ...Option.match(item.parent, {
                onNone: () => [],
                onSome: () => [h.DataAttribute('level', '1')],
              }),
            ],
            { index, id: item.id },
          ),
          editing
            ? [
                h.input(
                  slots.editor.attrs(
                    [
                      h.Id(editorId(model.id, item.id)),
                      h.AriaLabel(`Rename ${item.title}`),
                      h.Value(model.draft),
                      h.OnInput(text => Message.Drafted({ text })),
                    ],
                    { index, id: item.id },
                  ),
                ),
              ]
            : [
                h.button(
                  slots.grip.attrs([h.Type('button'), h.AriaLabel(`Move ${item.title}`)], {
                    index,
                    id: item.id,
                  }),
                  ['⠿'],
                ),
                h.span(slots.title.attrs(), [item.title]),
                h.button(
                  slots.edit.attrs(
                    [
                      h.Id(editId(model.id, item.id)),
                      h.Type('button'),
                      h.AriaLabel(`Edit ${item.title}`),
                      h.OnClick(Message.StartedEdit({ id: item.id })),
                    ],
                    { index, id: item.id },
                  ),
                  ['Edit'],
                ),
                h.button(
                  slots.dismiss.attrs(
                    [
                      h.Type('button'),
                      h.AriaLabel(`Dismiss ${item.title}`),
                      h.OnClick(Message.Dismissed({ id: item.id })),
                    ],
                    { index, id: item.id },
                  ),
                  ['×'],
                ),
              ],
        )
      }),
    ),
    h.button(slots.add.attrs([h.Type('button'), h.OnClick(Message.Added())]), ['Add item']),
    h.div(slots.live.attrs(), [LiveAnnounce.view(model.live, h)]),
  ]),
).pipe(
  Behavior.attach(Reorders),
  Behavior.attach(Leaves),
  Behavior.attach(Recovers),
  Behavior.attach(EditorKeys),
  Style.attach(ListStyle),
)
