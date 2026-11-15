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
import { Equal, Option } from 'effect'
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
import { markActive } from 'foldkit-richtext-dom/toolbar'
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
 * One control, in the order drawn. A `mark` is a mark of the document's vocabulary, by name: the
 * toolbar cannot know which marks an application declared, so it lists none by itself beyond
 * `standardFormattingItems`'.
 */
export type FormattingItem =
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
  readonly items?: ReadonlyArray<FormattingItem> | undefined
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
   * What the insert menu lists, with each entry's Message wrapped by `wrap`: the slash menu's
   * entries, so the two never disagree. Default: the editor's own blocks (`group: 'Blocks'`).
   */
  readonly inserts?: ReadonlyArray<SlashEntry<EditorEvent>> | undefined
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

const defaultInserts = editorEntries.filter(each => each.group === 'Blocks')

/** A control, resolved: what the arrows move between and what `Keys` finds focus on. */
interface Control {
  readonly id: string
  readonly item: Exclude<FormattingItem, 'separator'>
}

const controlId = (item: Exclude<FormattingItem, 'separator'>): string =>
  typeof item === 'string' ? item : `mark-${item.mark}`

const controlsOf = (items: ReadonlyArray<FormattingItem>): ReadonlyArray<Control> =>
  items.flatMap(item => (item === 'separator' ? [] : [{ id: controlId(item), item }]))

const MENU_OF: Readonly<Record<string, FormattingMenu>> = {
  style: 'style',
  insert: 'insert',
  link: 'link',
}
const menuOf = (id: string): FormattingMenu | undefined =>
  Object.hasOwn(MENU_OF, id) ? MENU_OF[id] : undefined

/** The ids a popup's items draw, in order; only `style` and `insert` list items of the toolbar's own. */
const menuItemIds = <Message>(
  input: FormattingToolbarInput<Message>,
  menu: FormattingMenu,
): ReadonlyArray<string> => {
  const entries =
    menu === 'style' ? styles : menu === 'insert' ? (input.inserts ?? defaultInserts) : []
  return entries.map(each => `${input.id}-${menu}-${each.id}`)
}

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
 * Pressing a control does not stop the browser moving the document selection to it: the editor
 * keeps its own selection in the Model, which every command reads, and which survives.
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
          const controls = controlsOf(input.items ?? standardFormattingItems)
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
          if (key === 'Escape') {
            return input.menu === undefined || input.menu !== menu
              ? Option.none()
              : Option.some(input.toggled(input.menu, false))
          }
          if (key === 'ArrowDown') {
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
      const items = input.items ?? standardFormattingItems
      const controls = controlsOf(items)
      const stopped = controls.findIndex(control => control.id === input.roving.current)
      const stop = stopped === -1 ? 0 : stopped
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
        control: Control,
      ): {
        readonly name: string
        readonly icon: ReadonlyArray<Html>
        readonly label?: string
        readonly available: boolean
        readonly pressed?: boolean
        readonly expanded?: boolean
        readonly popup?: 'menu' | 'dialog'
        readonly press: Message
      } => {
        const { item } = control
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

      const button = (control: Control, index: number): Html => {
        const made = describe(control)
        const pattern = shortcuts[control.id]
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
        const entries = menu === 'style' ? styles : (input.inserts ?? defaultInserts)
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
                  ...(menu === 'style' ? [h.AriaChecked(each === chosen)] : []),
                  h.DataAttribute(menu, each.id),
                  h.OnClick(input.wrap(each.message)),
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
