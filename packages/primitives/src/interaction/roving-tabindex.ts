/**
 * One tab stop for a set of items (a toolbar, a tab list, a listbox): arrows
 * move focus between them, the rest stay out of the tab order. The current
 * item's id is the Model slice, so a reorder keeps the same item current and a
 * resumed page knows where focus was. Which item comes next is a pure
 * function of the items and the key; the Behavior wires it to the slots.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, type SlotItem } from 'foldkit-mixins'
import type { Declared } from 'foldkit-bundle'

export const Orientation = Schema.Literals(['vertical', 'horizontal', 'both'])
export type Orientation = typeof Orientation.Type

export const RovingTabindexModel = Schema.Struct({
  /** The current item's id, or `null` before any item has been focused. */
  current: Schema.NullOr(Schema.String),
})
export type RovingTabindexModel = typeof RovingTabindexModel.Type

export const RovingTabindexMessage = defineMessageUnion({
  /** An item became current: the user focused it, or a key moved there. */
  Focused: { id: Schema.String },
})
export type RovingTabindexMessage = typeof RovingTabindexMessage.Type

export const RovingTabindexArgs = Schema.Struct({
  orientation: Orientation,
  /** Wrap from the last enabled item to the first, and back. */
  loop: Schema.Boolean,
  /** Keep DOM focus on the container and point at the current item with
   *  `aria-activedescendant` instead of moving focus. */
  virtual: Schema.Boolean,
})
export type RovingTabindexArgs = typeof RovingTabindexArgs.Type

export const RovingTabindex = Bundle.make('RovingTabindex', {
  Model: RovingTabindexModel,
  Message: RovingTabindexMessage,
  args: RovingTabindexArgs,
  init: () => ({ model: { current: null } }),
  update: (_model, message) => ({ model: { current: message.id } }),
})

export type Direction = 'ltr' | 'rtl'

export interface MoveOptions {
  readonly orientation: Orientation
  readonly loop: boolean
  readonly direction: Direction
}

const isPlain = (modifiers: KeyboardModifiers): boolean =>
  !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey

/**
 * The index the key moves to from `current`, over the enabled indices only, or
 * `undefined` when the key is not a navigation key here. `current` may be
 * `-1` (nothing current yet): arrows then land on the first or last enabled
 * item. Under `rtl`, left and right swap.
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
export const tabStop = (items: Behaviors.Collection.Items<unknown>, current: string | null): number => {
  const index = current === null ? -1 : items.indexOf(current)
  if (index !== -1 && !items.isDisabled(index)) return index
  return items.enabled[0] ?? -1
}

export interface BehaviorOptions<Input, Slots> {
  /** The slot that receives the arrow keys. */
  readonly container: keyof Slots & string
  /** The slot rendered once per item; must carry the item's id (see `Behaviors.Collection`). */
  readonly item: keyof Slots & string
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
  /** Default `'ltr'`; return `'rtl'` to swap left and right. */
  readonly direction?: (input: Input) => Direction
}

const idSelector = (id: string): string => `[id="${id.replace(/["\\]/g, '\\$&')}"]`

/**
 * Wires a placed `RovingTabindex` to the slots: the container's arrow, Home
 * and End keys focus the next item (synchronously, then dispatch), each item
 * gets `tabindex` 0 or -1 and reports `Focused` when focused. Under `virtual`
 * DOM focus never leaves the container: the key only dispatches, the
 * container carries `aria-activedescendant`, and items keep no `tabindex`.
 *
 * Every handled key is default-prevented. Nothing is written on dispose: the
 * attributes are data, so a view that no longer attaches this leaves no
 * `tabindex` behind.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof RovingTabindex, Field>, args: RovingTabindexArgs) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: RovingTabindexModel }, Message>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, Message> => {
    const wrap = (id: string): Message =>
      declared.wrapper.make(RovingTabindexMessage.Focused({ id })) as unknown as Message
    const slice = (input: Input): RovingTabindexModel => input[declared.field]
    return Behavior.forSlots(slots)<Input, Message>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Interactive },
          attributes: ({ input, h }: { readonly input: Input; readonly h: HtmlBuilder<Message> }) => {
            const items = options.items(input)
            const current = slice(input).current
            const from = current === null ? -1 : items.indexOf(current)
            const direction = options.direction?.(input) ?? 'ltr'
            const stop = tabStop(items, current)
            const stopId = stop === -1 ? undefined : items.ids[stop]
            const target = (key: string, modifiers: KeyboardModifiers): string | undefined => {
              const next = move(items.enabled, from, key, modifiers, { ...args, direction })
              return next === undefined ? undefined : items.ids[next]
            }
            // Virtual: DOM focus stays on the container, only the pointer moves.
            if (args.virtual) {
              return [
                h.OnKeyDownPreventDefault((key, modifiers) =>
                  Option.map(Option.fromNullishOr(target(key, modifiers)), wrap),
                ),
                ...(stopId === undefined ? [] : [h.AriaActiveDescendant(stopId)]),
              ]
            }
            return [
              h.OnKeyDownFocus((key, modifiers) =>
                Option.map(Option.fromNullishOr(target(key, modifiers)), id => ({
                  focusSelector: idSelector(id),
                  message: wrap(id),
                })),
              ),
            ]
          },
        }),
        [options.item]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          attributes: ({
            input,
            h,
            item,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<Message>
            readonly item?: SlotItem
          }) => {
            if (item === undefined) return []
            const items = options.items(input)
            const id = item.id ?? items.ids[item.index]
            if (id === undefined) return []
            const isStop = tabStop(items, slice(input).current) === item.index
            return [
              ...(args.virtual ? [] : [h.Tabindex(isStop ? 0 : -1)]),
              h.OnFocus(wrap(id)),
            ]
          },
        }),
        // Keyed by values the caller chose; `forSlots` checks both keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'RovingTabindex' },
    )
  }
