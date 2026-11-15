/**
 * The formatting toolbar: undo and redo, the text style menu, marks, link, list and quote wraps
 * and an insert menu in one `role="toolbar"` with one tab stop, drawn through slots like the rest
 * of the chrome.
 *
 * It holds no editing state. What is pressed or unavailable is a read of the document and
 * selection, and every control sends an editor Message wrapped for the caller. Two things are the
 * caller's: which menu is open (`menu`, `toggled`), because a menu's popup, like the link editor,
 * is placed by whoever knows where the caret is; and where the tab stop is (`roving`, `onFocus`),
 * the slice `foldkit-mixins-ui`'s Toolbar asks for too, so that Tab returns to the control last
 * used. An unavailable control is `aria-disabled` and stays focusable, so the arrows still reach
 * it and a screen reader can say why nothing happened; its press sends nothing.
 */
import { Data, Equal, Option } from 'effect'
import type { Html } from 'foldkit/html'
import { Behaviors, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import { ariaKeyshortcuts, formatHotkey } from 'foldkit-primitives/events'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import * as RichText from 'foldkit-richtext'
import {
  Message as EditorMessage,
  slashEntries as editorEntries,
  type EditorEvent,
  type SlashEntry,
} from 'foldkit-richtext-dom/editor'
import { CONTROLS_ATTRIBUTE, markActive } from 'foldkit-richtext-dom/toolbar'
import { isRichTextIcon, richTextIcon, type RichTextIconName } from './icons.js'
import { styles } from './style.js'

/** The elements the toolbar publishes. `anchor` holds a menu's trigger and its panel. */
export const FormattingToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  button: Slot.make({ capability: Capability.Interactive }),
  separator: Slot.make({ capability: Capability.Container }),
  anchor: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  menu: Slot.make({ capability: Capability.Collection }),
  item: Slot.make({ capability: Capability.Interactive }),
  itemLabel: Slot.make({ capability: Capability.Container }),
  itemDescription: Slot.make({ capability: Capability.Container }),
})

/** The popups a control opens; the caller keeps which one is open, and draws `link`'s own editor. */
export type FormattingMenu = 'style' | 'insert' | 'link'

/**
 * A control of the application's own in the bar: it joins the same tab stop and the same arrow
 * keys, in the place `items` gives it. `message` is what a press sends. A press of a `disabled`
 * control sends nothing (the control is `aria-disabled` and stays focusable), and the
 * application's `update` must refuse the Message in that state too, since a Message can arrive
 * from elsewhere.
 */
export interface ApplicationControl<Message> {
  /** Unique among the application's controls; the element's id and `data-item` are `app-<id>`. */
  readonly id: string
  /** The control's accessible name, and its visible text where it has no `icon`. */
  readonly label: string
  readonly icon?: RichTextIconName | undefined
  /** A `foldkit-primitives` pattern (`'mod+k'`), shown in the title and as `aria-keyshortcuts`. */
  readonly shortcut?: string | undefined
  /** `aria-pressed`, for a control that is on; absent for one that is not a toggle. */
  readonly pressed?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly message: Message
  /**
   * A control that opens something the application draws, as `link` opens the link editor:
   * `aria-haspopup` says which kind and, for a `menu`, `aria-expanded` says whether it is `open`.
   * `message` then toggles it. ArrowDown on a closed menu's trigger and Escape on an open popup's
   * trigger send `message`, as for the built-in menus.
   */
  readonly popup?: { readonly kind: 'menu' | 'dialog'; readonly open: boolean } | undefined
}

type PlacedItem<Message> =
  | 'undo'
  | 'redo'
  | 'style'
  | 'link'
  | 'bulleted-list'
  | 'numbered-list'
  | 'checklist'
  | 'quote'
  | 'insert'
  | 'separator'
  | { readonly mark: string }
  | { readonly control: ApplicationControl<Message> }

/**
 * One control, in the order drawn. A `mark` is a mark of the document's vocabulary, by name: the
 * toolbar cannot know which marks an application declared, so it lists none by itself beyond
 * `standardFormattingItems`'. A `control` is the application's own. `{ low: item }` is a control
 * that gives way when the bar is `compact`: it is not drawn then, so it is neither a tab stop nor
 * an arrow-key target.
 */
export type FormattingItem<Message = never> =
  | PlacedItem<Message>
  | { readonly low: Exclude<PlacedItem<Message>, 'separator'> }

type InsertEntryUnion<Message> = Data.TaggedEnum<{
  /** An entry of the slash menu's catalogue: its Message is the editor's, sent through `wrap`. */
  Editor: { readonly entry: SlashEntry<EditorEvent> }
  /** An entry of the application's own, such as a file dialog: its Message is the application's. */
  App: {
    readonly id: string
    readonly label: string
    readonly description?: string | undefined
    readonly icon?: string | undefined
    readonly message: Message
  }
}>

interface InsertEntries extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: InsertEntryUnion<this['A']>
}

/** One entry of the insert menu. A caller lists editor and application entries in one order. */
export type InsertEntry<Message> = Data.TaggedEnum.Kind<InsertEntries, Message>

/** Builds an insert entry: `InsertEntry.Editor({ entry })` or `InsertEntry.App({ id, label, message })`. */
export const InsertEntry = Data.taggedEnum<InsertEntries>()

/** What a plain bar offers: the marks `foldkit-richtext` ships, the lists and the quote. */
export const standardFormattingItems: ReadonlyArray<FormattingItem> = [
  'undo',
  'redo',
  'separator',
  'style',
  'separator',
  ...RichText.shippedMarks.map((definition): FormattingItem => ({ mark: definition.name })),
  'link',
  'separator',
  'bulleted-list',
  'numbered-list',
  'quote',
  'separator',
  'insert',
]

/** The words the toolbar draws and names its controls by; a caller overrides any of them. */
export interface FormattingWords {
  readonly toolbar: string
  readonly undo: string
  readonly redo: string
  readonly textStyle: string
  readonly link: string
  readonly bulletedList: string
  readonly numberedList: string
  readonly checklist: string
  readonly quote: string
  readonly insert: string
}

const defaultWords: FormattingWords = {
  toolbar: 'Formatting',
  undo: 'Undo',
  redo: 'Redo',
  textStyle: 'Text style',
  link: 'Link',
  bulletedList: 'Bulleted list',
  numberedList: 'Numbered list',
  checklist: 'Checklist',
  quote: 'Quote',
  insert: 'Insert',
}

/**
 * The shortcuts the editor itself binds, as `foldkit-primitives` patterns, by control id (a mark's
 * is `mark-<Name>`). A caller's own keymap entries are given beside them through `shortcuts`.
 */
const builtInShortcuts: Readonly<Record<string, string>> = {
  undo: 'mod+z',
  redo: 'mod+shift+z',
  'mark-Bold': 'mod+b',
  'mark-Italic': 'mod+i',
  'mark-Code': 'mod+e',
  'mark-Strikethrough': 'mod+shift+s',
}

export interface FormattingToolbarInput<Message> {
  /** Prefixes the ids the controls draw, which the arrows move focus by; unique on the page. */
  readonly id: string
  readonly document: RichText.Document
  readonly selection: RichText.Selection | null
  /** The caret's pending format, which wins over the run under it (`ToolbarState`). */
  readonly storedMarks?: ReadonlyArray<string> | null | undefined
  /** An editor Message as this caller's, usually its `edited(...)` wrapper. */
  readonly wrap: (message: EditorEvent) => Message
  /** The controls and their order; default `standardFormattingItems`. Leave a control out to hide it. */
  readonly items?: ReadonlyArray<FormattingItem<NoInfer<Message>>> | undefined
  /**
   * Draw only the controls not marked `{ low }`: the application's answer to a narrow screen, from
   * the width signal it keeps in its Model (a media-query Subscription). Default `false`.
   */
  readonly compact?: boolean | undefined
  /**
   * Whether undo and redo apply. The editor cannot know what the application undoes (a page may
   * undo only this tab's own steps), so the caller says. Default: both available.
   */
  readonly history?: { readonly undo: boolean; readonly redo: boolean } | undefined
  /** The menu that is open, if any. */
  readonly menu?: FormattingMenu | undefined
  /** What a menu's trigger sends: open (`true`) or close (`false`) that menu. Also what Escape sends. */
  readonly toggled: (menu: FormattingMenu, open: boolean) => NoInfer<Message>
  /**
   * What the insert menu lists, in order: the slash menu's own entries (`InsertEntry.Editor`, sent
   * through `wrap`, so the two never disagree) and the application's (`InsertEntry.App`, sent as
   * they are). Default: the editor's own blocks (`group: 'Blocks'`).
   */
  readonly inserts?: ReadonlyArray<InsertEntry<NoInfer<Message>>> | undefined
  /**
   * What Escape sends from a control when it closes no popup: usually a Message whose `update` runs
   * the editor's `focus` Command, so Escape returns to the text, as in a conventional toolbar. Without
   * it Escape does nothing there.
   */
  readonly returned?: NoInfer<Message> | undefined
  /** Where the one tab stop is: the caller's `RovingTabindex.Model`, as for `foldkit-mixins-ui`'s Toolbar. */
  readonly roving: RovingTabindex.Model
  /** Sent with a control's id when it takes focus, by a key or a press; answer it by storing the id as `roving.current`. */
  readonly onFocus: (id: string) => NoInfer<Message>
  /** Pattern (`mod+u`) by control id (`mark-Underline`, `link`) for chords the application's keymap binds. */
  readonly shortcuts?: Readonly<Record<string, string>> | undefined
  readonly words?: Partial<FormattingWords> | undefined
  /** Default `ltr`; `rtl` swaps ArrowLeft and ArrowRight. */
  readonly direction?: 'ltr' | 'rtl' | undefined
}

const checklist = EditorMessage.WrappedBlock({
  containers: [{ kind: 'List' }, { kind: 'TaskItem', props: { checked: false } }],
})

const entry = (id: string): EditorEvent => {
  const found = editorEntries.find(each => each.id === id)
  if (found === undefined) throw new Error(`the editor offers no slash entry "${id}"`)
  return found.message
}

const wraps: Readonly<
  Record<
    'bulleted-list' | 'numbered-list' | 'checklist' | 'quote',
    {
      readonly icon: RichTextIconName
      readonly word: keyof FormattingWords
      readonly message: EditorEvent
    }
  >
> = {
  'bulleted-list': { icon: 'bulleted-list', word: 'bulletedList', message: entry('bulleted-list') },
  'numbered-list': { icon: 'numbered-list', word: 'numberedList', message: entry('numbered-list') },
  checklist: { icon: 'checklist', word: 'checklist', message: checklist },
  quote: { icon: 'quote', word: 'quote', message: entry('quote') },
}

const defaultInserts: ReadonlyArray<InsertEntry<never>> = editorEntries
  .filter(each => each.group === 'Blocks')
  .map(each => InsertEntry.Editor({ entry: each }))

/** A control, resolved: what the arrows move between and what `Keys` finds focus on. */
interface Control<Message> {
  readonly id: string
  readonly item: Exclude<PlacedItem<Message>, 'separator'>
}

const controlId = <Message>(item: Exclude<PlacedItem<Message>, 'separator'>): string =>
  typeof item === 'string' ? item : 'mark' in item ? `mark-${item.mark}` : `app-${item.control.id}`

const controlsOf = <Message>(
  items: ReadonlyArray<PlacedItem<Message>>,
): ReadonlyArray<Control<Message>> =>
  items.flatMap(item => (item === 'separator' ? [] : [{ id: controlId(item), item }]))

/** Every item with its `{ low }` wrapper off, in order. */
const unwrapped = <Message>(
  items: ReadonlyArray<FormattingItem<Message>>,
): ReadonlyArray<PlacedItem<Message>> =>
  items.map(item => (typeof item === 'object' && 'low' in item ? item.low : item))

/**
 * What is drawn: every item, or without the `{ low }` ones when `compact`, and with no separator
 * left at an end or beside another, which a hidden group would otherwise leave behind.
 */
const visibleItems = <Message>(
  input: FormattingToolbarInput<Message>,
): ReadonlyArray<PlacedItem<Message>> => {
  const given = input.items ?? standardFormattingItems
  const kept = given.flatMap(item =>
    typeof item === 'object' && 'low' in item ? (input.compact === true ? [] : [item.low]) : [item],
  )
  const tidy = kept.reduce<Array<PlacedItem<Message>>>((drawn, item) => {
    if (item !== 'separator' || (drawn.length > 0 && drawn[drawn.length - 1] !== 'separator')) {
      drawn.push(item)
    }
    return drawn
  }, [])
  return tidy[tidy.length - 1] === 'separator' ? tidy.slice(0, -1) : tidy
}

/**
 * Where the tab stop is among the controls drawn: the control `roving` names, else the one nearest
 * to it in the full list (after it, then before it) when it is not drawn, else the first.
 */
const stopOf = <Message>(
  input: FormattingToolbarInput<Message>,
  shown: ReadonlyArray<Control<Message>>,
): number => {
  const named = shown.findIndex(control => control.id === input.roving.current)
  if (named !== -1) return named
  const all = controlsOf(unwrapped(input.items ?? standardFormattingItems))
  const from = all.findIndex(control => control.id === input.roving.current)
  if (from === -1) return 0
  const neighbours = [...all.slice(from + 1), ...all.slice(0, from).reverse()]
  const near = neighbours.find(control => shown.some(each => each.id === control.id))
  const at = shown.findIndex(control => control.id === near?.id)
  return at === -1 ? 0 : at
}

const MENU_OF: Readonly<Record<string, FormattingMenu>> = {
  style: 'style',
  insert: 'insert',
  link: 'link',
}
const menuOf = (id: string): FormattingMenu | undefined =>
  Object.hasOwn(MENU_OF, id) ? MENU_OF[id] : undefined

/** One row of a popup the toolbar draws, whichever list it came from. */
interface MenuEntry<Message> {
  readonly id: string
  readonly label: string
  readonly description?: string | undefined
  readonly icon?: string | undefined
  readonly message: Message
  readonly style?: SlashEntry<EditorEvent> | undefined
}

/** The rows of the popup `menu`: the text styles, or the insert list with each entry resolved. */
const menuEntries = <Message>(
  input: FormattingToolbarInput<Message>,
  menu: FormattingMenu,
): ReadonlyArray<MenuEntry<Message>> => {
  if (menu === 'style') {
    return styles.map(each => ({ ...each, message: input.wrap(each.message), style: each }))
  }
  if (menu === 'insert') {
    return (input.inserts ?? defaultInserts).map(each =>
      InsertEntry.$match(each, {
        Editor: ({ entry }) => ({ ...entry, message: input.wrap(entry.message) }),
        App: ({ id, label, description, icon, message }) => ({
          id,
          label,
          description,
          icon,
          message,
        }),
      }),
    )
  }
  return []
}

/** The ids a popup's rows draw, in order. */
const menuItemIds = <Message>(
  input: FormattingToolbarInput<Message>,
  menu: FormattingMenu,
): ReadonlyArray<string> => menuEntries(input, menu).map(each => `${input.id}-${menu}-${each.id}`)

/**
 * The toolbar as a slot view, with the APG toolbar's keys: one tab stop (the control `roving`
 * names, else the first), ArrowLeft and ArrowRight (mirrored under `rtl`), Home and End moving
 * focus between controls, wrapping. Controls are never skipped, since an unavailable one stays
 * focusable. ArrowDown on a closed menu's trigger opens it; on an open one it moves into the menu,
 * whose items the arrows, Home and End then walk and whose Escape closes it and returns to the
 * trigger. Escape on a trigger closes its open menu. Opening by Down does not enter the menu, since
 * its items are not drawn yet: a second Down does.
 *
 * A control that is on is `aria-pressed` (a mark the selection carries, a link, an open menu is
 * `aria-expanded`); the text style trigger names the current style. Marks and wraps need a
 * selection, the text style menu a text selection, and link a selection that covers text. Lists
 * and quote are not toggles here: wrapping again wraps deeper, as in the slash menu.
 *
 * The root is marked as the editor's controls (`CONTROLS_ATTRIBUTE`), so a pointer press on a
 * control or a menu entry leaves the focus, and the browser's selection, in the text. A control
 * reached by key does hold the focus: every command then reads the selection the editor keeps in
 * the Model, and the editor draws that selection as a decoration until the focus returns.
 */
export const formattingToolbar = <Message>(): SlotView.SlotView<
  typeof FormattingToolbarSlots,
  FormattingToolbarInput<Message>,
  Message
> => {
  const keys = Behaviors.Keys.behavior(FormattingToolbarSlots)<
    FormattingToolbarInput<Message>,
    Message
  >({
    slot: 'root',
    name: 'FormattingToolbarKeys',
    routes: [
      Behaviors.Keys.route<FormattingToolbarInput<Message>, Message>('Move', {
        on: [
          ...Behaviors.Keys.withShift('Home'),
          ...Behaviors.Keys.withShift('End'),
          ...RovingTabindex.arrowChords('both'),
          Behaviors.Keys.chord('Escape'),
        ],
        handle: ({ key, modifiers, input }) => {
          const controls = controlsOf(visibleItems(input))
          const at = (control: string) => `${input.id}-${control}`
          // Read at the press: a render may lag a held key, and only the DOM knows where focus is.
          const active = document.activeElement?.id
          const inMenu = (['style', 'insert'] as const).find(
            menu =>
              input.menu === menu &&
              active !== undefined &&
              menuItemIds(input, menu).includes(active),
          )
          if (inMenu !== undefined) {
            const ids = menuItemIds(input, inMenu)
            if (key === 'Escape') {
              return Option.some(Behaviors.Keys.focus(at(inMenu), input.toggled(inMenu, false)))
            }
            const next = RovingTabindex.move(
              ids.map((_, position) => position),
              ids.indexOf(active ?? ''),
              key,
              modifiers,
              { orientation: 'vertical', loop: true, direction: 'ltr' },
            )
            const id = next === undefined ? undefined : ids[next]
            return id === undefined
              ? Option.none()
              : Option.some(Behaviors.Keys.focus(id, input.onFocus(inMenu)))
          }
          const focused = controls.findIndex(control => at(control.id) === active)
          // A press that did not start on one of this toolbar's controls is not the toolbar's.
          if (focused === -1) return Option.none()
          const control = controls[focused]
          const menu = control === undefined ? undefined : menuOf(control.id)
          const own =
            control === undefined || typeof control.item !== 'object' || 'mark' in control.item
              ? undefined
              : control.item.control
          if (key === 'Escape') {
            if (menu !== undefined && input.menu === menu) {
              return Option.some(input.toggled(menu, false))
            }
            if (own?.popup?.open === true) return Option.some(own.message)
            return input.returned === undefined ? Option.none() : Option.some(input.returned)
          }
          if (key === 'ArrowDown') {
            if (own?.popup?.kind === 'menu' && !own.popup.open && own.disabled !== true) {
              return Option.some(own.message)
            }
            if (menu === undefined || modifiers.shiftKey) return Option.none()
            const first = menuItemIds(input, menu)[0]
            if (input.menu !== menu) return Option.some(input.toggled(menu, true))
            return first === undefined
              ? Option.none()
              : Option.some(Behaviors.Keys.focus(first, input.onFocus(menu)))
          }
          if (key === 'ArrowUp') return Option.none()
          const next = RovingTabindex.move(
            controls.map((_, position) => position),
            focused,
            key,
            modifiers,
            { orientation: 'horizontal', loop: true, direction: input.direction ?? 'ltr' },
          )
          const target = next === undefined ? undefined : controls[next]
          return target === undefined
            ? Option.none()
            : Option.some(Behaviors.Keys.focus(at(target.id), input.onFocus(target.id)))
        },
      }),
    ],
  })
  return SlotView.forMessages<Message>()
    .define(FormattingToolbarSlots, (input: FormattingToolbarInput<Message>, slots, h): Html => {
      const words = { ...defaultWords, ...input.words }
      const items = visibleItems(input)
      const controls = controlsOf(items)
      const stop = stopOf(input, controls)
      const state = {
        document: input.document,
        selection: input.selection,
        storedMarks: input.storedMarks ?? null,
      }
      const hasSelection = input.selection !== null
      const range = input.selection?.type === 'Range'
      const current = RichText.textBlockAt(input.document, input.selection)
      const chosen = styles.find(
        style => current !== undefined && Equal.equals(style.message.block, current),
      )
      const history = input.history ?? { undo: true, redo: true }
      const open = (menu: FormattingMenu) => input.menu === menu
      const shortcuts = { ...builtInShortcuts, ...input.shortcuts }
      const at = (control: string) => `${input.id}-${control}`
      const icon = (name: string | undefined) =>
        name !== undefined && isRichTextIcon(name) ? [richTextIcon(h, name)] : []

      /** What a control draws and means, before it becomes a button. */
      const describe = (
        control: Control<Message>,
      ): {
        readonly name: string
        readonly icon: ReadonlyArray<Html>
        readonly label?: string
        readonly available: boolean
        readonly pressed?: boolean
        readonly expanded?: boolean
        readonly popup?: 'menu' | 'dialog'
        readonly shortcut?: string
        readonly press: Message
      } => {
        const { item } = control
        if (typeof item === 'object' && 'control' in item) {
          const own = item.control
          return {
            name: own.label,
            icon: own.icon === undefined ? [] : icon(own.icon),
            ...(own.icon === undefined ? { label: own.label } : {}),
            available: own.disabled !== true,
            ...(own.pressed === undefined ? {} : { pressed: own.pressed }),
            ...(own.popup === undefined ? {} : { popup: own.popup.kind, expanded: own.popup.open }),
            ...(own.shortcut === undefined ? {} : { shortcut: own.shortcut }),
            press: own.message,
          }
        }
        if (typeof item === 'object') {
          return {
            name: item.mark,
            icon: isRichTextIcon(item.mark.toLowerCase()) ? icon(item.mark.toLowerCase()) : [],
            ...(isRichTextIcon(item.mark.toLowerCase()) ? {} : { label: item.mark }),
            available: hasSelection,
            pressed: markActive(state, item.mark),
            press: input.wrap(EditorMessage.ToggledMark({ mark: item.mark })),
          }
        }
        switch (item) {
          case 'undo':
            return {
              name: words.undo,
              icon: icon('undo'),
              available: history.undo,
              press: input.wrap(EditorMessage.Undone()),
            }
          case 'redo':
            return {
              name: words.redo,
              icon: icon('redo'),
              available: history.redo,
              press: input.wrap(EditorMessage.Redone()),
            }
          case 'style':
            return {
              name: `${words.textStyle}: ${chosen?.label ?? 'none'}`,
              icon: [],
              label: chosen?.label ?? words.textStyle,
              available: range,
              expanded: open('style') && range,
              popup: 'menu',
              press: input.toggled('style', !open('style')),
            }
          case 'insert':
            return {
              name: words.insert,
              icon: icon('plus'),
              label: words.insert,
              available: hasSelection,
              expanded: open('insert') && hasSelection,
              popup: 'menu',
              press: input.toggled('insert', !open('insert')),
            }
          case 'link':
            return {
              name: words.link,
              icon: icon('link'),
              available: RichText.coversText(input.selection),
              pressed:
                open('link') || RichText.linkAt(input.document, input.selection) !== undefined,
              popup: 'dialog',
              press: input.toggled('link', !open('link')),
            }
          default: {
            const wrap = wraps[item]
            return {
              name: words[wrap.word],
              icon: icon(wrap.icon),
              available: hasSelection,
              press: input.wrap(wrap.message),
            }
          }
        }
      }

      const button = (control: Control<Message>, index: number): Html => {
        const made = describe(control)
        const pattern = made.shortcut ?? shortcuts[control.id]
        const keyshortcuts = pattern === undefined ? Option.none() : ariaKeyshortcuts(pattern)
        const shown = pattern === undefined ? Option.none() : formatHotkey(pattern)
        return h.button(
          slots.button.attrs(
            [
              h.Type('button'),
              h.Id(at(control.id)),
              h.Tabindex(index === stop ? 0 : -1),
              h.OnFocus(input.onFocus(control.id)),
              h.DataAttribute('item', control.id),
              h.AriaLabel(made.name),
              h.Title(
                Option.match(shown, {
                  onNone: () => made.name,
                  onSome: text => `${made.name} (${text})`,
                }),
              ),
              ...Option.match(keyshortcuts, {
                onNone: () => [],
                onSome: value => [h.Attribute('aria-keyshortcuts', value)],
              }),
              ...(made.pressed === undefined
                ? []
                : [h.AriaPressed(made.pressed ? 'true' : 'false')]),
              ...(made.popup === undefined ? [] : [h.AriaHasPopup(made.popup)]),
              ...(made.popup === 'menu' ? [h.AriaExpanded(made.expanded === true)] : []),
              h.AriaDisabled(!made.available),
              ...(made.available ? [h.OnClick(made.press)] : []),
            ],
            { index, id: control.id, count: controls.length },
          ),
          [
            ...made.icon,
            ...(made.label === undefined ? [] : [h.span(slots.label.attrs(), [made.label])]),
            ...(made.popup === 'menu' ? [richTextIcon(h, 'chevron-down', { size: 14 })] : []),
          ],
        )
      }

      const popup = (menu: 'style' | 'insert'): Html => {
        const entries = menuEntries(input, menu)
        return h.div(
          slots.menu.attrs([
            h.Role('menu'),
            h.AriaLabel(menu === 'style' ? words.textStyle : words.insert),
          ]),
          entries.map((each, index) =>
            h.button(
              slots.item.attrs(
                [
                  h.Type('button'),
                  h.Id(`${input.id}-${menu}-${each.id}`),
                  h.Tabindex(-1),
                  h.Role(menu === 'style' ? 'menuitemradio' : 'menuitem'),
                  ...(menu === 'style' ? [h.AriaChecked(each.style === chosen)] : []),
                  h.DataAttribute(menu, each.id),
                  h.OnClick(each.message),
                ],
                { index, id: each.id, count: entries.length },
              ),
              [
                ...icon(each.icon),
                h.span(slots.itemLabel.attrs(), [each.label]),
                ...(each.description === undefined || menu === 'style'
                  ? []
                  : [h.span(slots.itemDescription.attrs(), [each.description])]),
              ],
            ),
          ),
        )
      }

      let controlIndex = -1
      return h.div(
        slots.root.attrs([
          h.Role('toolbar'),
          h.AriaLabel(words.toolbar),
          h.AriaOrientation('horizontal'),
          h.Attribute(CONTROLS_ATTRIBUTE, ''),
        ]),
        items.map((item, position) => {
          if (item === 'separator') {
            return h.span(
              slots.separator.attrs([
                h.Key(`separator-${position}`),
                h.Role('separator'),
                h.AriaOrientation('vertical'),
              ]),
              [],
            )
          }
          controlIndex += 1
          const control = controls[controlIndex]
          if (control === undefined) return h.span([], [])
          const menu = menuOf(control.id)
          const drawn = button(control, controlIndex)
          if (menu === undefined || menu === 'link') return drawn
          const opened = open(menu) && describe(control).available
          return h.div(slots.anchor.attrs([h.Key(`anchor-${control.id}`)]), [
            drawn,
            ...(opened ? [popup(menu)] : []),
          ])
        }),
      )
    })
    .pipe(SlotView.attach(keys.mixin))
}
