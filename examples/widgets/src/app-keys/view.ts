/**
 * A Command and a Menubar, each answering a key of the application's beside
 * its own through the widget's `routes` option. Both widgets own a keydown
 * handler on one slot, so a route on a key the widget already answers is
 * refused when the view is drawn (`mixins:key-conflict`); the section shows
 * that refusal as text, found by drawing the offending view on the inert
 * builder, where nothing is dispatched.
 */
import { Array, Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Behaviors, Capability, Diagnostics, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Command, CommandSlots, Menubar, MenubarSlots, MenuSlots, Recipes } from 'foldkit-mixins-ui'
import { appKeysStyle } from './style.js'
import { MENUS, Message, initial, stopOf, type Model } from './app.js'
import { textOf } from '../text.js'

export const AppKeysSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  note: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
  line: Slot.make({ capability: Capability.Container }),
  clashes: Slot.make({ capability: Capability.Container }),
  clash: Slot.make({ capability: Capability.Container }),
})

const CommandStyle = Style.forSlots(CommandSlots)(Recipes.Command({}))
const BarStyle = Style.forSlots(MenubarSlots)(Recipes.Menubar({}))
const BarMenuStyle = Style.forSlots(MenuSlots)(Recipes.MenubarMenu({}))
const layout = appKeysStyle(AppKeysSlots)

/** The styles the section draws with, for the page's sheet. */
export const appKeysStyles = [layout, CommandStyle, BarStyle, BarMenuStyle] as const

const { Keys } = Behaviors

const clearOnEscape: Command.CommandRoute<string, Message> = Keys.route('Clear', {
  on: [Keys.chord('Escape')],
  handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.ClearedQuery())),
})

const lastRow: Command.CommandRoute<string, Message> = Keys.route('Last row', {
  on: [Keys.chord('End')],
  handle: ({ input }) =>
    Option.map(Option.fromNullishOr(input.rows.at(-1)), value => Message.Moved({ value })),
})

const lastMenu: Menubar.Route<Message> = Keys.route('Last menu', {
  on: [Keys.chord('PageDown')],
  handle: () => Option.some(Message.GotBar({ message: Menubar.Message.Pressed({ key: 'End' }) })),
})

/** ArrowDown is the Command's own "Next"; a second route on it is refused. */
const downAgain: Command.CommandRoute<string, Message> = Keys.route('Down again', {
  on: [Keys.chord('ArrowDown')],
  handle: () => Option.none(),
})

/** Home is the bar's own "Menubar Home". */
const homeAgain: Menubar.Route<Message> = Keys.route('Home again', {
  on: [Keys.chord('Home')],
  handle: () => Option.none(),
})

const GROUPS: ReadonlyArray<Command.CommandGroup<string>> = [
  {
    heading: 'File',
    items: [
      { value: 'open-file', label: 'Open file' },
      { value: 'save-file', label: 'Save file' },
    ],
  },
  {
    heading: 'Edit',
    items: [
      { value: 'rename', label: 'Rename' },
      { value: 'delete', label: 'Delete' },
    ],
  },
]

const commandOf = (
  model: Model,
  routes: ReadonlyArray<Command.CommandRoute<string, Message>>,
  h: HtmlBuilder<Message>,
) =>
  Command.view(
    {
      id: 'keys-command',
      label: 'Commands',
      groups: GROUPS,
      query: model.query,
      onQuery: query => Message.Queried({ query }),
      active: model.active,
      onActive: value => Message.Moved({ value }),
      onRun: value => Message.Ran({ value }),
      routes,
      style: CommandStyle,
    },
    h,
  )

const barOf = (
  model: Model,
  routes: ReadonlyArray<Menubar.Route<Message>>,
  h: HtmlBuilder<Message>,
) =>
  Menubar.view(
    {
      label: 'Editor',
      model: model.bar,
      menus: MENUS.map(menu => ({
        label: menu.label,
        rows: menu.rows.map(row => ({ value: row, label: row })),
      })),
      onMessage: message => Message.GotBar({ message }),
      routes,
      style: BarStyle,
      menuMixins: [BarMenuStyle.mixin],
    },
    h,
  )

/** What drawing a view refuses with, if it does: a key the application took twice. */
const refusal = (draw: () => unknown): Option.Option<string> => {
  try {
    draw()
    return Option.none()
  } catch (error) {
    if (error instanceof Diagnostics.DiagnosticError) {
      return Option.some(`${error.diagnostic.code}: ${error.diagnostic.message}`)
    }
    throw error
  }
}

const inert = SlotView.inertBuilder<Message>()

/** The refusals of the two views with a route on a key the widget answers, drawn once. */
export const clashes: ReadonlyArray<string> = Array.getSomes([
  refusal(() => commandOf(initial, [downAgain], inert)),
  refusal(() => barOf(initial, [homeAgain], inert)),
])

export const AppKeys = SlotView.forMessages<Message>()
  .define(AppKeysSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      h.p(slots.note.attrs(), [
        'In the field, ↑ ↓ and Enter are the Command’s own; End and Escape are this application’s. On the bar, the arrows are the bar’s own; PageDown is this application’s.',
      ]),
      commandOf(model, [clearOnEscape, lastRow], h),
      barOf(model, [lastMenu], h),
      h.div(slots.status.attrs([h.Role('status'), h.AriaLabel('Answers')]), [
        h.p(slots.line.attrs(), [`Ran: ${textOf(model.ran)}`]),
        h.p(slots.line.attrs(), [`Bar tab stop: ${stopOf(model)}`]),
        h.p(slots.line.attrs(), [`Chose: ${textOf(model.chose)}`]),
      ]),
      h.ul(
        slots.clashes.attrs([h.AriaLabel('Refused routes')]),
        clashes.map(text => h.li(slots.clash.attrs([h.Key(text)]), [text])),
      ),
    ]),
  )
  .pipe(Style.attach(layout))
