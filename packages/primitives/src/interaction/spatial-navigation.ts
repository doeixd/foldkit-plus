/**
 * Arrow keys over freely placed items (a board, a canvas, a dashboard of
 * cards), where there are no rows or columns: each arrow moves to the nearest
 * item drawn that way. Which item is nearest is the pure `nearest`. The
 * geometry it needs is read by a Command when the key is handled, once the
 * frame the Model last asked for is drawn, and never kept, so an item that
 * moved between two presses is measured where it is now.
 *
 * The tab stop is `RovingTabindex`'s: the Model slice is the current item's
 * id, and each item takes its `tabindex` and `OnFocus` from
 * `RovingTabindex.itemAttributes`. Only how the next item is chosen differs.
 */
import { Effect, Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Render from 'foldkit/render'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, type SlotItem } from 'foldkit-mixins'
import { isDrawn, marked, markedWith } from '../dom/marked.js'
import { perInput } from '../internal.js'
import * as RovingTabindex from './roving-tabindex.js'

/** A direction on screen: left is left in a right-to-left page too. */
export const Direction = Schema.Literals(['up', 'down', 'left', 'right'])
export type Direction = typeof Direction.Type

/** A box on screen, as `getBoundingClientRect()` gives it. */
export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface Placed {
  readonly id: string
  readonly rect: Rect
}

const steps: Readonly<Record<Direction, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/**
 * The item nearest `current` in `direction`, by the centres of their boxes,
 * or none when nothing lies that way. Only an item whose centre is ahead
 * counts. Those within 45° of the direction come first; among them, and
 * among the rest when none is, the score is the distance ahead plus twice
 * the distance aside, so an item straight ahead beats a nearer one off to
 * the side. A tie goes to the item listed first. An item centred where
 * `current` is lies ahead of it in no direction; a box of no size is a
 * point. None, too, when `current` is not among `items`.
 */
export const nearest = (
  items: ReadonlyArray<Placed>,
  current: string,
  direction: Direction,
): Option.Option<string> => {
  const from = items.find(item => item.id === current)
  if (from === undefined) return Option.none()
  const [dx, dy] = steps[direction]
  const cx = (from.rect.left + from.rect.right) / 2
  const cy = (from.rect.top + from.rect.bottom) / 2
  let best: { readonly id: string; readonly score: number; readonly cone: boolean } | undefined
  for (const { id, rect } of items) {
    if (id === current) continue
    const x = (rect.left + rect.right) / 2 - cx
    const y = (rect.top + rect.bottom) / 2 - cy
    const ahead = x * dx + y * dy
    if (ahead <= 0) continue
    const aside = Math.abs(dx === 0 ? x : y)
    const cone = aside <= ahead
    const score = ahead + aside * 2
    if (best === undefined || (cone && !best.cone) || (cone === best.cone && score < best.score)) {
      best = { id, score, cone }
    }
  }
  return Option.fromUndefinedOr(best?.id)
}

export const Model = Schema.Struct({
  /** The current item's id; none before any item has been focused. */
  current: Schema.OptionFromNullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** An item took focus: the user focused it, or a key moved there. */
  Focused: { id: Schema.String },
  /** An arrow key, answered by the nearest item that way once it is measured. */
  Arrowed: { direction: Direction },
  /** Home or End: the first or last enabled item, in the order the view gives. */
  Jumped: { id: Schema.String },
  /** Nothing lay that way, or the item asked for is not drawn: focus stays. */
  Stayed: {},
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  /** Names this navigation on the page, so two of them each find their own items. */
  id: Schema.String,
})
export type Args = typeof Args.Type

const NAVIGATION = 'data-spatial-navigation'
const ITEM = 'data-spatial-item'
const DISABLED_ITEM = 'data-spatial-item-disabled'

/** An item's element: the one its own navigation holds, not one in a navigation nested inside. */
const itemsIn = (container: Element): ReadonlyArray<Element> =>
  [...marked(container, ITEM), ...marked(container, DISABLED_ITEM)].filter(
    element => element.parentElement?.closest(`[${NAVIGATION}]`) === container,
  )

const idOf = (element: Element): string =>
  element.getAttribute(ITEM) ?? element.getAttribute(DISABLED_ITEM) ?? ''

const focusable = (element: Element): element is HTMLElement | SVGElement =>
  element instanceof HTMLElement || element instanceof SVGElement

/** Focuses `element` and scrolls it into view the least amount that shows it. */
const focusInView = (element: HTMLElement | SVGElement) => {
  element.focus({ preventScroll: true })
  // A DOM with no layout (jsdom) has no `scrollIntoView`.
  if (typeof element.scrollIntoView === 'function')
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/**
 * Moves focus within `navigation` from the item focused now, else `from`,
 * to the nearest enabled item drawn in `direction`. The item focused now
 * comes first: a second press before the first's answer reaches `update`
 * then moves on from where the first one went.
 */
const moveFrom = (navigation: string, from: string, direction: Direction): Message =>
  Option.match(markedWith(document, NAVIGATION, navigation), {
    onNone: () => Message.Stayed(),
    onSome: container => {
      const items = itemsIn(container).filter(isDrawn)
      const active = document.activeElement
      const start =
        items.find(item => active !== null && item.contains(active)) ??
        items.find(item => idOf(item) === from)
      if (start === undefined) return Message.Stayed()
      const startId = idOf(start)
      const placed = items
        .filter(item => item === start || item.hasAttribute(ITEM))
        .map(item => ({ id: idOf(item), rect: item.getBoundingClientRect() }))
      return Option.match(nearest(placed, startId, direction), {
        onNone: () => Message.Stayed(),
        onSome: id => {
          const target = items.find(item => item !== start && idOf(item) === id)
          if (target === undefined || !focusable(target)) return Message.Stayed()
          focusInView(target)
          return Message.Focused({ id })
        },
      })
    },
  })

/** Focuses the item `id` of `navigation`, if it is drawn. */
const focusItem = (navigation: string, id: string): Message =>
  Option.match(markedWith(document, NAVIGATION, navigation), {
    onNone: () => Message.Stayed(),
    onSome: container => {
      const target = itemsIn(container).find(item => idOf(item) === id)
      if (target === undefined || !isDrawn(target) || !focusable(target)) return Message.Stayed()
      focusInView(target)
      return Message.Focused({ id })
    },
  })

/** Runs once the frame the Model last asked for is drawn, so what it reads is current. */
const drawn = (
  name: string,
  args: Readonly<Record<string, unknown>>,
  read: () => Message,
): Command.Command<Message> => ({
  name,
  args,
  effect: Render.afterCommit.pipe(Effect.andThen(Effect.sync(read))),
})

const isCurrent = (model: Model, id: string): boolean =>
  Option.isSome(model.current) && model.current.value === id

const update = (model: Model, message: Message, args: Args): Update.Return<Model, Message> =>
  Message.match<Update.Return<Model, Message>>(message, {
    // A move dispatches `Focused`, and the item's `OnFocus` reports it again.
    Focused: ({ id }) =>
      isCurrent(model, id) ? { model } : { model: { current: Option.some(id) } },
    Arrowed: ({ direction }) =>
      Option.match(model.current, {
        onNone: () => ({ model }),
        onSome: from => ({
          model,
          commands: [
            drawn('SpatialNavigation.move', { from, direction }, () =>
              moveFrom(args.id, from, direction),
            ),
          ],
        }),
      }),
    Jumped: ({ id }) => ({
      model,
      commands: [drawn('SpatialNavigation.focus', { id }, () => focusItem(args.id, id))],
    }),
    Stayed: () => ({ model }),
  })

export const bundle = Bundle.make('SpatialNavigation', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { current: Option.none() } }),
  update,
  /** What a parent decides: `placed.helpers.focus(id)` makes an item current. */
  helpers: args => ({
    focus: (model: Model, id: string) => update(model, Message.Focused({ id }), args),
  }),
})

const arrows: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * The Message a key sends, or none for a key this does not handle: an arrow
 * asks for the nearest item that way, Home and End jump to the first and last
 * enabled item. With Ctrl, Alt or Meta held, a key is left to the page.
 */
export const keyMessage = (
  items: Behaviors.Collection.Items<unknown>,
  key: string,
  modifiers: KeyboardModifiers,
): Option.Option<Message> => {
  if (modifiers.ctrlKey || modifiers.altKey || modifiers.metaKey) return Option.none()
  if (key === 'Home' || key === 'End') {
    const index = key === 'Home' ? items.enabled[0] : items.enabled[items.enabled.length - 1]
    return Option.map(
      Option.fromUndefinedOr(index === undefined ? undefined : items.ids[index]),
      id => Message.Jumped({ id }),
    )
  }
  return Option.map(Option.fromUndefinedOr(arrows[key]), direction =>
    Message.Arrowed({ direction }),
  )
}

export interface BehaviorOptions<Input, Slots> {
  /** The slot that holds the items and receives the keys. */
  readonly container: keyof Slots & string
  /** The slot rendered once per item; must carry the item's id (see `Behaviors.Collection`). */
  readonly item: keyof Slots & string
  /** The items in the order Home and End and the tab stop follow. */
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
}

/**
 * Wires a placed `SpatialNavigation` to the slots. The container is marked
 * with the navigation's `id` and handles arrows, Home and End, each
 * default-prevented; an arrow's target is measured and focused by a Command
 * after the next frame is drawn. Each item is marked with its id (a disabled
 * one is marked apart, so arrows pass it by) and gets `RovingTabindex`'s
 * `tabindex` and `OnFocus`.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const wrap = (message: Message): ParentMessage =>
      declared.wrapper.make(message) as unknown as ParentMessage
    const focused = (id: string): ParentMessage => wrap(Message.Focused({ id }))
    const itemsOf = perInput(options.items)
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          supplies: ['navigation'],
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) => {
            const items = itemsOf(input)
            return [
              h.Attribute(NAVIGATION, args.id),
              h.OnKeyDownPreventDefault((key, modifiers) =>
                Option.map(keyMessage(items, key, modifiers), wrap),
              ),
            ]
          },
        }),
        [options.item]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          supplies: ['focus'],
          attributes: ({
            input,
            h,
            item,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
            readonly item?: SlotItem
          }) => {
            if (item === undefined) return []
            const items = itemsOf(input)
            const id = item.id ?? items.ids[item.index]
            if (id === undefined) return []
            return [
              h.Attribute(items.isDisabled(item.index) ? DISABLED_ITEM : ITEM, id),
              ...RovingTabindex.itemAttributes(
                h,
                items,
                Option.getOrNull(input[declared.field].current),
                item,
                false,
                focused,
              ),
            ]
          },
        }),
        // Keyed by values the caller chose; `forSlots` checks both keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'SpatialNavigation' },
    )
  }
