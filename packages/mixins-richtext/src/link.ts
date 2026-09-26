/**
 * The link editor (§11, §132): an address field and the two things it can do, drawn
 * through slots like the toolbar and the slash menu.
 *
 * It holds no state. The link it edits is a read of the document (`RichText.linkAt`), the
 * address being typed is the caller's `draft`, and what it sends is an editor Message
 * wrapped for the caller — `AppliedMark` to link the selection or change the link around
 * the caret, `ClearedMark` to remove it — so the editor Bundle makes each one transition.
 * Where it appears, and when, is the caller's: only the caller knows where the caret is.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'

/** The elements the editor publishes: its wrapper, the address field, and its two buttons. */
export const LinkEditorSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  apply: Slot.make({ capability: Capability.Interactive }),
  remove: Slot.make({ capability: Capability.Interactive }),
})

export interface LinkEditorInput<Message> {
  readonly document: RichText.Document
  readonly selection: RichText.Selection | null
  /** The address as typed so far; `RichText.linkAt(...)?.href` is what to start it from. */
  readonly draft: string
  /** What the field sends as the address changes. */
  readonly drafted: (href: string) => Message
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
}

/** Text to put a new link on: a range that is not a caret. */
const coversText = (selection: RichText.Selection | null): boolean =>
  selection?.type === 'Range' &&
  (selection.anchor.node !== selection.focus.node ||
    selection.anchor.offset !== selection.focus.offset)

/**
 * The link editor as a slot view. Applying needs an address the URL policy accepts
 * (`RichText.safeUrl`), which is what it sends, and something to link: a range, or a caret
 * inside a link. Otherwise the apply button is disabled and Enter in the field does nothing.
 * The remove button is drawn only inside a link.
 */
export const linkEditor = <Message>(): SlotView.SlotView<
  typeof LinkEditorSlots,
  LinkEditorInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(LinkEditorSlots, (input, slots, h): Html => {
    const link = RichText.linkAt(input.document, input.selection)
    const href = RichText.safeUrl(input.draft)
    const apply =
      href === undefined || (link === undefined && !coversText(input.selection))
        ? undefined
        : input.wrap(EditorMessage.AppliedMark({ mark: { name: 'Link', props: { href } } }))
    return h.div(slots.root.attrs([h.Role('group'), h.AriaLabel('Link')]), [
      h.input(
        slots.input.attrs([
          h.Type('url'),
          h.DataAttribute('link', 'address'),
          h.AriaLabel('Link address'),
          h.Value(input.draft),
          h.OnInput(input.drafted),
          h.OnKeyDownPreventDefault(key =>
            key === 'Enter' && apply !== undefined ? Option.some(apply) : Option.none(),
          ),
        ]),
      ),
      h.button(
        slots.apply.attrs([
          h.Type('button'),
          h.DataAttribute('link', 'apply'),
          h.Disabled(apply === undefined),
          ...(apply === undefined ? [] : [h.OnClick(apply)]),
        ]),
        [link === undefined ? 'Link' : 'Update'],
      ),
      ...(link === undefined
        ? []
        : [
            h.button(
              slots.remove.attrs([
                h.Type('button'),
                h.DataAttribute('link', 'remove'),
                h.OnClick(input.wrap(EditorMessage.ClearedMark({ mark: 'Link' }))),
              ]),
              ['Remove'],
            ),
          ]),
    ])
  })
