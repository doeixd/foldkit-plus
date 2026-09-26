/**
 * The command palette (§11, §68, §142): the slash menu's catalogue, searched from a field of
 * its own rather than typed into the document, drawn through slots like the rest of the chrome.
 *
 * It holds no state. Whether it is open, the query, and the highlighted index are the
 * caller's, as `{ query, index } | null` in its Model; the view filters with the slash menu's
 * `matchingEntries` and sends what the caller should store next. Choosing an entry sends the
 * entry's own Message, so a caller that closes the palette on a choice wraps its entries to
 * say so (`slashEntries(event => Message.Chose({ event }))`) — the palette cannot know which
 * of the caller's Messages it is.
 */
import { Option } from 'effect'
import type { Html, KeyboardModifiers } from 'foldkit/html'
import { Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { matchingEntries, type SlashEntry } from './slash.js'

/** The elements the palette publishes: its wrapper, the search field, the list, and its options. */
export const CommandPaletteSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  list: Slot.make({ capability: Capability.Collection }),
  option: Slot.make({ capability: Capability.Interactive }),
})

export interface CommandPaletteInput<Message> {
  /** The element id the list and its options are named from; unique on the page. */
  readonly id: string
  /** `slashEntries(wrap)`, and whatever the application adds. */
  readonly entries: ReadonlyArray<SlashEntry<Message>>
  readonly query: string
  /** What the palette last highlighted among the matches. */
  readonly index: number
  /** What the field sends as the query changes or an arrow moves: the next query and index. */
  readonly changed: (query: string, index: number) => Message
  /** What Escape sends. */
  readonly closed: Message
}

/**
 * The palette as a slot view: a combobox field over a listbox of the matches. ArrowUp and
 * ArrowDown move the highlight, wrapping; Home and End stay the field's. Enter sends the
 * highlighted entry, and does nothing when no entry matches. A stale index — one the matches
 * do not hold — highlights the first match, as the slash menu does, so a query that narrows
 * never leaves Enter choosing nothing.
 */
export const commandPalette = <Message>(): SlotView.SlotView<
  typeof CommandPaletteSlots,
  CommandPaletteInput<Message>,
  Message
> =>
  SlotView.forMessages<Message>().define(CommandPaletteSlots, (input, slots, h): Html => {
    const matches = matchingEntries(input.entries, input.query)
    const current = matches[input.index] === undefined ? 0 : input.index
    const highlighted = matches[current]
    const list = `${input.id}-list`
    const optionId = (entry: SlashEntry<Message>) => `${input.id}-${entry.id}`
    const keyed = (key: string, modifiers: KeyboardModifiers) => {
      if (key === 'Escape') return Option.some(input.closed)
      if (key === 'Enter') return Option.fromUndefinedOr(highlighted?.message)
      if (key !== 'ArrowUp' && key !== 'ArrowDown') return Option.none()
      const next = RovingTabindex.move([...matches.keys()], current, key, modifiers, {
        orientation: 'vertical',
        direction: 'ltr',
        loop: true,
      })
      return next === undefined ? Option.none() : Option.some(input.changed(input.query, next))
    }
    return h.div(slots.root.attrs([h.Role('dialog'), h.AriaLabel('Commands')]), [
      h.input(
        slots.input.attrs([
          h.Type('text'),
          h.Role('combobox'),
          h.AriaLabel('Search commands'),
          h.AriaExpanded(true),
          h.AriaControls(list),
          ...(highlighted === undefined ? [] : [h.AriaActiveDescendant(optionId(highlighted))]),
          h.Value(input.query),
          h.OnInput(query => input.changed(query, 0)),
          h.OnKeyDownPreventDefault(keyed),
        ]),
      ),
      h.ul(
        slots.list.attrs([h.Id(list), h.Role('listbox')]),
        matches.map((entry, index) =>
          h.li(
            slots.option.attrs(
              [
                h.Id(optionId(entry)),
                h.Role('option'),
                h.DataAttribute('entry', entry.id),
                h.AriaSelected(index === current),
                h.OnClick(entry.message),
              ],
              { index, id: entry.id, count: matches.length },
            ),
            [entry.label],
          ),
        ),
      ),
    ])
  })
