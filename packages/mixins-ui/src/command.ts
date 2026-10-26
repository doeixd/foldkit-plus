import { Option, Stream } from 'effect'
import {
  Attr,
  Behavior,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { ScrollBars } from 'foldkit-primitives/dom'
import { keyboardEvents, matchHotkey } from 'foldkit-primitives/events'
import * as Kbd from './kbd.js'
import type { KbdSlots } from './kbd.js'
import { keyShortcuts } from './menu.js'
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
 * Enter always has a target. The query, the highlighted value and the page
 * are the application's; `filtered` is what the view shows for a query.
 *
 * Nested pages are the application's too: a row that `opensPage` steps in
 * when run (the application pushes the page and clears the query), and
 * Backspace in an empty field sends `page.onBack`. In a dialog, `hotkey`
 * opens it on ⌘K or Ctrl+K, and the Dialog component draws it: the field,
 * the first thing in the panel that takes focus, has it when it opens.
 */
export const CommandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The row of the field, after the page's crumbs. */
  search: Slot.make({ capability: Capability.Container }),
  /** The trail of pages stepped into, before the field, and each page's name. */
  crumbs: Slot.make({ capability: Capability.Container }),
  crumb: Slot.make({ capability: Capability.Container }),
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
  /** A row's picture, before its words, hidden from assistive technology. */
  icon: Slot.make({ capability: Capability.Container }),
  /** A row's words: its `label` and, below it, its `description`. */
  text: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /** The keys that run a row elsewhere, at its end, drawn as `Kbd.combo`. */
  shortcut: Slot.make({ capability: Capability.Container }),
  /** The mark that a row opens a page. */
  chevron: Slot.make({ capability: Capability.Container }),
  /** What the list says while it is loading or when nothing matches: a polite live region. */
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  empty: Slot.make({ capability: Capability.Container }),
  loading: Slot.make({ capability: Capability.Container }),
  /** The box around the list that holds its overlay `bar`, which `overlayBars` drives, and the bar's `thumb`. */
  frame: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  thumb: Slot.make({ capability: Capability.Container }),
  /** The strip under the list naming the keys, and each `hint` in it. */
  footer: Slot.make({ capability: Capability.Container }),
  hint: Slot.make({ capability: Capability.Container }),
})

/** Keys pressed together, as drawn: `['⌘', 'N']`. */
export type Keys = readonly [string, ...ReadonlyArray<string>]

export interface CommandItem<Value extends string> {
  readonly value: Value
  readonly label: string
  /** A line under the label, which the query matches too. */
  readonly description?: string | undefined
  /** More words the query matches, beside the label. */
  readonly keywords?: ReadonlyArray<string> | undefined
  /** The keys that run it elsewhere: drawn at the row's end and named in `aria-keyshortcuts`. */
  readonly shortcut?: Keys | undefined
  /** A picture before the words, such as an `Icon.view`. */
  readonly icon?: Html | undefined
  /** It steps into a page: drawn with a chevron at its end. */
  readonly opensPage?: boolean | undefined
  readonly disabled?: boolean | undefined
}

export interface CommandGroup<Value extends string> {
  readonly heading?: string | undefined
  readonly items: ReadonlyArray<CommandItem<Value>>
}

/** A key named in the footer: what pressing it does. */
export interface CommandHint {
  readonly keys: Keys
  readonly label: string
}

export interface CommandPage<Message> {
  /** The pages stepped into, outermost first, drawn as crumbs before the field. */
  readonly trail: ReadonlyArray<string>
  /** Backspace in an empty field: the application leaves the innermost page. */
  readonly onBack: NoInfer<Message>
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
   * Given, the list is loading what the query asks for: it says this, and is
   * `aria-busy`. The rows it holds still show, as cmdk's do.
   */
  readonly loading?: string | undefined
  /** The page the menu is on, when the application has stepped into one. */
  readonly page?: CommandPage<Message> | undefined
  /** The keys named in a footer under the list, such as ↑↓ to move and ↵ to run. */
  readonly hints?: ReadonlyArray<CommandHint> | undefined
  /** A style of `CommandSlots`, for the menu's look. */
  readonly style?: NamedStyle<typeof CommandSlots> | undefined
  /** A style of `KbdSlots` for shortcuts and hints (`Recipes.Kbd`); without one they are the keys' words. */
  readonly kbd?: NamedStyle<typeof KbdSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * The groups as a query leaves them: a row stays when every word of the
 * query is in its label, description or keywords, whatever their case, in
 * its place; a group left with no rows goes.
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
      const text = [item.label, item.description ?? '', ...(item.keywords ?? [])]
        .join(' ')
        .toLowerCase()
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
  const crumbsId = `${options.id}-page`
  const step = (by: 1 | -1): Option.Option<Value> => {
    if (enabled.length === 0) return Option.none()
    const at = Option.match(current, {
      onNone: () => (by === 1 ? -1 : 0),
      onSome: value => enabled.findIndex(item => item.value === value),
    })
    return Option.fromNullishOr(enabled[(at + by + enabled.length) % enabled.length]?.value)
  }
  const keys = (pressed: Keys) => Kbd.combo({ keys: pressed, style: options.kbd }, h)
  const row = (item: CommandItem<Value>) => {
    const disabled = item.disabled === true
    const on = Option.isSome(current) && current.value === item.value
    return h.keyed('div')(
      item.value,
      builders.item.attrs([
        h.Id(rowId(item.value)),
        h.Role('option'),
        h.AriaSelected(on),
        ...(on ? [h.DataAttribute('active', '')] : []),
        ...(item.shortcut === undefined ? [] : [h.AriaKeyshortcuts(keyShortcuts(item.shortcut))]),
        ...(disabled
          ? [h.AriaDisabled(true)]
          : [h.OnMouseEnter(options.onActive(item.value)), h.OnClick(options.onRun(item.value))]),
      ]),
      [
        ...(item.icon === undefined
          ? []
          : [h.span(builders.icon.attrs([h.AriaHidden(true)]), [item.icon])]),
        h.span(builders.text.attrs(), [
          h.span(builders.label.attrs(), [item.label]),
          ...(item.description === undefined
            ? []
            : [h.span(builders.description.attrs(), [item.description])]),
        ]),
        ...(item.shortcut === undefined
          ? []
          : [h.span(builders.shortcut.attrs([h.AriaHidden(true)]), [keys(item.shortcut)])]),
        ...(item.opensPage === true
          ? [h.span(builders.chevron.attrs([h.AriaHidden(true)]), [])]
          : []),
      ],
    )
  }
  const list = h.div(
    builders.list.attrs([
      h.Id(listId),
      h.Role('listbox'),
      h.AriaLabel(options.label),
      ...(options.loading === undefined ? [] : [h.AriaBusy(true)]),
    ]),
    groups.map((group, index) =>
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
          ...group.items.map(row),
        ],
      ),
    ),
  )
  // Outside the listbox, whose children are its options, and always drawn,
  // so a region already in the page announces what is put in it.
  const status = h.div(builders.status.attrs([h.Role('status')]), [
    ...(options.loading === undefined ? [] : [h.div(builders.loading.attrs(), [options.loading])]),
    ...(groups.length === 0 && options.loading === undefined
      ? [h.div(builders.empty.attrs(), [options.empty ?? 'No results.'])]
      : []),
  ])
  // The list stands in a frame beside its bar, whether or not `overlayBars`
  // runs: a bar no Mount marks scrollable is not drawn by the style. Hidden
  // from assistive technology: the list is what a reader scrolls.
  const scrolling = h.div(builders.frame.attrs(), [
    list,
    h.div(builders.bar.attrs([h.DataAttribute('scroll-bar', 'block'), h.AriaHidden(true)]), [
      h.div(builders.thumb.attrs(), []),
    ]),
  ])
  const trail = options.page?.trail ?? []
  // What the field holds since this drawing: a key handler reads the query it was drawn with,
  // so a character typed before the next frame would leave Backspace deciding on an empty field.
  // This drawing's own input handler keeps it, and the next drawing starts from the query again.
  const typed = { query: options.query }
  const search = h.div(builders.search.attrs(), [
    ...(trail.length === 0
      ? []
      : [
          h.span(
            builders.crumbs.attrs([h.Id(crumbsId)]),
            trail.map(name => h.span(builders.crumb.attrs(), [name])),
          ),
        ]),
    h.input(
      builders.input.attrs([
        h.Type('text'),
        h.Role('combobox'),
        h.AriaExpanded(true),
        h.AriaControls(listId),
        h.AriaAutocomplete('list'),
        h.AriaLabel(options.label),
        ...(trail.length === 0 ? [] : [h.AriaDescribedBy(crumbsId)]),
        h.Autocomplete('off'),
        // What is typed filters: a phone's keyboard capitalizing and correcting it filters
        // on a word nobody typed, and its Enter key says it searches.
        h.Attribute('autocapitalize', 'none'),
        h.Attribute('autocorrect', 'off'),
        h.Attribute('spellcheck', 'false'),
        h.Attribute('enterkeyhint', 'search'),
        ...(options.placeholder === undefined ? [] : [h.Placeholder(options.placeholder)]),
        ...Option.match(current, {
          onNone: () => [],
          onSome: value => [h.AriaActiveDescendant(rowId(value))],
        }),
        h.Value(options.query),
        h.OnInput(query => {
          typed.query = query
          return options.onQuery(query)
        }),
        h.OnKeyDownPreventDefault(key => {
          switch (key) {
            case 'ArrowDown':
              return Option.map(step(1), options.onActive)
            case 'ArrowUp':
              return Option.map(step(-1), options.onActive)
            case 'Enter':
              return Option.map(current, options.onRun)
            case 'Backspace':
              return typed.query === ''
                ? Option.map(Option.fromNullishOr(options.page), page => page.onBack)
                : Option.none()
            default:
              return Option.none()
          }
        }),
      ]),
    ),
  ])
  const hints = options.hints ?? []
  return h.div(builders.root.attrs(), [
    search,
    status,
    scrolling,
    ...(hints.length === 0
      ? []
      : [
          h.div(
            builders.footer.attrs([h.AriaHidden(true)]),
            hints.map(hint => h.span(builders.hint.attrs(), [keys(hint.keys), hint.label])),
          ),
        ]),
  ])
}

/**
 * The keys that open a command menu in a dialog, ⌘K or Ctrl+K, anywhere on
 * the page, as `message`: the browser's own use of them is kept from it.
 * Lift it with `Subscription.persistentEntry`; the application opens its
 * Dialog on the Message.
 */
export const hotkey = <Message>(message: Message): Stream.Stream<Message> => {
  const opens = (press: Parameters<typeof matchHotkey>[1]) =>
    matchHotkey('meta+k', press) || matchHotkey('ctrl+k', press)
  return keyboardEvents({ preventDefault: opens }).pipe(
    Stream.filter(event => event._tag === 'Pressed' && opens(event)),
    Stream.map(() => message),
  )
}

/**
 * What draws the bar over the `list` (`ScrollBars`), in place of the
 * browser's, on a pointer that can hover; pass it beside the style. Not a
 * default: its Mount sends no Message, yet a Scene test of every page that
 * drew one would have to resolve it.
 */
export const overlayBars = [
  Behavior.forSlots(CommandSlots)<unknown, never>(
    {
      list: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'CommandScrollBars' },
  ).mixin,
] as const
