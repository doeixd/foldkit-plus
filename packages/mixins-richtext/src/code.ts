/**
 * The code block toolbar: the block's language, chosen from the caller's list, and a Copy
 * button, drawn through slots. The language is the block's `language` prop, set through the
 * editor's `ChangedProps`, so it is saved and undone with the text; copying is the caller's
 * own Message, since writing to the clipboard is a Command the editor does not own.
 */
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'

/** The elements the toolbar publishes: its wrapper, the language picker, and the Copy button. */
export const CodeToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  language: Slot.make({ capability: Capability.Interactive }),
  copy: Slot.make({ capability: Capability.Interactive }),
})

/** A language the picker offers: the `language` prop's value, and what the picker shows. */
export interface CodeLanguage {
  readonly id: string
  readonly label: string
}

export interface CodeToolbarInput<Message> {
  readonly document: RichText.Document
  /** The code block the toolbar is for. */
  readonly node: RichText.NodeId
  /** What the picker offers, in order; `''` is code with no language. */
  readonly languages: ReadonlyArray<CodeLanguage>
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
  /** What Copy sends: the caller copies the block's text (`RichText.toText([block])`). */
  readonly copied: Message
}

/**
 * The code block toolbar as a slot view. The picker shows the block's language, and a language
 * the list does not name is offered as itself, so choosing nothing never changes it. Nothing is
 * drawn for a block that is not there.
 */
export const codeToolbar = <Message>(): SlotView.SlotView<
  typeof CodeToolbarSlots,
  CodeToolbarInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(CodeToolbarSlots, (input, slots, h): Html => {
    const block = RichText.locateBlock(input.document, input.node)?.block
    const current = block?.type === 'Node' ? block.props.language : undefined
    const language = typeof current === 'string' ? current : ''
    const languages = input.languages.some(each => each.id === language)
      ? input.languages
      : [...input.languages, { id: language, label: language }]
    return h.div(slots.root.attrs([h.Role('toolbar'), h.AriaLabel('Code')]), [
      h.select(
        slots.language.attrs([
          h.AriaLabel('Language'),
          h.Value(language),
          h.OnChange(chosen =>
            input.wrap(
              EditorMessage.ChangedProps({ node: input.node, props: { language: chosen } }),
            ),
          ),
        ]),
        languages.map(each =>
          h.option([h.Value(each.id), h.Selected(each.id === language)], [each.label]),
        ),
      ),
      h.button(
        slots.copy.attrs([
          h.Type('button'),
          h.DataAttribute('code', 'copy'),
          h.OnClick(input.copied),
        ]),
        ['Copy'],
      ),
    ])
  })
