/**
 * The editor: a title field, a Save button and what became of the last save,
 * read from Remote's ledger. Each control carries the mark of the agent part
 * it is (`data-fk-part`), which nothing reads for authority.
 */
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { control, focus, muted, t } from '../style.js'
import { Parts } from './agent.js'
import { Message, stateOf, type Model, type Save } from './app.js'

export const EditorSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  field: Slot.make({ capability: Capability.TextInput }),
  save: Slot.make({ capability: Capability.Interactive }),
  status: Slot.make({ capability: Capability.Container }),
})

const Editor = SlotView.over(EditorSlots)<Model, Message>()

export const EditorStyle = Style.forSlots(EditorSlots)(
  {
    root: Style.self({ display: 'grid', gap: t.space.xs, inlineSize: '20rem' }),
    field: Style.compose(control, focus, Style.self({ cursor: 'text' })),
    save: Style.compose(control, focus),
    status: Style.self({ color: muted, minBlockSize: '1.5rem' }),
  },
  { name: 'EditorStyle' },
)

/** What each status says, a record so a status added to `Save` is a type error here. */
const WORDS: Record<Save['status'], (save: Save) => string> = {
  Pending: () => 'Saving…',
  Applied: () => 'Saved.',
  Failed: save => Option.getOrElse(save.refusal, () => 'Could not save.'),
  Unknown: () => '',
}

const describe = (model: Model): string => {
  const last = stateOf(model).saves.at(-1)
  return last === undefined ? '' : WORDS[last.status](last)
}

export const SaveEditor = Editor.define((model, slots, h) =>
  h.div(slots.root.attrs(), [
    h.input(
      slots.field.attrs([
        h.Id('save:title'),
        h.AriaLabel('Title'),
        h.Value(model.draft),
        h.OnInput(text => Message.ChangedDraft({ text })),
        ...Parts.attributes(h, 'title'),
      ]),
    ),
    h.button(
      slots.save.attrs([
        h.Id('save:save'),
        h.Type('button'),
        h.OnClick(Message.RequestedSave({ requestId: Option.none() })),
        ...Parts.attributes(h, 'save'),
      ]),
      ['Save'],
    ),
    h.p(slots.status.attrs([h.Role('status')]), [describe(model)]),
  ]),
).pipe(Style.attach(EditorStyle))
