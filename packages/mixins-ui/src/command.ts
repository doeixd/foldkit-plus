import { Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ScrollBars } from 'foldkit-primitives/dom'
import type { MixinList } from './resolve.js'

/**
 * A command menu, shadcn's Command and Fluid Functionalism's CommandMenu: a
 * search field that keeps focus while the keys move through the rows and
 * points at the highlighted one through `aria-activedescendant`, over a list
 * of grouped rows. (A press on a row runs it; foldkit has no default-preventing
 * mousedown to keep the field focused through the press, so a menu that stays
 * open after a pressed row refocuses its field in the Command `onRun` starts.) ↑ and ↓
 * wrap through the enabled rows, Enter runs the highlighted one, a press
 * runs the one pressed, and the pointer moves the highlight. Rows never
 * re-sort as the query grows, so nothing moves under the pointer; whenever
 * the highlighted row is filtered away, the first enabled row takes it, so
 * Enter always has a target. The query and the highlighted value are the
 * application's; `filtered` is what the view shows for a query.
 */
export const CommandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded],
  }),
  list: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  heading: Slot.make({ capability: Capability.Container }),
  item: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.AriaDisabled],
  }),
  shortcut: Slot.make({ capability: Capability.Container }),
  empty: Slot.make({ capability: Capability.Container }),
  /** With `overlayBars`: the box around the list that holds its `bar`, and the bar's `thumb`. */
  frame: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  thumb: Slot.make({ capability: Capability.Container }),
})

export interface CommandItem<Value extends string> {
  readonly value: Value
  readonly label: string
  /** More words the query matches, beside the label. */
  readonly keywords?: ReadonlyArray<string> | undefined
  /** The keys that run it elsewhere, shown at the row's end. */
  readonly shortcut?: string | undefined
  readonly disabled?: boolean | undefined
}

export interface CommandGroup<Value extends string> {
  readonly heading?: string | undefined
  readonly items: ReadonlyArray<CommandItem<Value>>
}

export interface CommandView<Value extends string, Message> {
  /** Prefixes every id the menu draws, unique on the page. */
  readonly id: string
  /** The field's accessible name. */
  readonly label: string
  readonly placeholder?: string | undefined
  readonly groups: ReadonlyArray<CommandGroup<Value>>
  readonly query: string
  readonly onQuery: (query: string) => NoInfer<Message>
  /** The highlighted row, as the application keeps it. */
  readonly active: Option.Option<Value>
  readonly onActive: (value: Value) => NoInfer<Message>
  /** The Message that runs a row. */
  readonly onRun: (value: Value) => NoInfer<Message>
  /** What the list says when nothing matches. Default "No results." */
  readonly empty?: string | undefined
  /**
   * A thin bar over the list, which fades while it rests (`ScrollBars`), in
   * place of the browser's, on a pointer that can hover. Off by default: its
   * Mount sends no Message, which a Scene test would have to resolve.
   */
  readonly overlayBars?: boolean | undefined
  /** A style of `CommandSlots`, for the menu's look. */
  readonly style?: NamedStyle<typeof CommandSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * The groups as a query leaves them: a row stays when every word of the
 * query is in its label or keywords, in its place; a group left with no rows
 * goes.
 */
export const filtered = <Value extends string>(
  groups: ReadonlyArray<CommandGroup<Value>>,
  query: string,
): ReadonlyArray<CommandGroup<Value>> => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word !== '')
  if (words.length === 0) return groups
  return groups.flatMap(group => {
    const items = group.items.filter(item => {
      const text = [item.label, ...(item.keywords ?? [])].join(' ').toLowerCase()
      return words.every(word => text.includes(word))
    })
    return items.length === 0 ? [] : [{ ...group, items }]
  })
}

export const view = <Value extends string, Message>(
  options: CommandView<Value, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    CommandSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const groups = filtered(options.groups, options.query)
  const enabled = groups.flatMap(group => group.items.filter(item => item.disabled !== true))
  // The highlight stays where it is while its row shows, and goes to the first one otherwise.
  const active = Option.filter(options.active, value => enabled.some(item => item.value === value))
  const current = Option.orElse(active, () => Option.fromNullishOr(enabled[0]?.value))
  const rowId = (value: Value) => `${options.id}-${value}`
  const listId = `${options.id}-list`
  const step = (by: 1 | -1): Option.Option<Value> => {
    if (enabled.length === 0) return Option.none()
    const at = Option.match(current, {
      onNone: () => (by === 1 ? -1 : 0),
      onSome: value => enabled.findIndex(item => item.value === value),
    })
    return Option.fromNullishOr(enabled[(at + by + enabled.length) % enabled.length]?.value)
  }
  const overlay = options.overlayBars === true
  const list = h.div(
    builders.list.attrs([
      h.Id(listId),
      h.Role('listbox'),
      h.AriaLabel(options.label),
      ...(overlay ? [h.OnMount(ScrollBars({}))] : []),
    ]),
    groups.length === 0
      ? [h.div(builders.empty.attrs([h.Role('presentation')]), [options.empty ?? 'No results.'])]
      : groups.map((group, index) =>
          h.keyed('div')(
            group.heading ?? `group-${index}`,
            builders.group.attrs([
              h.Role('group'),
              ...(group.heading === undefined ? [] : [h.AriaLabel(group.heading)]),
            ]),
            [
              ...(group.heading === undefined
                ? []
                : [h.div(builders.heading.attrs([h.AriaHidden(true)]), [group.heading])]),
              ...group.items.map(item => {
                const disabled = item.disabled === true
                const on = Option.isSome(current) && current.value === item.value
                return h.keyed('div')(
                  item.value,
                  builders.item.attrs([
                    h.Id(rowId(item.value)),
                    h.Role('option'),
                    h.AriaSelected(on),
                    ...(on ? [h.DataAttribute('active', '')] : []),
                    ...(disabled
                      ? [h.AriaDisabled(true)]
                      : [
                          h.OnMouseEnter(options.onActive(item.value)),
                          h.OnClick(options.onRun(item.value)),
                        ]),
                  ]),
                  [
                    h.span([], [item.label]),
                    ...(item.shortcut === undefined
                      ? []
                      : [h.span(builders.shortcut.attrs([h.AriaHidden(true)]), [item.shortcut])]),
                  ],
                )
              }),
            ],
          ),
        ),
  )
  // With overlay bars, the list stands in a frame beside its bar, hidden from
  // assistive technology: the list is what a reader scrolls.
  const scrolling = overlay
    ? h.div(builders.frame.attrs(), [
        list,
        h.div(builders.bar.attrs([h.DataAttribute('scroll-bar', 'block'), h.AriaHidden(true)]), [
          h.div(builders.thumb.attrs(), []),
        ]),
      ])
    : list
  return h.div(builders.root.attrs(), [
    h.input(
      builders.input.attrs([
        h.Type('text'),
        h.Role('combobox'),
        h.AriaExpanded(true),
        h.AriaControls(listId),
        h.AriaAutocomplete('list'),
        h.AriaLabel(options.label),
        h.Autocomplete('off'),
        ...(options.placeholder === undefined ? [] : [h.Placeholder(options.placeholder)]),
        ...Option.match(current, {
          onNone: () => [],
          onSome: value => [h.AriaActiveDescendant(rowId(value))],
        }),
        h.Value(options.query),
        h.OnInput(options.onQuery),
        h.OnKeyDownPreventDefault(key => {
          switch (key) {
            case 'ArrowDown':
              return Option.map(step(1), options.onActive)
            case 'ArrowUp':
              return Option.map(step(-1), options.onActive)
            case 'Enter':
              return Option.map(current, options.onRun)
            default:
              return Option.none()
          }
        }),
      ]),
    ),
    scrolling,
  ])
}
