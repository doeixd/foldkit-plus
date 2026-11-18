import { Option, Stream } from 'effect'
import {
  Behavior,
  Behaviors,
  Capability,
  SlotView,
  type Diagnostic,
  type NamedStyle,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { KeepInView } from 'foldkit-primitives/dom'
import { keyboardEvents, matchHotkey } from 'foldkit-primitives/events'
import * as Kbd from './kbd.js'
import type { KbdSlots } from './kbd.js'
import { keyShortcuts } from './menu.js'
import type { MixinList } from './resolve.js'

import { CommandSlots } from './command/slots.js'

export { CommandSlots } from './command/slots.js'
export { overlayBars } from './command/overlayBars.js'

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

/** What a key route reads: the field's words, the highlighted row and the rows ↑↓ can reach. */
export interface CommandKeyInput<Value extends string> {
  /** What the field holds now, including a character typed since the last drawing. */
  readonly query: string
  readonly current: Option.Option<Value>
  /** The rows the keys step through, in order: the enabled ones the query leaves. */
  readonly rows: ReadonlyArray<Value>
}

/** A key the menu answers beside its own; see `CommandView.routes`. */
export type CommandRoute<Value extends string, Message> = Behaviors.Keys.Route<
  CommandKeyInput<Value>,
  Message
>

/** How many rows PageUp and PageDown move the highlight. */
const PAGE = 10

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
  /**
   * Keys the application answers in the field, such as Escape clearing the
   * query. They share one keydown owner with the menu's own (↑ ↓ PageUp PageDown
   * Enter and Backspace): a route on the same gesture as
   * another is a diagnostic naming both. Typing and the caret keys stay the
   * field's; Home and End stay the caret's, as in the Combobox; add them here to move the highlight.
   */
  readonly routes?: ReadonlyArray<CommandRoute<Value, NoInfer<Message>>> | undefined
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

/** The menu's own keys, each with the name a clash reports. */
const OWN_KEYS = [
  ['Next', 'ArrowDown'],
  ['Previous', 'ArrowUp'],
  ['PageDown', 'PageDown'],
  ['PageUp', 'PageUp'],
  ['Run', 'Enter'],
  ['Back', 'Backspace'],
] as const satisfies ReadonlyArray<readonly [string, Behaviors.Keys.NamedKey]>

type OwnKey = (typeof OWN_KEYS)[number][0]

const ownRoutes = <Value extends string, Message>(
  answer: (name: OwnKey) => (input: CommandKeyInput<Value>) => Option.Option<Message>,
): ReadonlyArray<CommandRoute<Value, Message>> =>
  OWN_KEYS.map(([name, key]) =>
    Behaviors.Keys.route<CommandKeyInput<Value>, Message>(name, {
      on: [Behaviors.Keys.chord(key)],
      handle: ({ input }) => answer(name)(input),
    }),
  )

/**
 * The `mixins:key-conflict` that drawing the menu with `routes` would throw,
 * or none: the application's routes against the menu's own (the arrows,
 * PageUp, PageDown, Enter and Backspace) and against each other.
 */
export const conflict = <Value extends string, Message>(
  routes: ReadonlyArray<CommandRoute<Value, Message>>,
): Option.Option<Diagnostic> =>
  Behaviors.Keys.conflict(
    [...ownRoutes<Value, Message>(() => () => Option.none()), ...routes],
    Option.some('input'),
  )

export const view = <Value extends string, Message>(
  options: CommandView<Value, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const groups = filtered(options.groups, options.query)
  const enabled = groups.flatMap(group => group.items.filter(item => item.disabled !== true))
  // The highlight stays where it is while its row shows, and goes to the first one otherwise.
  const active = Option.filter(options.active, value => enabled.some(item => item.value === value))
  const current = Option.orElse(active, () => Option.fromNullishOr(enabled[0]?.value))
  const rowId = (value: Value) => `${options.id}-${value}`
  const listId = `${options.id}-list`
  const crumbsId = `${options.id}-page`
  // What the field and the highlight hold since this drawing: a key handler reads the view it
  // was drawn with, so a character typed, or a row moved to, before the next frame would be
  // lost to the next key (Backspace deciding on an empty field, two ArrowDowns moving one row).
  // `onActive` sets a row, so the move cannot be relative; this drawing's handlers keep the
  // record instead, and the next drawing starts from the Model again.
  const reached = { query: options.query, current }
  const keyInput: CommandKeyInput<Value> = {
    get query() {
      return reached.query
    },
    get current() {
      return reached.current
    },
    rows: enabled.map(item => item.value),
  }
  const positionOf = (): number =>
    Option.match(reached.current, {
      onNone: () => -1,
      onSome: value => enabled.findIndex(item => item.value === value),
    })
  const at = (index: number): Option.Option<Value> => Option.fromNullishOr(enabled[index]?.value)
  const step = (by: 1 | -1): Option.Option<Value> => {
    if (enabled.length === 0) return Option.none()
    const from = Option.isNone(reached.current) && by === -1 ? 0 : positionOf()
    return at((from + by + enabled.length) % enabled.length)
  }
  const jump = (by: number): Option.Option<Value> =>
    enabled.length === 0
      ? Option.none()
      : at(Math.min(Math.max(positionOf() + by, 0), enabled.length - 1))
  const moves = (to: () => Option.Option<Value>) => () =>
    Option.map(to(), value => {
      reached.current = Option.some(value)
      return options.onActive(value)
    })
  const answers: Readonly<
    Record<OwnKey, (input: CommandKeyInput<Value>) => Option.Option<Message>>
  > = {
    Next: moves(() => step(1)),
    Previous: moves(() => step(-1)),
    PageDown: moves(() => jump(PAGE)),
    PageUp: moves(() => jump(-PAGE)),
    Run: ({ current }) => Option.map(current, options.onRun),
    Back: ({ query }) =>
      query === ''
        ? Option.map(Option.fromNullishOr(options.page), page => page.onBack)
        : Option.none(),
  }
  const keyboard = Behaviors.Keys.behavior(CommandSlots)<CommandKeyInput<Value>, Message>({
    slot: 'input',
    name: 'CommandKeys',
    routes: [...ownRoutes<Value, Message>(name => answers[name]), ...(options.routes ?? [])],
  })
  const builders = SlotView.buildersFor(
    CommandSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      keyboard.mixin,
      ...(options.mixins ?? []),
    ],
    { input: keyInput, h },
  )
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
          reached.query = query
          return options.onQuery(query)
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

const followsActive = Behavior.slot({
  requires: { capability: Capability.Container },
  mount: () => KeepInView({ selector: '[role="option"][aria-selected="true"]' }),
})

/**
 * Scrolls the highlighted row into view as the keys move it, the least that
 * shows it, in a list taller than its panel. Pass it beside the style. Not a
 * default, for the reason `overlayBars` is not: its Mount sends no Message.
 */
export const keepActiveInView = [
  Behavior.forSlots(CommandSlots)<unknown, never>(
    { list: followsActive },
    { name: 'CommandKeepActiveInView' },
  ).mixin,
] as const
