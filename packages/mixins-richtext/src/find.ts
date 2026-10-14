/**
 * The find and replace bar, drawn through slots. Like the rest of the chrome it holds no state:
 * the query, the replacement, which match is current and whether case counts are the caller's,
 * the matches are a read of the document (`RichText.findMatches`), and replacing is the editor's
 * own `ReplacedText`, so a replacement is an edit with an undo step like any other.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import * as RichText from 'foldkit-richtext'
import { Message as EditorMessage, type EditorEvent } from 'foldkit-richtext-dom/editor'

/** The elements the bar publishes: its wrapper, its two fields, the count, and its buttons. */
export const FindReplaceSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  field: Slot.make({ capability: Capability.TextInput }),
  count: Slot.make({ capability: Capability.Container }),
  button: Slot.make({ capability: Capability.Interactive }),
})

export interface FindReplaceInput<Message> {
  readonly document: RichText.Document
  readonly query: string
  readonly replacement: string
  /** The match the bar is on, by its index in `RichText.findMatches`. */
  readonly current: number
  readonly caseSensitive: boolean
  readonly queried: (query: string) => Message
  readonly replacementDrafted: (replacement: string) => Message
  /** Go to the match at this index: the caller selects it and keeps the index. */
  readonly moved: (index: number) => Message
  readonly caseToggled: Message
  readonly closed: Message
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
}

/**
 * The index a step from `current` lands on among `count` matches, wrapping at either end, so
 * Enter keeps cycling through them as a browser's find does.
 */
export const stepMatch = (current: number, count: number, step: 1 | -1): number =>
  count === 0 ? 0 : (((current + step) % count) + count) % count

/**
 * The bar as a slot view. Enter in the find field goes to the next match and Shift+Enter to the
 * previous one; Escape in either field closes it. Replace replaces the current match and Replace
 * all every one; both are disabled with no match. Each button carries `data-find`.
 */
export const findReplace = <Message>(): SlotView.SlotView<
  typeof FindReplaceSlots,
  FindReplaceInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(FindReplaceSlots, (input, slots, h): Html => {
    const count = RichText.findMatches(input.document, input.query, input).length
    const current = Math.min(input.current, Math.max(0, count - 1))
    const go = (step: 1 | -1) => input.moved(stepMatch(current, count, step))
    const replaced = (at: number | undefined) =>
      input.wrap(
        EditorMessage.ReplacedText({
          query: input.query,
          replacement: input.replacement,
          caseSensitive: input.caseSensitive,
          ...(at === undefined ? {} : { at }),
        }),
      )
    const button = (
      id: string,
      label: string,
      message: Message,
      {
        disabled = false,
        pressed,
      }: { readonly disabled?: boolean; readonly pressed?: boolean } = {},
    ) =>
      h.button(
        slots.button.attrs([
          h.Type('button'),
          h.DataAttribute('find', id),
          h.AriaLabel(label),
          ...(pressed === undefined ? [] : [h.AriaPressed(pressed ? 'true' : 'false')]),
          h.Disabled(disabled),
          ...(disabled ? [] : [h.OnClick(message)]),
        ]),
        [label],
      )
    return h.div(slots.root.attrs([h.Role('search'), h.AriaLabel('Find and replace')]), [
      h.input(
        slots.field.attrs([
          h.Type('search'),
          h.DataAttribute('find', 'query'),
          h.AriaLabel('Find'),
          h.Placeholder('Find'),
          h.Value(input.query),
          h.OnInput(input.queried),
          h.OnKeyDownPreventDefault((key, modifiers) => {
            if (key === 'Escape') return Option.some(input.closed)
            if (key !== 'Enter' || count === 0) return Option.none()
            return Option.some(go(modifiers.shiftKey ? -1 : 1))
          }),
        ]),
      ),
      h.span(slots.count.attrs([h.AriaLive('polite')]), [
        input.query === '' ? '' : count === 0 ? 'No matches' : `${current + 1} of ${count}`,
      ]),
      button('previous', 'Previous', go(-1), { disabled: count === 0 }),
      button('next', 'Next', go(1), { disabled: count === 0 }),
      button('case', 'Match case', input.caseToggled, { pressed: input.caseSensitive }),
      h.input(
        slots.field.attrs([
          h.Type('text'),
          h.DataAttribute('find', 'replacement'),
          h.AriaLabel('Replace with'),
          h.Placeholder('Replace with'),
          h.Value(input.replacement),
          h.OnInput(input.replacementDrafted),
          h.OnKeyDownPreventDefault(key =>
            key === 'Escape' ? Option.some(input.closed) : Option.none(),
          ),
        ]),
      ),
      button('replace', 'Replace', replaced(current), { disabled: count === 0 }),
      button('replace-all', 'Replace all', replaced(undefined), { disabled: count === 0 }),
      button('close', 'Close', input.closed),
    ])
  })
