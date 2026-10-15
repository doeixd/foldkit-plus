import * as UiMenu from '@foldkit/ui/menu'
import { Effect, Match, Option, Schema } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { toView as menuToView, type ResolvedMenuGroup } from './menu.js'
import { create } from './menuView.js'
import { drawMenu } from './popupView.js'
import type { MixinList } from './resolve.js'

/**
 * A menu whose rows may open submenus, shadcn's DropdownMenuSub and the
 * APG's: `@foldkit/ui` Menus, one for the menu and one per submenu, so each
 * keeps its own keys, typeahead and rows. A submenu's row is a `menuitem`
 * with `aria-haspopup="menu"` and `aria-expanded`. ArrowRight, Enter or Space
 * on it opens the submenu with its first row active, and ArrowLeft or Escape
 * closes it back to that row; resting the pointer on it opens it after a
 * short delay, and resting on another row closes it. Choosing a submenu's row
 * closes the whole menu. The Menus' Models are this module's Model, which the
 * application keeps and folds with `update`, as it folds a Menu's.
 *
 * Each submenu is drawn inside its row, so the submenu's own anchor places it
 * beside the row: its button is a mark the size of the row that nothing sees,
 * focuses or presses. Being inside the row, every key, click and release in
 * a submenu also bubbles to the menu's panel, which answers in the Menu's
 * Messages. `update` reads those against its own Model: while a submenu is
 * open, focus is in it, so the menu's key Messages and its blur are the
 * submenu's and are dropped, and the menu's `Closed` is the submenu's Escape.
 * The submenu's own `Closed` is dropped for that reason, and it draws no
 * click-away: the menu's serves both, closing everything on `pointerdown`.
 * The keys the Menu does not answer (ArrowRight, ArrowLeft, and Tab while a
 * submenu is open) are heard on the menu's panel, outside the submenus.
 *
 * One level deep. Pass `Menu.fluid` to the submenus only: the menu's rows
 * hold its submenus' rows, which its highlight would chase too.
 */
export const NestedMenuSlots = Slots.define({
  /** A submenu row's content, laid out as the row's own (`display: contents`). */
  sub: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  /** The mark that a row opens a submenu. */
  chevron: Slot.make({ capability: Capability.Container }),
})

/** One row of the menu; a row with `items` opens a submenu of them. */
export interface NestedRow {
  readonly label: string
  readonly items?: ReadonlyArray<string> | undefined
  readonly isItemDisabled?: ((item: string) => boolean) | undefined
}

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
})
export type Model = typeof Model.Type

/** The keys heard outside the Menus. */
const Key = Schema.Literals(['ArrowRight', 'ArrowLeft', 'Tab'])
const isKey = Schema.is(Key)

export const Message = defineMessageUnion({
  GotMenu: { message: UiMenu.Message },
  GotSubmenu: { row: Schema.Number, message: UiMenu.Message },
  /** A key pressed in the menu or a submenu, read against the Model, not the last frame. */
  Pressed: { key: Key },
  /** A press outside the menu and its submenus. */
  PressedAway: {},
  CompletedHoverDelay: { hover: Schema.Number, row: Schema.Number },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** A row was chosen: its value, and the label of the row whose submenu holds it. */
  Selected: { value: Schema.String, submenu: Schema.Option(Schema.String) },
})
export type OutMessage = typeof OutMessage.Type

/** A shut menu, and a shut submenu for each row with `items`. */
export const init = (id: string, rows: ReadonlyArray<NestedRow>): Model => ({
  menu: UiMenu.init({ id }),
  submenus: rows.flatMap((row, index) =>
    row.items === undefined
      ? []
      : [{ row: index, label: row.label, menu: UiMenu.init({ id: `${id}-sub-${index}` }) }],
  ),
  hover: 0,
})

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
  return menu === model.menu && submenus === model.submenus && hover === model.hover
    ? model
    : modifyFields(model, { menu: () => menu, submenus: () => submenus, hover: () => hover })
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
  })

export interface NestedMenuView<ParentMessage> {
  readonly model: Model
  /** The rows `init` was given, in its order. */
  readonly rows: ReadonlyArray<NestedRow>
  /** The trigger's content. */
  readonly buttonContent: Html
  readonly isRowDisabled?: ((label: string) => boolean) | undefined
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** A style of `NestedMenuSlots` (`Recipes.NestedMenu`), for the rows' words and chevrons. */
  readonly style?: NamedStyle<typeof NestedMenuSlots> | undefined
  /** The menu's mixins: a style of `MenuSlots` (`Recipes.Menu`). */
  readonly menuMixins: MixinList<ParentMessage>
  /** The submenus' mixins: a style of `MenuSlots`, and `Menu.fluid`. */
  readonly submenuMixins: MixinList<ParentMessage>
}

/** A submenu's button: over its row, so the submenu's anchor places it beside the row. */
const mark = {
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
  options: NestedMenuView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    NestedMenuSlots,
    options.style === undefined ? [] : [options.style.mixin],
    { input: undefined, h },
  )
  const { model, rows, onMessage } = options
  const label = (text: string) => h.span(builders.label.attrs(), [text])

  const drawSubmenu = (
    sub: Submenu,
    items: ReadonlyArray<string>,
    row: NestedRow,
    labelId: string,
  ) =>
    h.submodel({
      slotId: sub.menu.id,
      model: sub.menu,
      view: Menus.view,
      viewInputs: {
        anchor: { placement: 'right-start', gap: 8, padding: 8, portal: false },
        items,
        itemToConfig: (item: string) => ({ content: label(item) }),
        isItemDisabled: row.isItemDisabled ?? (() => false),
        buttonContent: label(row.label),
        toView: menuToView(options.submenuMixins, { h }, resolved =>
          drawMenu(
            {
              ...resolved,
              wrapper: [...resolved.wrapper, h.Style({ display: 'contents' })],
              button: [...resolved.button, h.Tabindex(-1), h.AriaHidden(true), h.Style(mark)],
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
                content: h.span(builders.sub.attrs([h.Style({ display: 'contents' })]), [
                  h.span(builders.label.attrs([h.Id(labelId)]), [row.label]),
                  h.span(builders.chevron.attrs([h.AriaHidden(true)]), []),
                  drawSubmenu(sub, items, row, labelId),
                ]),
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
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
      items: rows.map(row => row.label),
      itemToConfig: (item: string) => ({ content: label(item) }),
      isItemDisabled: options.isRowDisabled ?? (() => false),
      buttonContent: options.buttonContent,
      toView: menuToView(options.menuMixins, { h }, resolved =>
        drawMenu(
          {
            ...resolved,
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
                      h.OnKeyDownPreventDefault(key =>
                        isKey(key) && (key !== 'Tab' || anyOpen)
                          ? Option.some(onMessage(Message.Pressed({ key })))
                          : Option.none(),
                      ),
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
