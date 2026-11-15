/**
 * The titles as one SlotView over `InlineEdit`: it writes the display's id,
 * its double click and keys, and the field's value, input, blur, Enter and
 * Escape. The view only chooses, per row, the display or the field, and draws
 * the refusal where the field is described by it.
 */
import { Option } from 'effect'
import { Behavior, Capability, Event, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { InlineEdit } from 'foldkit-primitives/interaction'
import { control, focus, panel, t } from '../style.js'
import { Message, Rename, renameArgs, type Model } from './app.js'

export const TitleSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Base }),
  title: Slot.make({ capability: Capability.Focusable }),
  field: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
  error: Slot.make({ capability: Capability.Base }),
  add: Slot.make({ capability: Capability.Interactive }),
})

const Titles = SlotView.over(TitleSlots)<Model, Message>()

export const Renames = InlineEdit.behavior(Rename, renameArgs)(TitleSlots)<Model, Message>({
  display: 'title',
  input: 'field',
  error: 'error',
  value: (model, id) => model.titles.find(title => title.id === id)?.text ?? '',
})

export const TitlesStyle = Style.forSlots(TitleSlots)(
  {
    root: Style.self({ display: 'grid', gap: t.space.xs, inlineSize: '24rem' }),
    list: Style.compose(
      panel,
      Style.self({ display: 'grid', margin: '0', padding: '0', listStyle: 'none' }),
    ),
    row: Style.self({ display: 'grid', gap: t.space.xs, padding: t.space.xs }),
    title: Style.compose(
      Style.self({
        font: 'inherit',
        color: 'inherit',
        background: 'transparent',
        border: '0',
        textAlign: 'start',
        cursor: 'text',
        padding: t.space.xs,
      }),
      focus,
    ),
    field: Style.compose(
      control,
      focus,
      Style.self({ cursor: 'text' }),
      Style.pseudo('[aria-invalid="true"]', { borderColor: t.error.outline }),
    ),
    error: Style.self({ margin: '0', color: t.error.ink, fontSize: t.size.sm }),
    add: Style.compose(control, focus),
  },
  { name: 'TitlesStyle' },
)

export const EditableTitles = Titles.define((model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.ul(
      slots.list.attrs([h.Role('list'), h.AriaLabel('Titles')]),
      model.titles.map((title, index) => {
        const editing = Option.filter(model.rename.editing, open => open.id === title.id)
        return h.li(
          slots.row.attrs([h.Key(title.id)]),
          Option.match(editing, {
            onNone: () => [
              h.button(slots.title.attrs([h.Type('button')], { index, id: title.id }), [
                title.text,
              ]),
            ],
            onSome: open => [
              h.input(slots.field.attrs([h.AriaLabel(`Rename ${title.text}`)])),
              ...Option.match(open.error, {
                onNone: () => [],
                onSome: reason => [h.p(slots.error.attrs(), [reason])],
              }),
            ],
          }),
        )
      }),
    ),
    h.button(slots.add.attrs([h.Type('button'), h.OnClick(Message.Added())]), ['Add title']),
  ]),
).pipe(Behavior.attach(Renames), Style.attach(TitlesStyle))
