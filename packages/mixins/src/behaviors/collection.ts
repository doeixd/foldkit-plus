/**
 * A collection is the parent's array, described once so a view and the
 * Behaviors on it agree about identity, order, and which items are disabled.
 * Render order is DOM order, so nothing observes the DOM; `of` is pure and the
 * Behavior only writes what the item context says.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Behavior from '../behavior.js'
import type { SlotItem } from '../contribution.js'
import { DiagnosticError } from '../diagnostics.js'

export interface Items<T> {
  readonly size: number
  /** In render order; unique. */
  readonly ids: ReadonlyArray<string>
  readonly at: (index: number) => T | undefined
  /** `-1` when no item has the id. */
  readonly indexOf: (id: string) => number
  readonly isDisabled: (index: number) => boolean
  /** Indices of the enabled items, in order. */
  readonly enabled: ReadonlyArray<number>
  /** The item context for `slots.x.attrs(base, item)`. */
  readonly slotItem: (index: number) => SlotItem
}

export interface Describe<T> {
  readonly id: (item: T, index: number) => string
  readonly disabled?: (item: T, index: number) => boolean
}

/** Describes `items` once. Two items with one id are refused, since an id is what
 *  `aria-activedescendant`, `aria-controls`, and a keyed row rely on. */
export const of = <T>(items: ReadonlyArray<T>, describe: Describe<T>): Items<T> => {
  const ids: Array<string> = []
  const indexById = new Map<string, number>()
  const disabled: Array<boolean> = []
  const enabled: Array<number> = []
  items.forEach((item, index) => {
    const id = describe.id(item, index)
    const seen = indexById.get(id)
    if (seen !== undefined) {
      throw new DiagnosticError({
        source: 'mixins',
        code: 'mixins:duplicate-item-id',
        severity: 'error',
        message: `Collection items ${seen} and ${index} share the id "${id}"`,
        details: { id, indices: [seen, index] },
      })
    }
    indexById.set(id, index)
    ids.push(id)
    const isDisabled = describe.disabled?.(item, index) ?? false
    disabled.push(isDisabled)
    if (!isDisabled) enabled.push(index)
  })
  const size = items.length
  return Object.freeze({
    size,
    ids: Object.freeze(ids),
    at: (index: number) => items[index],
    indexOf: (id: string) => indexById.get(id) ?? -1,
    isDisabled: (index: number) => disabled[index] ?? false,
    enabled: Object.freeze(enabled),
    slotItem: (index: number): SlotItem => ({ index, id: ids[index] ?? String(index), count: size }),
  })
}

export interface BehaviorOptions<Input, Slots> {
  /** The slot rendered once per item. */
  readonly item: keyof Slots & string
  /** Reads the described items from the view's input. */
  readonly items: (input: Input) => Items<unknown>
  /** Write `aria-posinset` and `aria-setsize` on each item. Default `false`. */
  readonly posInSet?: boolean
  /** Write `id` on each item, from its described id. Default `true`. */
  readonly ids?: boolean
}

/**
 * Writes each item's identity and position: `id` from the described id,
 * `aria-disabled` for a disabled item, and `aria-posinset` and `aria-setsize`
 * on request. Reads the item context the view passes to `attrs`; with none it
 * contributes nothing, so a slot rendered once is left alone.
 */
export const behavior =
  <Slots>(slots: Slots) =>
  <Input, Message>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, Message> =>
    Behavior.forSlots(slots)<Input, Message>(
      {
        [options.item]: Behavior.slot({
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
            return [
              ...(options.ids === false || id === undefined ? [] : [h.Id(id)]),
              ...(items.isDisabled(item.index) ? [h.AriaDisabled(true)] : []),
              ...(options.posInSet === true
                ? [h.AriaPosinset(item.index + 1), h.AriaSetsize(item.count ?? items.size)]
                : []),
            ]
          },
        }),
        // The spec is keyed by a value (`options.item`), which the mapped
        // BehaviorSpec type cannot express; `forSlots` still checks the key.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'Collection' },
    )
