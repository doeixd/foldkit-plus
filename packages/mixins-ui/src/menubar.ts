import * as UiMenu from '@foldkit/ui/menu'
import { Effect, Option, Schema } from 'effect'
import { Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { readingKey } from './direction.js'
import { toView as menuToView } from './menu.js'
import { create, type MenuBundle } from './menuView.js'
import { drawMenu } from './popupView.js'
import type { MixinList } from './resolve.js'

/**
 * A menu bar, shadcn's and the APG's: a row of `@foldkit/ui` Menus, so each
 * menu's keys, typeahead, rows and dismissal stay the Menu's, and the bar
 * adds what a row of them needs. One trigger is the bar's tab stop, and
 * ArrowLeft and ArrowRight (Home and End while all are shut) move it, the two
 * swapped under `direction: 'rtl'`; with a menu open they shut it and open
 * the next, its first row active. While one is open, pointing at another
 * trigger opens that one, and opening any menu
 * shuts the rest. The menus' Models are this module's Model, which the
 * application keeps and folds with `update`, as it folds a Menu's.
 *
 * The bar's keys and hover listen outside each menu's submodel (a handler
 * inside it would speak the Menu's Messages): `keydown` on the bar, which
 * the triggers and rows bubble to, and `mouseenter` on each `menu`. The
 * triggers stand above an open menu's backdrop (`z-index: 1`), which holds
 * only while nothing between the bar and the page makes a stacking context.
 */
export const MenubarSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container, events: [Event.KeyDown] }),
  menu: Slot.make({ capability: Capability.Container, events: [Event.Hover] }),
})

export const Model = Schema.Struct({
  menus: Schema.Array(UiMenu.Model),
  /** The index of the trigger that is the bar's tab stop. */
  stop: Schema.Number,
})
export type Model = typeof Model.Type

/** The keys the bar answers; every other is the Menus'. */
const BarKey = Schema.Literals(['ArrowRight', 'ArrowLeft', 'Home', 'End'])
type BarKey = typeof BarKey.Type
const isBarKey = Schema.is(BarKey)

export const Message = defineMessageUnion({
  GotMenu: { index: Schema.Number, message: UiMenu.Message },
  /**
   * A key pressed in the bar, as a left-to-right reader presses it: ArrowRight
   * is toward the bar's end. `update` reads it against its own Model, not the
   * one the last frame drew, so keys faster than a frame still move on.
   */
  Pressed: { key: BarKey },
  /** The pointer reached the trigger at `to`. */
  Hovered: { to: Schema.Number },
  CompletedFocusTrigger: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** A row was chosen: the menu's index and the row's value. */
  Selected: { menu: Schema.Number, value: Schema.String },
})
export type OutMessage = typeof OutMessage.Type

/** One shut menu per id, the first trigger the tab stop. */
export const init = (ids: ReadonlyArray<string>): Model => ({
  menus: ids.map(id => UiMenu.init({ id })),
  stop: 0,
})

const FocusTrigger = Command.define('FocusTrigger', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusTrigger],
  execute: ({ id }) =>
    Dom.focus(`#${UiMenu.buttonId(id)}`).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedFocusTrigger()),
    ),
})

/** Upstream's Menu `update`, which `@foldkit/ui/menu` keeps behind `create`. */
const Menus = create<string>()

type Return = ReturnWithOutMessage<Model, Message, OutMessage>
type Step = Readonly<{ menu: UiMenu.Model; commands: ReadonlyArray<Command.Command<Message>> }>

const lifted = (index: number, result: ReturnType<MenuBundle['update']>): Step => ({
  menu: result.model,
  commands: Command.mapMessages(result.commands, message => Message.GotMenu({ index, message })),
})

const kept = (menu: UiMenu.Model): Step => ({ menu, commands: [] })

/**
 * Every open menu but `keep` shut, without the focus a Menu sends back to its
 * button: focus is going to the menu that opens.
 */
const shutOthers = (menus: ReadonlyArray<UiMenu.Model>, keep: number): ReadonlyArray<Step> =>
  menus.map((menu, index) => {
    if (index === keep || !menu.isOpen) return kept(menu)
    const step = lifted(index, Menus.update(menu, UiMenu.Message.Closed()))
    return {
      menu: step.menu,
      commands: step.commands.filter(command => command.name !== UiMenu.FocusButton.name),
    }
  })

/** `steps` with the one at `index` replaced by `step`, written to the Model. */
const applied = (
  model: Model,
  steps: ReadonlyArray<Step>,
  index: number,
  step: Step,
  stop: number,
): Return => {
  const all = steps.map((other, at) => (at === index ? step : other))
  return {
    model: modifyFields(model, { menus: () => all.map(each => each.menu), stop: () => stop }),
    commands: all.flatMap(each => each.commands),
  }
}

/** Opens the menu at `to`, shutting the rest; `active` is the row it starts on. */
const opened = (model: Model, to: number, active: Option.Option<number>): Return => {
  const menu = model.menus[to]
  if (menu === undefined || menu.isOpen) return { model }
  const step = lifted(
    to,
    Menus.update(menu, UiMenu.Message.Opened({ maybeActiveItemIndex: active })),
  )
  return applied(model, shutOthers(model.menus, to), to, step, to)
}

/** Where each key moves from the trigger at `from`, wrapping at the ends. */
const moves: Readonly<Record<BarKey, (from: number, last: number) => number>> = {
  ArrowRight: (from, last) => (from >= last ? 0 : from + 1),
  ArrowLeft: (from, last) => (from <= 0 ? last : from - 1),
  Home: () => 0,
  End: (_from, last) => last,
}

/** The index of the open menu, if one is. */
const openIndex = (model: Model): Option.Option<number> => {
  const index = model.menus.findIndex(menu => menu.isOpen)
  return index === -1 ? Option.none() : Option.some(index)
}

/** The bar after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotMenu: ({ index, message }) => {
      const menu = model.menus[index]
      if (menu === undefined) return { model }
      const result = Menus.update(menu, message)
      const step = lifted(index, result)
      const outMessage = Option.map(Option.fromNullishOr(result.outMessage), selected =>
        OutMessage.Selected({ menu: index, value: selected.value }),
      )
      if (step.menu === menu && step.commands.length === 0 && Option.isNone(outMessage)) {
        return { model }
      }
      const justOpened = step.menu.isOpen && !menu.isOpen
      const next = justOpened
        ? applied(model, shutOthers(model.menus, index), index, step, index)
        : applied(model, model.menus.map(kept), index, step, model.stop)
      return Option.match(outMessage, {
        onNone: () => next,
        onSome: selected => ({ ...next, outMessage: selected }),
      })
    },
    Pressed: ({ key }) => {
      const last = model.menus.length - 1
      const move = moves[key]
      return Option.match(openIndex(model), {
        // Open, the arrows across open the next menu; Home and End are its rows'.
        onSome: index =>
          key === 'ArrowRight' || key === 'ArrowLeft'
            ? opened(model, move(index, last), Option.some(0))
            : { model },
        // Shut, the keys move the tab stop.
        onNone: () => {
          const to = move(model.stop, last)
          return Option.match(Option.fromNullishOr(model.menus[to]), {
            onNone: () => ({ model }),
            onSome: menu => ({
              model: to === model.stop ? model : modifyFields(model, { stop: () => to }),
              commands: [FocusTrigger({ id: menu.id })],
            }),
          })
        },
      })
    },
    Hovered: ({ to }) =>
      Option.isSome(openIndex(model)) ? opened(model, to, Option.none()) : { model },
    CompletedFocusTrigger: () => ({ model }),
  })

export interface MenubarMenu {
  /** The trigger's text. */
  readonly label: string
  readonly items: ReadonlyArray<string>
  readonly isItemDisabled?: ((item: string) => boolean) | undefined
}

export interface MenubarView<ParentMessage> {
  /** The bar's name. */
  readonly label: string
  readonly model: Model
  /** One per menu of the Model, in its order. */
  readonly menus: ReadonlyArray<MenubarMenu>
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** Default `'ltr'`; under `'rtl'` ArrowLeft and ArrowRight swap. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** A style of `MenubarSlots`, for the bar's look. */
  readonly style?: NamedStyle<typeof MenubarSlots> | undefined
  /** The menus' mixins: a style of `MenuSlots` (`Recipes.MenubarMenu`), and `Menu.fluid`. */
  readonly menuMixins: MixinList<ParentMessage>
}

export const view = <ParentMessage>(
  options: MenubarView<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    MenubarSlots,
    options.style === undefined ? [] : [options.style.mixin],
    { input: undefined, h },
  )
  const { model, onMessage } = options
  return h.div(
    builders.bar.attrs([
      h.Role('menubar'),
      h.AriaLabel(options.label),
      h.OnKeyDownPreventDefault(pressed => {
        const key = readingKey(pressed, options.direction)
        return isBarKey(key) ? Option.some(onMessage(Message.Pressed({ key }))) : Option.none()
      }),
    ]),
    model.menus.flatMap((menu, index) => {
      const shown = options.menus[index]
      if (shown === undefined) return []
      return [
        h.keyed('div')(
          menu.id,
          builders.menu.attrs([h.OnMouseEnter(onMessage(Message.Hovered({ to: index })))]),
          [
            h.submodel({
              slotId: menu.id,
              model: menu,
              view: Menus.view,
              viewInputs: {
                anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
                items: shown.items,
                itemToConfig: (item: string) => ({ content: h.span([], [item]) }),
                isItemDisabled: shown.isItemDisabled ?? (() => false),
                buttonContent: h.span([], [shown.label]),
                // The bar's tab stop, and a trigger as the APG's menubar names it.
                toView: menuToView(options.menuMixins, { h }, resolved =>
                  drawMenu(
                    {
                      ...resolved,
                      button: [
                        ...resolved.button,
                        h.Role('menuitem'),
                        h.Tabindex(index === model.stop ? 0 : -1),
                      ],
                    },
                    h,
                  ),
                ),
              },
              toParentMessage: message => onMessage(Message.GotMenu({ index, message })),
            }),
          ],
        ),
      ]
    }),
  )
}
