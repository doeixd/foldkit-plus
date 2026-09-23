/**
 * Selection over a set of items: which ids are selected, and the anchor a
 * range extends from. `mode` is `'single'` (a click replaces), `'multiple'`
 * (a click toggles), or `'none'`. Single mode keeps one item selected unless
 * `allowEmpty`. A range needs the items' order, which the view knows and the
 * Bundle does not, so `Ranged` carries it. The Behavior says the state in
 * ARIA and wires a plain click; a Shift range comes from `Press`, whose
 * `Pressed` carries `shiftKey`.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, type SlotItem } from 'foldkit-mixins'

export const Mode = Schema.Literals(['single', 'multiple', 'none'])
export type Mode = typeof Mode.Type

export const Model = Schema.Struct({
  /** In selection order. */
  selected: Schema.Array(Schema.String),
  /** Where the last plain selection happened; a range extends from it. */
  anchor: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A plain activation: replaces in single mode, toggles in multiple mode. */
  Activated: { id: Schema.String },
  /** A Shift activation: selects everything between the anchor and `id` in `order`. */
  Ranged: { id: Schema.String, order: Schema.Array(Schema.String) },
  Replaced: { ids: Schema.Array(Schema.String) },
  Cleared: {},
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  mode: Mode,
  /** In single mode, whether activating the selected item deselects it. */
  allowEmpty: Schema.Boolean,
})
export type Args = typeof Args.Type

const without = (ids: ReadonlyArray<string>, id: string) => ids.filter(other => other !== id)

/** The ids between `from` and `to` in `order`, inclusive, in `order`'s order. */
export const between = (
  order: ReadonlyArray<string>,
  from: string | null,
  to: string,
): ReadonlyArray<string> => {
  const end = order.indexOf(to)
  if (end === -1) return []
  const start = from === null ? -1 : order.indexOf(from)
  if (start === -1) return [to]
  return order.slice(Math.min(start, end), Math.max(start, end) + 1)
}

export const bundle = Bundle.make('Selection', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { selected: [], anchor: null } }),
  update: (model, message, args) =>
    Message.match(message, {
      Activated: ({ id }) => {
        if (args.mode === 'none') return { model }
        const isSelected = model.selected.includes(id)
        if (args.mode === 'single') {
          return isSelected
            ? args.allowEmpty
              ? { model: { selected: [], anchor: id } }
              : { model }
            : { model: { selected: [id], anchor: id } }
        }
        return {
          model: {
            selected: isSelected ? without(model.selected, id) : [...model.selected, id],
            anchor: id,
          },
        }
      },
      Ranged: ({ id, order }) => {
        if (args.mode !== 'multiple') return { model }
        const range = between(order, model.anchor, id)
        const kept = model.selected.filter(other => !range.includes(other))
        return { model: { selected: [...kept, ...range], anchor: model.anchor ?? id } }
      },
      Replaced: ({ ids }) => ({
        model: { selected: args.mode === 'none' ? [] : [...new Set(ids)], anchor: model.anchor },
      }),
      Cleared: () => ({ model: { selected: [], anchor: model.anchor } }),
    }),
})

export interface BehaviorOptions<Input, Slots> {
  /** The slot holding the items, for `aria-multiselectable`. */
  readonly container?: keyof Slots & string
  /** The slot rendered once per item; must carry the item's id. */
  readonly item: keyof Slots & string
  readonly items: (input: Input) => Behaviors.Collection.Items<unknown>
  /** Wire a plain click on each item to `Activated`. Default `true`; turn off
   *  when `Press` or the view owns the click. */
  readonly click?: boolean
}

/**
 * Writes `aria-selected` on each item from the placed slice, and
 * `aria-multiselectable` on the container in multiple mode; wires `OnClick`
 * to `Activated` unless told not to. A disabled item gets no click.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const wrap = (message: Message): ParentMessage =>
      declared.wrapper.make(message) as unknown as ParentMessage
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        ...(options.container === undefined
          ? {}
          : {
              [options.container]: Behavior.slot({
                requires: { capability: Capability.Container },
                attributes: ({ h }: { readonly h: HtmlBuilder<ParentMessage> }) => [
                  h.AriaMultiSelectable(args.mode === 'multiple'),
                ],
              }),
            }),
        [options.item]: Behavior.slot({
          requires: { capability: Capability.Interactive },
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
            const items = options.items(input)
            const id = item.id ?? items.ids[item.index]
            if (id === undefined) return []
            const clickable =
              options.click !== false && args.mode !== 'none' && !items.isDisabled(item.index)
            return [
              h.AriaSelected(input[declared.field].selected.includes(id)),
              ...(clickable ? [h.OnClick(wrap(Message.Activated({ id })))] : []),
            ]
          },
        }),
        // Keyed by values the caller chose; `forSlots` checks the keys exist.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Selection' },
    )
  }
