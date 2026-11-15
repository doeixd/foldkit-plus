/**
 * The editor as one SlotView. Each action button draws its shortcut twice from
 * one pattern: `aria-keyshortcuts` for assistive technology and the label a
 * person reads in the `hint` slot. The clock is a parameter because the title
 * field stamps each edit for `History`'s pause, and a view must not read time
 * by itself.
 */
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { ariaKeyshortcuts, formatHotkey } from 'foldkit-primitives/events'
import { History } from 'foldkit-primitives/state'
import { control, dimmed, focus, muted, t } from '../style.js'
import { Message, REDO, RENAME, UNDO, redoLabel, titleOf, undoLabel, type Model } from './app.js'

export const EditorSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  field: Slot.make({ capability: Capability.TextInput }),
  actions: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive }),
  hint: Slot.make({ capability: Capability.Container }),
})

const Editor = SlotView.over(EditorSlots)<Model, Message>()

export const EditorStyle = Style.forSlots(EditorSlots)(
  {
    root: Style.self({ display: 'grid', gap: t.space.sm, inlineSize: '24rem' }),
    field: Style.compose(control, focus, Style.self({ cursor: 'text' })),
    actions: Style.self({ display: 'flex', gap: t.space.xs }),
    action: Style.compose(
      control,
      focus,
      dimmed,
      Style.self({ display: 'inline-flex', gap: t.space.xs, alignItems: 'baseline' }),
    ),
    hint: Style.self({ color: muted, fontSize: t.type['caption-size'] }),
  },
  { name: 'EditorStyle' },
)

export const editorView = (now: () => number) =>
  Editor.define((model, slots, h) => {
    const action = (pattern: string, text: string, message: Message, enabled: boolean) =>
      h.button(
        slots.action.attrs([
          h.Type('button'),
          h.AriaDisabled(!enabled),
          h.OnClick(message),
          ...Option.match(ariaKeyshortcuts(pattern, model.platform), {
            onNone: () => [],
            onSome: keys => [h.AriaKeyshortcuts(keys)],
          }),
        ]),
        [
          text,
          h.span(slots.hint.attrs(), [
            Option.getOrElse(formatHotkey(pattern, model.platform), () => ''),
          ]),
        ],
      )
    return h.div(slots.root.attrs(), [
      h.input(
        slots.field.attrs([
          h.AriaLabel('Title'),
          h.Value(titleOf(model)),
          h.OnInput(text => Message.Typed({ text, at: now() })),
        ]),
      ),
      h.div(slots.actions.attrs(), [
        action(RENAME, 'Rename', Message.Renamed(), true),
        action(UNDO, undoLabel(model), Message.Undone(), History.canUndo(model.history)),
        action(REDO, redoLabel(model), Message.Redone(), History.canRedo(model.history)),
      ]),
    ])
  }).pipe(Style.attach(EditorStyle))
