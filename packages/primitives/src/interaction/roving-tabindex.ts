/**
 * One tab stop for a set of items (a toolbar, a tab list, a listbox): arrows
 * move focus between them, the rest stay out of the tab order. The current
 * item's id is the Model slice, so a reorder keeps the same item current and a
 * resumed page knows where focus was. Which item comes next is a pure
 * function of the items and the key; the Behavior wires it to the slots.
 */
import { Option, Schema } from 'effect'
import type { Attribute, HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import {
  A11y,
  Behavior,
  Behaviors,
  Capability,
  idSelector,
  SlotView,
  type SlotItem,
} from 'foldkit-mixins'
import type { Declared } from 'foldkit-bundle'
import { perInput } from '../internal.js'

export const Orientation = Schema.Literals(['vertical', 'horizontal', 'both'])
export type Orientation = typeof Orientation.Type

export const Model = Schema.Struct({
  /** The current item's id, or `null` before any item has been focused. */
  current: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** An item became current: the user focused it, or a key moved there. */
  Focused: { id: Schema.String },
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  orientation: Orientation,
  /** Wrap from the last enabled item to the first, and back. */
  loop: Schema.Boolean,
  /** Keep DOM focus on the container and point at the current item with
   *  `aria-activedescendant` instead of moving focus. */
  virtual: Schema.Boolean,
})
export type Args = typeof Args.Type

// Moving focus by key dispatches `Focused`, and the item's `OnFocus` reports it again.
const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  model.current === message.id ? { model } : { model: { current: message.id } }

export const bundle = Bundle.make('RovingTabindex', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { current: null } }),
  update,
  /** What a parent decides: `placed.helpers.focus(id)` makes an item current. */
  helpers: () => ({
    focus: (model: Model, id: string) => update(model, Message.Focused({ id })),
  }),
})

export type Direction = 'ltr' | 'rtl'

export interface MoveOptions {
  readonly orientation: Orientation
  readonly loop: boolean
  readonly direction: Direction
  /** How many enabled items PageUp and PageDown move; absent, they are not handled. */
  readonly page?: number
}

const isPlain = (modifiers: KeyboardModifiers): boolean =>
  !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey

/**
 * The index the key moves to from `current`, over the enabled indices only, or
 * `undefined` when the key is not a navigation key here. `current` may be
 * `-1` (nothing current yet): arrows then land on the first or last enabled
 * item. Under `rtl`, left and right swap. PageUp and PageDown move by `page`
 * and clamp at the ends, never wrapping.
 */
export const move = (
  enabled: ReadonlyArray<number>,
  current: number,
  key: string,
  modifiers: KeyboardModifiers,
  options: MoveOptions,
): number | undefined => {
  if (enabled.length === 0 || !isPlain(modifiers)) return undefined
  const first = enabled[0]!
  const last = enabled[enabled.length - 1]!
  if (key === 'Home') return first
  if (key === 'End') return last
  if (options.page !== undefined && (key === 'PageUp' || key === 'PageDown')) {
    const position = enabled.indexOf(current)
    if (position === -1) return key === 'PageDown' ? first : last
    const jumped = position + (key === 'PageDown' ? options.page : -options.page)
    return enabled[Math.min(enabled.length - 1, Math.max(0, jumped))]
  }
  const vertical = options.orientation !== 'horizontal'
  const horizontal = options.orientation !== 'vertical'
  const forwardKey = options.direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const backwardKey = options.direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
  const step =
    (vertical && key === 'ArrowDown') || (horizontal && key === forwardKey)
      ? 1
      : (vertical && key === 'ArrowUp') || (horizontal && key === backwardKey)
        ? -1
        : 0
  if (step === 0) return undefined
  const position = enabled.indexOf(current)
  if (position === -1) return step === 1 ? first : last
  const next = position + step
  if (next < 0) return options.loop ? last : first
  if (next >= enabled.length) return options.loop ? first : last
  return enabled[next]
}

/** The item that holds the tab stop: the current one, else the first enabled. */
export const tabStop = (
  items: Behaviors.Collection.Items<unknown>,
  current: string | null,
): number => {
  const index = current === null ? -1 : items.indexOf(current)
  if (index !== -1 && !items.isDisabled(index)) return index
  return items.enabled[0] ?? -1
}

export interface KeyOptions<Input> {
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
  /** Default `'ltr'`; return `'rtl'` to swap left and right. */
  readonly direction?: (input: Input) => Direction
}

export interface BehaviorOptions<
  Input,
  Slots,
  Container extends keyof Slots & string = keyof Slots & string,
  Item extends keyof Slots & string = keyof Slots & string,
> extends KeyOptions<Input> {
  /** The slot that receives the arrow keys. */
  readonly container: Container
  /** The slot rendered once per item; must carry the item's id (see `Behaviors.Collection`). */
  readonly item: Item
}

const ARROWS: Readonly<Record<Orientation, ReadonlyArray<Behaviors.Keys.NamedKey>>> = {
  vertical: ['ArrowUp', 'ArrowDown'],
  horizontal: ['ArrowLeft', 'ArrowRight'],
  both: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
}

/** The chords of an orientation's arrows, Shift up and down: what `move` takes beyond Home and End. */
export const arrowChords = (orientation: Orientation): ReadonlyArray<Behaviors.Keys.Gesture> =>
  ARROWS[orientation].flatMap(key => Behaviors.Keys.withShift(key))

/** A selector for an element by id, safe for any id. */
export { idSelector }

/**
 * The attributes one item gets: `tabindex` 0 when it holds the tab stop and
 * -1 otherwise (none under `virtual`), and `OnFocus` reporting it current.
 * Shared with `ListNavigation`.
 */
export const itemAttributes = <ParentMessage>(
  h: HtmlBuilder<ParentMessage>,
  items: Behaviors.Collection.Items<unknown>,
  current: string | null,
  item: SlotItem,
  virtual: boolean,
  focused: (id: string) => ParentMessage,
): ReadonlyArray<Attribute<ParentMessage>> => {
  const id = item.id ?? items.ids[item.index]
  if (id === undefined) return []
  const isStop = tabStop(items, current) === item.index
  return [...(virtual ? [] : [h.Tabindex(isStop ? 0 : -1)]), h.OnFocus(focused(id))]
}

/**
 * The route a `RovingTabindex` installs on its container: the arrows of the
 * orientation, Home and End, each answering `Focused` and moving focus to the
 * item (under `virtual`, only the Message). List it in a `Keys.behavior` beside
 * routes of your own, as `behavior` lists it alone.
 */
export const keys =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: KeyOptions<Input>,
  ): Behaviors.Keys.Route<Input, ParentMessage> => {
    const wrap = (id: string): ParentMessage =>
      declared.wrapper.make(Message.Focused({ id })) as unknown as ParentMessage
    const itemsOf = perInput(options.items)
    return Behaviors.Keys.route<Input, ParentMessage>('RovingTabindex', {
      on: [
        ...Behaviors.Keys.withShift('Home'),
        ...Behaviors.Keys.withShift('End'),
        ...arrowChords(args.orientation),
      ],
      handle: ({ key, modifiers, input }) => {
        const items = itemsOf(input)
        const current = input[declared.field].current
        const next = move(
          items.enabled,
          current === null ? -1 : items.indexOf(current),
          key,
          modifiers,
          {
            ...args,
            direction: options.direction?.(input) ?? 'ltr',
          },
        )
        const id = next === undefined ? undefined : items.ids[next]
        if (id === undefined) return Option.none()
        return Option.some(args.virtual ? wrap(id) : Behaviors.Keys.focus(id, wrap(id)))
      },
    })
  }

/**
 * Wires a placed `RovingTabindex` to the slots: the container's arrow, Home
 * and End keys (`keys`) focus the next item (synchronously, then dispatch), each item
 * gets `tabindex` 0 or -1 and reports `Focused` when focused. Under `virtual`
 * DOM focus never leaves the container: the key only dispatches, the
 * container carries `aria-activedescendant`, and items keep no `tabindex`.
 *
 * Every handled key is default-prevented. Nothing is written on dispose: the
 * attributes are data, so a view that no longer attaches this leaves no
 * `tabindex` behind.
 */
export const behavior = <Field extends string>(
  declared: Declared<typeof bundle, Field>,
  args: Args,
) => {
  function place<Slots, Input extends { readonly [K in Field]: Model }, ParentMessage>(
    bound: SlotView.Bound<Slots, Input, ParentMessage>,
  ): <Container extends keyof Slots & string, Item extends keyof Slots & string>(
    options: BehaviorOptions<Input, Slots, Container, Item>,
  ) => Behavior.NamedBehavior<
    Slots,
    Input,
    ParentMessage,
    A11y.ProvidedOn<Container, 'navigation'> | A11y.ProvidedOn<Item, 'focus-strategy'>
  >
  function place<Slots>(
    slots: SlotView.Unbound<Slots>,
  ): <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
    const slots = SlotView.boundSlots(given)
    return <Input extends { readonly [K in Field]: Model }, ParentMessage>(
      options: BehaviorOptions<Input, Slots>,
    ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
      const wrap = (id: string): ParentMessage =>
        declared.wrapper.make(Message.Focused({ id })) as unknown as ParentMessage
      const slice = (input: Input): Model => input[declared.field]
      const itemsOf = perInput(options.items)
      const keydown = Behaviors.Keys.attribute<Input, ParentMessage>(
        [keys<Field>(declared, args)<Input, ParentMessage>(options)],
        { slot: options.container, moveFocus: !args.virtual },
      )
      return Behavior.forSlots(slots)<Input, ParentMessage>(
        {
          [options.container]: Behavior.slot({
            requires: { capability: Capability.Interactive },
            provides: [A11y.Navigation],
            attributes: context => {
              const { input, h } = context
              const items = itemsOf(input)
              const stop = tabStop(items, slice(input).current)
              const stopId = stop === -1 ? undefined : items.ids[stop]
              return [
                keydown(context),
                // Virtual: DOM focus stays on the container, only the pointer moves.
                ...(args.virtual && stopId !== undefined ? [h.AriaActiveDescendant(stopId)] : []),
              ]
            },
          }),
          [options.item]: Behavior.slot({
            requires: { capability: Capability.Focusable },
            provides: [A11y.FocusStrategy],
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
              return itemAttributes(
                h,
                itemsOf(input),
                slice(input).current,
                item,
                args.virtual,
                wrap,
              )
            },
          }),
          // Keyed by values the caller chose; `forSlots` checks both keys exist.
        } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
        { name: 'RovingTabindex' },
      )
    }
  }
  return place
}
