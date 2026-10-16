/**
 * A menu, opened by a button or at a point (a context menu), whose rows may
 * open submenus, in three layers, each built on the one before.
 *
 * The fork (`MenuView`, `./menuView.ts`) is `@foldkit/ui`'s Menu view with a
 * `toView` seam upstream lacks; the Menu's Model, `update` and Mounts stay
 * upstream's.
 *
 * The panel adapter (`MenuSlots`, `resolve`, `toView`, `fluid`,
 * `overlayBars`, `drawAtPoint`, `pointTarget`) styles a Menu drawn through
 * the fork, whoever keeps its Model: `toView` is that Menu's `toView`. Menubar
 * draws its menus through it, and so does an application that folds
 * `@foldkit/ui`'s Menu itself, for typed items or groups, which the
 * component's rows do not have; `drawAtPoint` and `pointTarget` open such a
 * Menu at a point. One recipe, `Recipes.Menu`, styles every panel and the
 * rows' words and chevrons.
 *
 * The component (`init`, `update`, `view`, `target`) is a menu of string rows
 * drawn through the adapter. Its Model holds `@foldkit/ui` Menus, one for the
 * menu and one per row with `items`, so each keeps its own keys, typeahead and
 * rows, and `update` sorts out which Menu a key belongs to. A plain menu is a
 * menu none of whose rows have `items`, and a context menu is the same menu
 * with `opensAt: 'point'`: a submenu, a button and a point are each one
 * difference in the same Model.
 *
 * Submenus are one level deep. A submenu is drawn inside its row, so its own
 * anchor places it beside the row: its button is a mark the size of the row
 * that nothing sees, focuses or presses. Being inside the row, every key,
 * click and release in a submenu also bubbles to the menu's panel, which
 * answers in the Menu's Messages. `update` reads those against its own Model:
 * while a submenu is open, focus is in it, so the menu's key Messages and its
 * blur are the submenu's and are dropped, and the menu's `Closed` is the
 * submenu's Escape. The submenu's own `Closed` is dropped for that reason, and
 * it draws no click-away: the menu's serves both, closing everything on
 * `pointerdown`. The keys the Menu does not answer (ArrowRight, ArrowLeft, and
 * Tab while a submenu is open) are heard on the menu's panel.
 *
 * A submenu's row is a `menuitem` with `aria-haspopup="menu"` and
 * `aria-expanded`. ArrowRight, Enter or Space on it opens the submenu with its
 * first row active, and ArrowLeft or Escape closes it back to that row; under
 * `direction: 'rtl'` the submenu opens to the left and the two arrows swap.
 * Resting the pointer on it opens it after a short delay, and resting on
 * another row closes it. Choosing a submenu's row closes the whole menu.
 *
 * At a point, `target` goes on the area that opens the menu: a right press
 * records its point, and the `contextmenu` that follows (a right press,
 * Shift+F10 or the ContextMenu key, the browser's own menu kept shut) opens
 * the menu there, its button a mark of no size the Menu's anchor places the
 * rows against. Opened from the keyboard, with no press before it, the mark
 * stands where the menu is drawn.
 */
import * as UiMenu from '@foldkit/ui/menu'
import { Effect, Match, Option, Schema } from 'effect'
import { Attr, Behavior, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { FluidHover, ScrollBars } from 'foldkit-primitives/dom'
import { readingKey } from './direction.js'
import { scrollBarOf } from './popupScroll.js'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import {
  create,
  type MenuGroupRender,
  type MenuHeadingRender,
  type MenuItemRender,
  type MenuRenderInfo,
} from './menuView.js'
import { drawMenu } from './popupView.js'

/**
 * Menu is a nested Submodel: one `button`/`backdrop`/`items` group plus an
 * `item` per entry (and `group`/`heading`/`separator` where the caller
 * groups), so the resolver runs once per bundle and each base attribute
 * passes through by identity.
 *
 * The button owns `click` (and `pointerdown`/`keydown` while enabled); an
 * item owns `click` while interactive. A Behavior adding its own handler to
 * one of those is a conflict, not a second silent owner. Disabled buttons
 * and items publish no click, so the contract still lists it as allowed.
 */
export const MenuSlots = Slots.define({
  wrapper: Slot.make({ capability: Capability.Container }),
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.PointerDown, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  items: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown, Event.PointerUp, Event.Blur],
    attributes: [Attr.Role],
  }),
  scroll: Slot.make({ capability: Capability.Container }),
  item: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  heading: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  rows: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  scrollBar: Slot.make({ capability: Capability.Container }),
  scrollThumb: Slot.make({ capability: Capability.Container }),
  /** A row's words, which `view` draws. */
  label: Slot.make({ capability: Capability.Container }),
  /** A submenu row's content, laid out as the row's own (`display: contents`). */
  sub: Slot.make({ capability: Capability.Container }),
  /** The mark that a row opens a submenu. */
  chevron: Slot.make({ capability: Capability.Container }),
})

export type ResolvedMenuItem<Message> = Omit<MenuItemRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedMenuHeading<Message> = Omit<MenuHeadingRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedMenuGroup<Message> = Omit<
  MenuGroupRender,
  'heading' | 'group' | 'separator' | 'items'
> & {
  readonly heading: ResolvedMenuHeading<Message> | undefined
  readonly group: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly separator: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly items: ReadonlyArray<ResolvedMenuItem<Message>>
}

export type ResolvedMenu<Message> = Omit<
  MenuRenderInfo,
  'wrapper' | 'button' | 'backdrop' | 'items' | 'scroll' | 'groups'
> & {
  readonly wrapper: SlotAttributes<Message>
  readonly button: SlotAttributes<Message>
  readonly buttonContent: Html
  readonly backdrop: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly items: { key: string; attributes: SlotAttributes<Message> } | undefined
  readonly scroll: SlotAttributes<Message> | undefined
  /**
   * The box of the open panel's rows, which `fluid` runs on, and the hover it
   * moves, drawn first in it: this package's, with no upstream bundle (the
   * panel itself carries upstream's anchor, and an element holds one Mount).
   */
  readonly rows: SlotAttributes<Message> | undefined
  readonly highlight: SlotAttributes<Message> | undefined
  /** The overlay bar `overlayBars` drives, beside `scroll` in the panel, and its thumb: only with `scroll`. */
  readonly scrollBar: SlotAttributes<Message> | undefined
  readonly scrollThumb: SlotAttributes<Message> | undefined
  readonly groups: ReadonlyArray<ResolvedMenuGroup<Message>>
}

/** Resolves the menu's bundles (and every item's); pass-throughs stay intact. */
export const resolve = <Input, Message>(
  render: MenuRenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedMenu<Message> => {
  const builders = buildersOf(MenuSlots, mixins, context)
  return {
    id: render.id,
    isVisible: render.isVisible,
    wrapper: builders.wrapper.attrs(render.wrapper),
    button: builders.button.attrs(render.button),
    buttonContent: render.buttonContent,
    backdrop:
      render.backdrop === undefined
        ? undefined
        : {
            key: render.backdrop.key,
            attributes: builders.backdrop.attrs(render.backdrop.attributes),
          },
    items:
      render.items === undefined
        ? undefined
        : {
            key: render.items.key,
            attributes: builders.items.attrs(render.items.attributes),
          },
    scroll: render.scroll === undefined ? undefined : builders.scroll.attrs(render.scroll),
    rows: render.items === undefined ? undefined : builders.rows.attrs(),
    highlight:
      render.items === undefined
        ? undefined
        : builders.highlight.attrs([context.h.AriaHidden(true)]),
    ...scrollBarOf(render.scroll !== undefined, builders, context.h),
    groups: render.groups.map(group => ({
      key: group.key,
      heading:
        group.heading === undefined
          ? undefined
          : {
              id: group.heading.id,
              attributes: builders.heading.attrs(group.heading.attributes),
              content: group.heading.content,
            },
      group:
        group.group === undefined
          ? undefined
          : {
              key: group.group.key,
              attributes: builders.group.attrs(group.group.attributes),
            },
      separator:
        group.separator === undefined
          ? undefined
          : {
              key: group.separator.key,
              attributes: builders.separator.attrs(group.separator.attributes),
            },
      items: group.items.map(item => ({
        key: item.key,
        attributes: builders.item.attrs(item.attributes),
        content: item.content,
      })),
    })),
  }
}

/**
 * The menu's `toView`: `draw` receives its bundles with `mixins` applied.
 * Without one, it draws upstream's markup from them.
 */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedMenu<Message>) => Html = resolved => drawMenu(resolved, context.h),
  ) =>
  (render: MenuRenderInfo): Html =>
    draw(resolve(render, mixins, context))

/**
 * What moves the open panel's `highlight`: on its rows, one highlight
 * follows the pointer to the nearest row (`--fk-popup-hover-*`),
 * and to the row the keys mark (`data-active`) while the pointer is away.
 * Pass them beside the style; until they run, each row marks itself.
 */
export const fluid = [
  Behavior.forSlots(MenuSlots)<unknown, never>(
    {
      rows: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'popup-hover',
            item: '[role="menuitem"]',
            axis: 'y',
            gapClick: true,
            follows: '[data-active]',
          }),
      }),
    },
    { name: 'MenuHover' },
  ).mixin,
] as const

/**
 * What draws the open panel's `scrollBar` over its `scroll` (`ScrollBars`),
 * in place of the browser's bar, on a pointer that can hover. Pass it beside
 * the style when the menu scrolls (`itemsScrollAttributes`); without a
 * `scroll` there is no bar.
 */
export const overlayBars = [
  Behavior.forSlots(MenuSlots)<unknown, never>(
    {
      scroll: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => ScrollBars({}),
      }),
    },
    { name: 'MenuScrollBars' },
  ).mixin,
] as const

/** One row of the menu; a row with `items` opens a submenu of them. */
export interface Row {
  readonly label: string
  readonly items?: ReadonlyArray<string> | undefined
  readonly isItemDisabled?: ((item: string) => boolean) | undefined
}

/** A point in viewport pixels. */
export const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
export type Point = typeof Point.Type

/** The menu's button at a point: a mark of no size at `point`, or where it is drawn. */
const pointMark = (point: Option.Option<Point>) => ({
  ...Option.match(point, {
    onNone: () => ({}),
    onSome: ({ x, y }) => ({ position: 'fixed', left: `${x}px`, top: `${y}px` }),
  }),
  inlineSize: '0',
  blockSize: '0',
  // The Menu recipe gives its button the ladder's height as a minimum, which
  // would set the rows that much below the press.
  minInlineSize: '0',
  minBlockSize: '0',
  padding: '0',
  border: '0',
  overflow: 'hidden',
  opacity: '0',
})

/** The button turned into the mark at `point`, with no tab stop: nothing shows where it stands. */
const pointButton = <Message>(
  button: SlotAttributes<Message>,
  point: Option.Option<Point>,
  h: HtmlBuilder<Message>,
): SlotAttributes<Message> => [...button, h.Tabindex(-1), h.Style(pointMark(point))]

/**
 * A `draw` for `toView` that opens a `@foldkit/ui` Menu at a point, for an
 * application that folds the Menu itself: its button becomes a mark of no
 * size at `point` (where it is drawn, with none), which the Menu's anchor
 * places the rows against, so give the anchor no `gap`. The application
 * keeps the point, from `pointTarget`'s press, and opens the Menu with its
 * `Opened` Message on `pointTarget`'s `onOpen`.
 */
export const drawAtPoint =
  <Message>(point: Option.Option<Point>, h: HtmlBuilder<Message>) =>
  (resolved: ResolvedMenu<Message>): Html =>
    drawMenu({ ...resolved, button: pointButton(resolved.button, point, h) }, h)

export interface PointTargetOptions<Message> {
  /** A right press on the area, at its point in viewport pixels. */
  readonly onPress: (point: Point) => Message
  /** The area's `contextmenu`, which follows a right press, Shift+F10 or the ContextMenu key. */
  readonly onOpen: Message
}

/**
 * The attributes of the area a menu opens in at a point: a right press
 * reports its point, and the `contextmenu` that follows asks to open, the
 * browser's own menu kept shut. `target` is this for the component.
 */
export const pointTarget = <Message>(
  options: PointTargetOptions<Message>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Attribute<Message>> => [
  h.OnPointerDown((_type, button, _screenX, _screenY, _time, clientX, clientY) =>
    button === 2 ? Option.some(options.onPress({ x: clientX, y: clientY })) : Option.none(),
  ),
  h.OnContextMenu(options.onOpen),
]

const Submenu = Schema.Struct({
  /** The index of the row it opens from. */
  row: Schema.Number,
  label: Schema.String,
  menu: UiMenu.Model,
})
type Submenu = typeof Submenu.Type

export const Model = Schema.Struct({
  menu: UiMenu.Model,
  submenus: Schema.Array(Submenu),
  /** Counts the pointer's moves between rows, so a delay that ran out after another does nothing. */
  hover: Schema.Number,
  /** Where the menu opened, at a point: kept while it closes, so a fading panel stays put. */
  point: Schema.Option(Point),
  /** A right press waiting for the `contextmenu` that follows it. */
  press: Schema.Option(Point),
})
export type Model = typeof Model.Type

/** The keys heard outside the Menus. */
const Key = Schema.Literals(['ArrowRight', 'ArrowLeft', 'Tab'])
const isKey = Schema.is(Key)

export const Message = defineMessageUnion({
  GotMenu: { message: UiMenu.Message },
  GotSubmenu: { row: Schema.Number, message: UiMenu.Message },
  /**
   * A key pressed in the menu or a submenu, read against the Model, not the
   * last frame; ArrowRight is toward the submenu's side, as a left-to-right
   * reader presses it.
   */
  Pressed: { key: Key },
  /** A press outside the menu and its submenus. */
  PressedAway: {},
  CompletedHoverDelay: { hover: Schema.Number, row: Schema.Number },
  /** A right press on the `target` area, at its point. */
  PressedTarget: { point: Point },
  /** The `target` area's `contextmenu`: a right press, Shift+F10 or the ContextMenu key. */
  RequestedContextMenu: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** A row was chosen: its value, and the label of the row whose submenu holds it. */
  Selected: { value: Schema.String, submenu: Schema.Option(Schema.String) },
})
export type OutMessage = typeof OutMessage.Type

/** How a menu opens and shuts; each is off by default, as upstream's. */
export interface InitOptions {
  /**
   * Its panels, the menu's and its submenus', carry upstream's transition
   * marks (`data-closed`, `data-enter`, `data-leave`) and stay drawn while
   * they leave, so a recipe's fade runs.
   */
  readonly isAnimated?: boolean | undefined
  /**
   * While it is open the page does not scroll and the rest of it is inert.
   * The menu's alone: its submenus are drawn inside it, and a modal submenu
   * would make the menu's other rows inert.
   */
  readonly isModal?: boolean | undefined
}

/** A shut menu, and a shut submenu for each row with `items`. */
export const init = (id: string, rows: ReadonlyArray<Row>, options: InitOptions = {}): Model => {
  const isAnimated = options.isAnimated ?? false
  return {
    menu: UiMenu.init({ id, isAnimated, isModal: options.isModal ?? false }),
    submenus: rows.flatMap((row, index) =>
      row.items === undefined
        ? []
        : [
            {
              row: index,
              label: row.label,
              menu: UiMenu.init({ id: `${id}-sub-${index}`, isAnimated }),
            },
          ],
    ),
    hover: 0,
    point: Option.none(),
    press: Option.none(),
  }
}

/** How long the pointer rests on a row before its submenu opens, or the open one closes. */
const HOVER_DELAY_MILLISECONDS = 150

const DelayHover = Command.define('DelayHover', {
  args: { hover: Schema.Number, row: Schema.Number },
  messages: [Message.CompletedHoverDelay],
  execute: ({ hover, row }) =>
    Effect.sleep(HOVER_DELAY_MILLISECONDS).pipe(
      Effect.as(Message.CompletedHoverDelay({ hover, row })),
    ),
})

const Menus = create<string>()

type Return = ReturnWithOutMessage<Model, Message, OutMessage>
type Commands = ReadonlyArray<Command.Command<Message>>
type MenuResult = ReturnType<typeof Menus.update>

const ofMenu = (result: MenuResult): Commands =>
  Command.mapMessages(result.commands, message => Message.GotMenu({ message }))

/** A submenu's Commands, but the focus it sends its button: the button is a mark. */
const ofSubmenu = (row: number, result: MenuResult): Commands =>
  Command.mapMessages(result.commands, message => Message.GotSubmenu({ row, message })).filter(
    command => command.name !== UiMenu.FocusButton.name,
  )

const focusPanel = (model: Model): Commands =>
  Command.mapMessages([UiMenu.FocusItems({ id: model.menu.id })], message =>
    Message.GotMenu({ message }),
  )

const submenuAt = (model: Model, row: number): Option.Option<Submenu> =>
  Option.fromNullishOr(model.submenus.find(sub => sub.row === row))

const openSubmenu = (model: Model): Option.Option<Submenu> =>
  Option.fromNullishOr(model.submenus.find(sub => sub.menu.isOpen))

const replaced = (submenus: ReadonlyArray<Submenu>, next: Submenu): ReadonlyArray<Submenu> =>
  submenus.map(sub => (sub.row === next.row ? next : sub))

/** The Model with `parts` written, the same Model when none changed. */
const written = (model: Model, parts: Partial<Model>): Model => {
  const menu = parts.menu ?? model.menu
  const submenus = parts.submenus ?? model.submenus
  const hover = parts.hover ?? model.hover
  const point = parts.point ?? model.point
  const press = parts.press ?? model.press
  return menu === model.menu &&
    submenus === model.submenus &&
    hover === model.hover &&
    point === model.point &&
    press === model.press
    ? model
    : modifyFields(model, {
        menu: () => menu,
        submenus: () => submenus,
        hover: () => hover,
        point: () => point,
        press: () => press,
      })
}

type Shut = Readonly<{ submenus: ReadonlyArray<Submenu>; commands: Commands }>

/** Every open submenu shut, the same array when none was open. */
const shutAll = (submenus: ReadonlyArray<Submenu>): Shut => {
  if (!submenus.some(sub => sub.menu.isOpen)) return { submenus, commands: [] }
  const steps = submenus.map(sub => {
    if (!sub.menu.isOpen) return { sub, commands: [] }
    const result = Menus.update(sub.menu, UiMenu.Message.Closed())
    return {
      sub: modifyFields(sub, { menu: () => result.model }),
      commands: ofSubmenu(sub.row, result),
    }
  })
  return { submenus: steps.map(step => step.sub), commands: steps.flatMap(step => step.commands) }
}

/** The menu's own `update`, and its submenus shut once it is. */
const plain = (model: Model, message: UiMenu.Message): Return => {
  const result = Menus.update(model.menu, message)
  const shut = result.model.isOpen
    ? { submenus: model.submenus, commands: [] }
    : shutAll(model.submenus)
  const next = written(model, { menu: result.model, submenus: shut.submenus })
  const commands = [...ofMenu(result), ...shut.commands]
  return Option.match(Option.fromNullishOr(result.outMessage), {
    onNone: () => ({ model: next, commands }),
    onSome: ({ value }) => ({
      model: next,
      commands,
      outMessage: OutMessage.Selected({ value, submenu: Option.none() }),
    }),
  })
}

/** Opens the submenu at `row`, shutting any other; `active` is the row it starts on. */
const opened = (model: Model, row: number, active: Option.Option<number>): Return => {
  if (!model.menu.isOpen) return { model }
  return Option.match(submenuAt(model, row), {
    onNone: () => ({ model }),
    onSome: sub => {
      if (sub.menu.isOpen) return { model }
      const others = shutAll(model.submenus)
      const result = Menus.update(sub.menu, UiMenu.Message.Opened({ maybeActiveItemIndex: active }))
      return {
        model: written(model, {
          submenus: replaced(others.submenus, modifyFields(sub, { menu: () => result.model })),
        }),
        commands: [...others.commands, ...ofSubmenu(row, result)],
      }
    },
  })
}

/**
 * Closes the open submenu back to its row: the row active and focus on the
 * menu's panel. A pending hover is dropped, so the key has the last word.
 */
const back = (model: Model, sub: Submenu): Return => {
  const shut = shutAll(model.submenus)
  const result = Menus.update(
    model.menu,
    UiMenu.Message.ActivatedItem({ index: sub.row, activationTrigger: 'Keyboard' }),
  )
  return {
    model: written(model, { menu: result.model, submenus: shut.submenus, hover: model.hover + 1 }),
    commands: [...shut.commands, ...ofMenu(result), ...focusPanel(model)],
  }
}

/** The menu's row at `index` under the pointer: a delay before its submenu opens, or the open one closes. */
const hovered = (model: Model, message: UiMenu.Message, index: number): Return => {
  const step = plain(model, message)
  const hover = model.hover + 1
  const unchanged = Option.match(openSubmenu(model), {
    onSome: sub => sub.row === index,
    onNone: () => Option.isNone(submenuAt(model, index)),
  })
  return {
    ...step,
    model: written(step.model, { hover }),
    commands: [...(step.commands ?? []), ...(unchanged ? [] : [DelayHover({ hover, row: index })])],
  }
}

/** A Message of the menu, which a submenu's row answers by opening the submenu. */
const menuStep = (model: Model, message: UiMenu.Message): Return =>
  Match.value(message).pipe(
    Match.withReturnType<Return>(),
    // Not chosen: a click opens the submenu with no row active, Enter or
    // Space on its first row.
    Match.tag('SelectedItem', ({ index }) =>
      Option.isSome(submenuAt(model, index))
        ? opened(model, index, Option.none())
        : plain(model, message),
    ),
    Match.tag('RequestedItemClick', ({ index }) =>
      Option.isSome(submenuAt(model, index))
        ? opened(model, index, Option.some(0))
        : plain(model, message),
    ),
    Match.tag('MovedPointerOverItem', ({ index }) => hovered(model, message, index)),
    Match.orElse(() => plain(model, message)),
  )

/** A Message of the menu while `sub` is open, and so holds focus. */
const whileOpen = (model: Model, sub: Submenu, message: UiMenu.Message): Return =>
  Match.value(message).pipe(
    Match.withReturnType<Return>(),
    // The submenu's keys, typing and releases bubbled to the menu's panel,
    // and the blur of focus moving into the submenu.
    Match.tag(
      'ActivatedItem',
      'Searched',
      'RequestedItemClick',
      'ReleasedPointerOnItems',
      'BlurredItems',
      () => ({ model }),
    ),
    // The submenu's Escape, bubbled. A click in the submenu bubbles to its
    // row as well, which `menuStep` finds open already.
    Match.tag('Closed', () => back(model, sub)),
    Match.orElse(() => menuStep(model, message)),
  )

/** A Message of the submenu `sub`; choosing one of its rows closes the whole menu. */
const submenuStep = (model: Model, sub: Submenu, message: UiMenu.Message): Return => {
  const result = Menus.update(sub.menu, message)
  const submenus =
    result.model === sub.menu
      ? model.submenus
      : replaced(model.submenus, modifyFields(sub, { menu: () => result.model }))
  const commands = ofSubmenu(sub.row, result)
  return Option.match(Option.fromNullishOr(result.outMessage), {
    onNone: () => ({ model: written(model, { submenus }), commands }),
    onSome: ({ value }) => {
      const menu = Menus.update(model.menu, UiMenu.Message.Closed())
      return {
        model: written(model, { menu: menu.model, submenus }),
        commands: [...commands, ...ofMenu(menu)],
        outMessage: OutMessage.Selected({ value, submenu: Option.some(sub.label) }),
      }
    },
  })
}

/** The menu after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotMenu: ({ message }) =>
      Option.match(openSubmenu(model), {
        onSome: sub => whileOpen(model, sub, message),
        onNone: () => menuStep(model, message),
      }),
    GotSubmenu: ({ row, message }) =>
      Option.match(submenuAt(model, row), {
        onNone: () => ({ model }),
        onSome: sub =>
          Match.value(message).pipe(
            Match.withReturnType<Return>(),
            // Its only source is its Escape, which the menu's panel hears too.
            Match.tag('Closed', () => ({ model })),
            // The pointer reached the submenu: a pending close is dropped.
            Match.tag('MovedPointerOverItem', () =>
              submenuStep(written(model, { hover: model.hover + 1 }), sub, message),
            ),
            Match.orElse(() => submenuStep(model, sub, message)),
          ),
      }),
    Pressed: ({ key }) =>
      Option.match(openSubmenu(model), {
        onSome: sub =>
          Match.value(key).pipe(
            Match.withReturnType<Return>(),
            Match.when('ArrowLeft', () => back(model, sub)),
            // Out of a submenu, Tab closes everything and focus returns to the
            // trigger, as upstream's anchor does for a portaled panel.
            Match.when('Tab', () => plain(model, UiMenu.Message.Closed())),
            Match.orElse(() => ({ model })),
          ),
        onNone: () =>
          key === 'ArrowRight'
            ? Option.match(model.menu.maybeActiveItemIndex, {
                onNone: () => ({ model }),
                onSome: index => opened(model, index, Option.some(0)),
              })
            : { model },
      }),
    PressedAway: () => plain(model, UiMenu.Message.Closed()),
    CompletedHoverDelay: ({ hover, row }) => {
      if (hover !== model.hover || !model.menu.isOpen) return { model }
      return Option.match(submenuAt(model, row), {
        onSome: () => opened(model, row, Option.none()),
        onNone: () =>
          Option.match(openSubmenu(model), {
            onNone: () => ({ model }),
            onSome: () => {
              const shut = shutAll(model.submenus)
              return {
                model: written(model, { submenus: shut.submenus }),
                commands: [...shut.commands, ...focusPanel(model)],
              }
            },
          }),
      })
    },
    PressedTarget: ({ point }) => ({ model: written(model, { press: Option.some(point) }) }),
    // The press before it, if any, is where it opens; the keyboard's opens
    // at the area. Its first row active, as a key opening a Menu leaves it.
    RequestedContextMenu: () =>
      plain(
        written(model, { point: model.press, press: Option.none() }),
        UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) }),
      ),
  })

/**
 * The attributes of the area a menu with `opensAt: 'point'` opens in: a
 * right press records its point, and its `contextmenu` opens the menu.
 */
export const target = <ParentMessage>(
  onMessage: (message: Message) => ParentMessage,
  h: HtmlBuilder<ParentMessage>,
): ReadonlyArray<Attribute<ParentMessage>> =>
  pointTarget(
    {
      onPress: point => onMessage(Message.PressedTarget({ point })),
      onOpen: onMessage(Message.RequestedContextMenu()),
    },
    h,
  )

export interface MenuViewOptions<ParentMessage> {
  readonly model: Model
  /** The rows `init` was given, in its order. */
  readonly rows: ReadonlyArray<Row>
  /** The trigger's content; at a point, the name of the mark that stands for it. */
  readonly buttonContent: Html
  readonly isRowDisabled?: ((label: string) => boolean) | undefined
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** Default `'button'`; `'point'` opens where `target`'s area was pressed. */
  readonly opensAt?: 'button' | 'point' | undefined
  /**
   * Under `'rtl'` a submenu opens to the left, and ArrowLeft and ArrowRight
   * swap. Given, it is drawn as the root's `dir`, so the CSS (the chevrons)
   * reads it too; unset, the keys read left to right and the page's `dir`
   * stands.
   */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** The menu's mixins: a style of `MenuSlots` (`Recipes.Menu`), which also styles the rows' words and chevrons. */
  readonly mixins: MixinList<ParentMessage>
  /**
   * The submenus' mixins, default `mixins`. Pass `fluid` here and not in
   * `mixins` when rows open submenus: the menu's rows hold its submenus' rows,
   * which its highlight would chase too.
   */
  readonly submenuMixins?: MixinList<ParentMessage> | undefined
}

/** A submenu's button: over its row, so the submenu's anchor places it beside the row. */
const rowMark = {
  position: 'absolute',
  insetBlockStart: '0',
  insetInlineStart: '0',
  inlineSize: '100%',
  blockSize: '100%',
  margin: '0',
  padding: '0',
  border: '0',
  opacity: '0',
  pointerEvents: 'none',
}

export const view = <ParentMessage>(
  options: MenuViewOptions<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = buildersOf(MenuSlots, options.mixins, { h })
  const { model, rows, onMessage } = options
  const atPoint = options.opensAt === 'point'
  const submenuMixins = options.submenuMixins ?? options.mixins
  const label = (text: string) => h.span(builders.label.attrs(), [text])
  const submenuSide = options.direction === 'rtl' ? 'left-start' : 'right-start'

  const drawSubmenu = (sub: Submenu, items: ReadonlyArray<string>, row: Row, labelId: string) =>
    h.submodel({
      slotId: sub.menu.id,
      model: sub.menu,
      view: Menus.view,
      viewInputs: {
        anchor: { placement: submenuSide, gap: 8, padding: 8, portal: false },
        items,
        itemToConfig: (item: string) => ({ content: label(item) }),
        isItemDisabled: row.isItemDisabled ?? (() => false),
        buttonContent: label(row.label),
        toView: toView(submenuMixins, { h }, resolved =>
          drawMenu(
            {
              ...resolved,
              wrapper: [...resolved.wrapper, h.Style({ display: 'contents' })],
              button: [...resolved.button, h.Tabindex(-1), h.AriaHidden(true), h.Style(rowMark)],
              backdrop: undefined,
              items:
                resolved.items === undefined
                  ? undefined
                  : {
                      ...resolved.items,
                      attributes: [...resolved.items.attributes, h.AriaLabelledBy(labelId)],
                    },
            },
            h,
          ),
        ),
      },
      toParentMessage: message => onMessage(Message.GotSubmenu({ row: sub.row, message })),
    })

  // Upstream draws a submenu's row as any other; the row gains the submenu's
  // semantics, and a name of its words alone, since its content holds the submenu.
  const withSubmenus = (
    groups: ReadonlyArray<ResolvedMenuGroup<ParentMessage>>,
  ): ReadonlyArray<ResolvedMenuGroup<ParentMessage>> =>
    groups.map((group, at) => {
      const start = groups.slice(0, at).reduce((count, each) => count + each.items.length, 0)
      return {
        ...group,
        items: group.items.map((item, offset) => {
          const index = start + offset
          const hosted = Option.all({
            sub: submenuAt(model, index),
            row: Option.fromNullishOr(rows[index]),
          }).pipe(
            Option.flatMap(({ sub, row }) =>
              Option.map(Option.fromNullishOr(row.items), items => ({ sub, row, items })),
            ),
          )
          return Option.match(hosted, {
            onNone: () => item,
            onSome: ({ sub, row, items }) => {
              const labelId = `${item.key}-label`
              return {
                ...item,
                attributes: [
                  ...item.attributes,
                  h.AriaHasPopup('menu'),
                  h.AriaExpanded(sub.menu.isOpen),
                  ...(sub.menu.isOpen ? [h.AriaControls(`${sub.menu.id}-items`)] : []),
                  h.AriaLabelledBy(labelId),
                  h.Style({ position: 'relative' }),
                ],
                content: h.span(
                  builders.sub.attrs([
                    h.Style({ display: 'contents' }),
                    // Whether this row's submenu shows, for a recipe that lets it out of the menu's scroll box.
                    h.DataAttribute('open', String(sub.menu.isOpen)),
                  ]),
                  [
                    h.span(builders.label.attrs([h.Id(labelId)]), [row.label]),
                    h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
                    drawSubmenu(sub, items, row, labelId),
                  ],
                ),
              }
            },
          })
        }),
      }
    })

  const anyOpen = Option.isSome(openSubmenu(model))

  return h.submodel({
    slotId: model.menu.id,
    model: model.menu,
    view: Menus.view,
    viewInputs: {
      anchor: { placement: 'bottom-start', gap: atPoint ? 0 : 4, padding: 8, portal: false },
      items: rows.map(row => row.label),
      itemToConfig: (item: string) => ({ content: label(item) }),
      isItemDisabled: options.isRowDisabled ?? (() => false),
      buttonContent: options.buttonContent,
      toView: toView(options.mixins, { h }, resolved =>
        drawMenu(
          {
            ...resolved,
            // So the CSS reads the direction the keys do: a submenu's chevron points where it opens.
            wrapper:
              options.direction === undefined
                ? resolved.wrapper
                : [...resolved.wrapper, h.Dir(options.direction)],
            button: atPoint ? pointButton(resolved.button, model.point, h) : resolved.button,
            // On press, ahead of the Menu's own click, which then finds it shut.
            backdrop:
              resolved.backdrop === undefined
                ? undefined
                : {
                    ...resolved.backdrop,
                    attributes: [
                      ...resolved.backdrop.attributes,
                      h.OnPointerDown(() => Option.some(onMessage(Message.PressedAway()))),
                    ],
                  },
            items:
              resolved.items === undefined
                ? undefined
                : {
                    ...resolved.items,
                    attributes: [
                      ...resolved.items.attributes,
                      // Tab only out of a submenu: from the menu, its blur closes it.
                      h.OnKeyDownPreventDefault(pressed => {
                        const key = readingKey(pressed, options.direction)
                        return isKey(key) && (key !== 'Tab' || anyOpen)
                          ? Option.some(onMessage(Message.Pressed({ key })))
                          : Option.none()
                      }),
                    ],
                  },
            groups: withSubmenus(resolved.groups),
          },
          h,
        ),
      ),
    },
    toParentMessage: message => onMessage(Message.GotMenu({ message })),
  })
}
